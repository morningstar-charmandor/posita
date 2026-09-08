import { createHash } from 'node:crypto'
import {
  isProviderMailMessageV1,
  isProviderMailThreadV1,
  type MailRecipientV1,
  type MailboxIdentityV1,
  type ProviderMailMessageV1,
  type ProviderMailThreadV1
} from '../../../shared/providerMail'
import type { GoogleMessageNormalizationFailureStage } from './googleMessageBatchDiagnostics'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const bounded = (value: unknown, maximum: number): string | undefined =>
  typeof value === 'string' && value.length <= maximum ? value : undefined

// Bound recursion before either external-body discovery or canonical parsing.
// These are local resource limits, not claims about Gmail's accepted MIME limits.
const boundedMimeTree = (payload: JsonRecord): boolean => {
  const pending: Array<{ part: unknown; depth: number }> = [{ part: payload, depth: 0 }]
  let visited = 0
  while (pending.length > 0) {
    const { part, depth } = pending.pop()!
    if (++visited > 2048 || depth > 32) return false
    if (isRecord(part) && Array.isArray(part.parts)) {
      if (part.parts.length + pending.length + visited > 2048) return false
      for (const child of part.parts) pending.push({ part: child, depth: depth + 1 })
    }
  }
  return true
}

const localId = (kind: 'message' | 'thread', accountId: string, providerId: string): string =>
  `${kind === 'message' ? 'gm' : 'gt'}_${createHash('sha256')
    .update(`${accountId}\u0000${providerId}`)
    .digest('base64url')}`

const decodeBase64Url = (
  value: unknown,
  fail: (stage: GoogleMessageNormalizationFailureStage) => undefined,
  maximumBytes = 2_000_000
): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > Math.ceil(maximumBytes * 4 / 3) + 4 ||
      !/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return fail('gmail-message-base64')
  const unpadded = value.replace(/=+$/, '')
  const remainder = unpadded.length % 4
  if (remainder === 1 || (value !== unpadded &&
      (value.length % 4 !== 0 || value.length - unpadded.length !== 4 - remainder))) {
    return fail('gmail-message-base64')
  }
  try {
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.byteLength > maximumBytes || bytes.toString('base64url') !== unpadded) {
      return fail('gmail-message-base64')
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail('gmail-message-text-decoding')
  }
}

const headersOf = (part: JsonRecord): Map<string, string[]> => {
  const headers = new Map<string, string[]>()
  if (!Array.isArray(part.headers)) return headers
  for (const item of part.headers) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string' ||
        item.name.length > 256 || item.value.length > 16_384) continue
    const name = item.name.toLowerCase()
    headers.set(name, [...(headers.get(name) ?? []), item.value])
  }
  return headers
}

const splitAddresses = (value: string): string[] => {
  const parts: string[] = []
  let quoted = false
  let angleDepth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"' && value[index - 1] !== '\\') quoted = !quoted
    else if (!quoted && character === '<') angleDepth += 1
    else if (!quoted && character === '>') angleDepth = Math.max(0, angleDepth - 1)
    else if (!quoted && angleDepth === 0 && character === ',') {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}

const mailbox = (value: string): MailboxIdentityV1 | undefined => {
  const trimmed = value.trim()
  const angle = /^(.*)<([^<>]+)>$/.exec(trimmed)
  const address = (angle?.[2] ?? trimmed).trim().replace(/^mailto:/i, '')
  if (address.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(address)) return undefined
  const rawName = angle?.[1]?.trim().replace(/^"|"$/g, '')
  if (rawName !== undefined && rawName.length > 256) return undefined
  return rawName === undefined || rawName.length === 0
    ? { address }
    : { address, displayName: rawName }
}

const mailboxes = (values: readonly string[]): MailboxIdentityV1[] | undefined => {
  const parsed: MailboxIdentityV1[] = []
  for (const value of values.flatMap(splitAddresses)) {
    if (value.trim().length === 0) continue
    const item = mailbox(value)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

interface ParsedPart {
  plainParts: string[]
  htmlParts: string[]
  attachments: ProviderMailMessageV1['attachments']
  invalid?: GoogleMessageNormalizationFailureStage
}

const codePoint = (value: number): string =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
    ? String.fromCodePoint(value)
    : '\ufffd'

const htmlToPlainText = (html: string): string => html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
  .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_match, value: string) => codePoint(Number(value)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) =>
    codePoint(Number.parseInt(value, 16)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n\s*\n+/g, '\n\n')
  .trim()

const parsePart = (
  value: unknown,
  result: ParsedPart,
  externalBodies: ReadonlyMap<string, string>
): void => {
  if (!isRecord(value)) return
  const mimeType = bounded(value.mimeType, 256) ?? 'application/octet-stream'
  const filename = bounded(value.filename, 1024) ?? ''
  const body = isRecord(value.body) ? value.body : {}
  const attachmentId = bounded(body.attachmentId, 512)
  const validSize = Number.isSafeInteger(body.size) && (body.size as number) >= 0
  const size = validSize ? body.size as number : 0
  if (attachmentId !== undefined && filename.length > 0) {
    if (result.attachments.length >= 256) {
      result.invalid = 'gmail-message-mime'
      return
    }
    if (!validSize) {
      result.invalid = 'gmail-message-mime'
      return
    }
    const headers = headersOf(value)
    const disposition = headers.get('content-disposition')?.[0]?.toLowerCase() ?? ''
    const contentId = headers.get('content-id')?.[0]?.replace(/^<|>$/g, '').slice(0, 512)
    result.attachments.push({
      providerAttachmentId: attachmentId,
      filename,
      mediaType: mimeType,
      sizeBytes: size,
      inline: disposition.startsWith('inline'),
      ...(contentId === undefined || contentId.length === 0 ? {} : { contentId })
    })
  } else if (mimeType.toLowerCase() === 'text/plain' ||
      mimeType.toLowerCase() === 'text/html') {
    const encodedBody = attachmentId !== undefined &&
        (body.data === undefined || body.data === '')
      ? externalBodies.get(attachmentId)
      : body.data
    const decoded = decodeBase64Url(encodedBody, (stage) => {
      result.invalid ??= stage
      return undefined
    })
    if (decoded !== undefined) {
      if (mimeType.toLowerCase() === 'text/plain') result.plainParts.push(decoded)
      else result.htmlParts.push(decoded)
    }
  }
  if (Array.isArray(value.parts)) {
    for (const part of value.parts) parsePart(part, result, externalBodies)
  }
}

export const googleExternalTextBodyIds = (value: unknown): string[] => {
  const ids: string[] = []
  const visit = (part: unknown): void => {
    if (!isRecord(part)) return
    const mimeType = bounded(part.mimeType, 256)?.toLowerCase()
    const filename = bounded(part.filename, 1024) ?? ''
    const body = isRecord(part.body) ? part.body : undefined
    if ((mimeType === 'text/plain' || mimeType === 'text/html') && filename.length === 0 &&
        body !== undefined && (body.data === undefined || body.data === '') &&
        safeAttachmentId(body.attachmentId)) {
      ids.push(body.attachmentId)
    }
    if (Array.isArray(part.parts)) part.parts.forEach(visit)
  }
  if (isRecord(value) && isRecord(value.payload) && boundedMimeTree(value.payload)) visit(value.payload)
  return [...new Set(ids)]
}

const safeAttachmentId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 512

export interface NormalizedGoogleMessage {
  message: ProviderMailMessageV1
  thread: ProviderMailThreadV1
  historyId: string
}

export const normalizeGoogleMessage = (
  value: unknown,
  accountId: string,
  externalBodies: ReadonlyMap<string, string> = new Map(),
  onFailure: (stage: GoogleMessageNormalizationFailureStage) => void = () => undefined
): NormalizedGoogleMessage | undefined => {
  const fail = (stage: GoogleMessageNormalizationFailureStage): undefined => {
    try { onFailure(stage) } catch { /* Diagnostics never affect parsing. */ }
    return undefined
  }
  if (!isRecord(value)) return fail('gmail-message-identity')
  const providerMessageId = bounded(value.id, 512)
  const providerThreadId = bounded(value.threadId, 512)
  const historyId = bounded(value.historyId, 16_384)
  const internalDate = bounded(value.internalDate, 32)
  if (providerMessageId === undefined || providerMessageId.length === 0 ||
      providerThreadId === undefined || providerThreadId.length === 0 ||
      historyId === undefined || historyId.length === 0 || internalDate === undefined ||
      !/^\d+$/.test(internalDate)) return fail('gmail-message-identity')
  const received = new Date(Number(internalDate))
  if (!Number.isFinite(received.getTime())) return fail('gmail-message-identity')
  const payload = isRecord(value.payload) ? value.payload : undefined
  if (payload === undefined || !boundedMimeTree(payload)) return fail('gmail-message-mime')
  const headers = headersOf(payload)
  const explicitSenders = mailboxes(headers.get('sender') ?? [])
  const authors = mailboxes(headers.get('from') ?? [])
  if (explicitSenders === undefined || authors === undefined || explicitSenders.length > 1) {
    return fail('gmail-message-headers')
  }
  const sender = explicitSenders[0] ?? (authors.length === 1 ? authors[0] : undefined)
  if (sender === undefined) return fail('gmail-message-headers')
  const expectedExternalBodies = googleExternalTextBodyIds(value)
  if (expectedExternalBodies.some((id) => !externalBodies.has(id))) return fail('gmail-message-mime')
  const parsed: ParsedPart = { plainParts: [], htmlParts: [], attachments: [] }
  parsePart(payload, parsed, externalBodies)
  if (parsed.invalid) return fail(parsed.invalid)
  const snippet = bounded(value.snippet, 2_000_000) ?? ''
  const sentHeader = headers.get('date')?.[0]
  const sent = sentHeader === undefined ? received : new Date(sentHeader)
  const sentAt = Number.isFinite(sent.getTime()) ? sent.toISOString() : received.toISOString()
  const messageId = localId('message', accountId, providerMessageId)
  const threadId = localId('thread', accountId, providerThreadId)
  const to = mailboxes(headers.get('to') ?? [])
  const cc = mailboxes(headers.get('cc') ?? [])
  const bcc = mailboxes(headers.get('bcc') ?? [])
  const replyTo = mailboxes(headers.get('reply-to') ?? [])
  if (to === undefined || cc === undefined || bcc === undefined || replyTo === undefined) {
    return fail('gmail-message-headers')
  }
  const recipients: MailRecipientV1[] = [
    ...to.map((item) => ({ role: 'to' as const, mailbox: item })),
    ...cc.map((item) => ({ role: 'cc' as const, mailbox: item })),
    ...bcc.map((item) => ({ role: 'bcc' as const, mailbox: item })),
    ...replyTo.map((item) => ({
      role: 'reply-to' as const,
      mailbox: item
    }))
  ]
  if (recipients.length > 256) return fail('gmail-message-headers')
  const labels = Array.isArray(value.labelIds)
    ? [...new Set(value.labelIds.filter((item): item is string =>
      typeof item === 'string' && item.length > 0 && item.length <= 256))]
    : []
  if (labels.length > 256) return fail('gmail-message-contract')
  const plainSource = parsed.plainParts.length > 0
    ? parsed.plainParts.join('\n')
    : parsed.htmlParts.map(htmlToPlainText).join('\n')
  if (plainSource.length > 2_000_000) return fail('gmail-message-contract')
  const plain = plainSource || snippet
  const message: ProviderMailMessageV1 = {
    version: 1,
    id: messageId,
    threadId,
    accountId,
    source: { provider: 'google', accountId, providerMessageId, providerThreadId },
    sender,
    recipients,
    sentAt,
    receivedAt: received.toISOString(),
    subject: headers.get('subject')?.[0] ?? '',
    body: { plain },
    labels,
    isRead: !labels.includes('UNREAD'),
    attachments: parsed.attachments
  }
  const thread: ProviderMailThreadV1 = {
    version: 1,
    id: threadId,
    accountId,
    provider: 'google',
    providerThreadId,
    messageIds: [messageId]
  }
  return isProviderMailMessageV1(message) && isProviderMailThreadV1(thread)
    ? { message, thread, historyId }
    : fail('gmail-message-contract')
}
