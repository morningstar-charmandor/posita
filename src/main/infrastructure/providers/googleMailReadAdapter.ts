import {
  ProviderMailAdapterError,
  SYNC_BATCH_SIZE,
  isProviderMailBatchRequestV1,
  isProviderMailBatchV2,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV2
} from '../../application/mailSync'
import { MAX_SECRET_LENGTH } from '../../application/secretVault'
import type { ProviderMailThreadV1 } from '../../../shared/providerMail'
import {
  googleExternalTextBodyIds,
  normalizeGoogleMessage,
  type NormalizedGoogleMessage
} from './googleMailNormalizer'

const GMAIL_API_ORIGIN = 'https://gmail.googleapis.com'
const MAX_LIST_RESPONSE_BYTES = 512 * 1024
const MAX_MESSAGE_RESPONSE_BYTES = 2_800_000
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_PARALLEL_MESSAGE_READS = 4
type NotFoundMeaning = 'provider-failure' | 'invalid-cursor' | 'missing-message'

type JsonRecord = Record<string, unknown>

export interface GoogleAccessTokenSource {
  getAccessToken(accountId: string): Promise<string | undefined>
}

export type GoogleMailFetch = (
  url: string,
  init: {
    method: 'GET'
    headers: Readonly<Record<string, string>>
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<{ status: number; body: ReadableStream<Uint8Array> | null }>

type GoogleCursor =
  | { version: 1; mode: 'full'; receivedAfter: string; pageToken: string; historyId: string }
  | { version: 1; mode: 'history'; historyId: string; pageToken?: string; offset?: number }

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const safeString = (value: unknown, maximum = 16_384): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum

const safeProviderId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\u0021-\u007E]{1,512}$/.test(value)

const encodeCursor = (cursor: GoogleCursor): string =>
  `gmail-v1.${Buffer.from(JSON.stringify(cursor)).toString('base64url')}`

const decodeCursor = (value: string): GoogleCursor | undefined => {
  if (!value.startsWith('gmail-v1.') || value.length > 16_384) return undefined
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value.slice(9), 'base64url').toString('utf8'))
    if (!isRecord(decoded) || decoded.version !== 1 ||
        (decoded.mode !== 'full' && decoded.mode !== 'history') ||
        !safeString(decoded.historyId) || !/^\d+$/.test(decoded.historyId)) return undefined
    if (decoded.mode === 'full') {
      return hasOnlyKeys(decoded, [
        'version', 'mode', 'receivedAfter', 'pageToken', 'historyId'
      ]) && safeString(decoded.receivedAfter, 64) && Number.isFinite(Date.parse(decoded.receivedAfter)) &&
        safeString(decoded.pageToken)
        ? {
          version: 1,
          mode: 'full',
          receivedAfter: decoded.receivedAfter,
          pageToken: decoded.pageToken,
          historyId: decoded.historyId
        }
        : undefined
    }
    const pageTokenKey = decoded.pageToken === undefined ? [] : ['pageToken']
    const offsetKey = decoded.offset === undefined ? [] : ['offset']
    const keys = ['version', 'mode', 'historyId', ...pageTokenKey, ...offsetKey]
    return hasOnlyKeys(decoded, keys) &&
      (decoded.pageToken === undefined || safeString(decoded.pageToken)) &&
      (decoded.offset === undefined || (Number.isSafeInteger(decoded.offset) &&
        (decoded.offset as number) > 0 && (decoded.offset as number) <= 5_000))
      ? {
        version: 1,
        mode: 'history',
        historyId: decoded.historyId,
        ...(decoded.pageToken === undefined ? {} : { pageToken: decoded.pageToken }),
        ...(decoded.offset === undefined ? {} : { offset: decoded.offset as number })
      }
      : undefined
  } catch {
    return undefined
  }
}

const failure = (
  code: ConstructorParameters<typeof ProviderMailAdapterError>[0],
  retryable: boolean,
  cause?: unknown
): ProviderMailAdapterError => new ProviderMailAdapterError(
  code,
  code === 'AUTHENTICATION_EXPIRED'
    ? 'The Google authorization has expired.'
    : code === 'PERMISSION_REVOKED'
      ? 'Google mail permission is no longer available.'
      : code === 'QUOTA_EXHAUSTED'
        ? 'Google mail access is temporarily rate limited.'
        : code === 'INVALID_CURSOR'
          ? 'The Google mail history checkpoint is no longer available.'
          : code === 'MALFORMED_PAYLOAD'
            ? 'Google returned an invalid mail response.'
            : 'Google mail is temporarily unavailable.',
  retryable,
  { cause }
)

const readBody = async (
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number
): Promise<string> => {
  if (body === null) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.byteLength
      if (length > maximumBytes) {
        await reader.cancel()
        throw failure('MALFORMED_PAYLOAD', false)
      }
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw failure('MALFORMED_PAYLOAD', false, error)
  }
}

const quotaReason = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.error) || !Array.isArray(value.error.errors)) return false
  return value.error.errors.some((item) => isRecord(item) &&
    (item.reason === 'rateLimitExceeded' || item.reason === 'userRateLimitExceeded' ||
      item.reason === 'dailyLimitExceeded'))
}

export class GoogleMailReadAdapter implements ProviderMailAdapter {
  constructor(
    private readonly tokens: GoogleAccessTokenSource,
    private readonly fetchRequest: GoogleMailFetch = (url, init) => fetch(url, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
  }

  async fetchBatch(request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
    if (!isProviderMailBatchRequestV1(request)) throw failure('MALFORMED_PAYLOAD', false)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    let token: string | undefined
    try {
      token = await this.tokens.getAccessToken(request.accountId)
    } catch (error) {
      throw failure('PROVIDER_UNAVAILABLE', true, error)
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (token === undefined) throw failure('AUTHENTICATION_EXPIRED', false)
    if (token.length === 0 || token.length > MAX_SECRET_LENGTH) {
      throw failure('AUTHENTICATION_EXPIRED', false)
    }
    const cursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor)
    if (request.cursor !== undefined && cursor === undefined) throw failure('INVALID_CURSOR', true)
    return cursor?.mode === 'history'
      ? this.fetchHistory(request, cursor, token, signal)
      : this.fetchFull(request, cursor, token, signal)
  }

  private async fetchFull(
    request: ProviderMailBatchRequestV1,
    cursor: Extract<GoogleCursor, { mode: 'full' }> | undefined,
    token: string,
    signal: AbortSignal
  ): Promise<ProviderMailBatchV2> {
    const receivedAfter = cursor?.receivedAfter ?? request.receivedAfter
    if (receivedAfter === undefined) throw failure('INVALID_CURSOR', true)
    let historyId = cursor?.historyId
    if (historyId === undefined) {
      const profile = await this.getJson('/gmail/v1/users/me/profile', token, signal,
        MAX_LIST_RESPONSE_BYTES)
      historyId = isRecord(profile) && safeString(profile.historyId) && /^\d+$/.test(profile.historyId)
        ? profile.historyId
        : undefined
      if (historyId === undefined) throw failure('MALFORMED_PAYLOAD', false)
    }
    const query = new URLSearchParams({
      maxResults: String(SYNC_BATCH_SIZE),
      q: `after:${Math.floor(Date.parse(receivedAfter) / 1000)}`,
      includeSpamTrash: 'false',
      ...(cursor === undefined ? {} : { pageToken: cursor.pageToken })
    })
    const listed = await this.getJson(`/gmail/v1/users/me/messages?${query}`, token, signal,
      MAX_LIST_RESPONSE_BYTES)
    if (!isRecord(listed) || (listed.messages !== undefined && !Array.isArray(listed.messages)) ||
        (listed.nextPageToken !== undefined && !safeString(listed.nextPageToken))) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const ids = (listed.messages ?? []).map((item) =>
      isRecord(item) && safeProviderId(item.id) ? item.id : undefined)
    if (ids.length > SYNC_BATCH_SIZE || ids.some((id) => id === undefined) ||
        new Set(ids).size !== ids.length) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const { loaded: normalized, missing } = await this.loadMessagesAllowMissing(
      ids as string[],
      request.accountId,
      token,
      signal
    )
    const nextCursor = listed.nextPageToken === undefined
      ? encodeCursor({ version: 1, mode: 'history', historyId })
      : encodeCursor({
        version: 1,
        mode: 'full',
        receivedAfter,
        pageToken: listed.nextPageToken,
        historyId
      })
    return this.batch(request, normalized, missing, nextCursor, listed.nextPageToken === undefined)
  }

  private async fetchHistory(
    request: ProviderMailBatchRequestV1,
    cursor: Extract<GoogleCursor, { mode: 'history' }>,
    token: string,
    signal: AbortSignal
  ): Promise<ProviderMailBatchV2> {
    const query = new URLSearchParams({
      startHistoryId: cursor.historyId,
      maxResults: String(SYNC_BATCH_SIZE),
      ...(cursor.pageToken === undefined ? {} : { pageToken: cursor.pageToken })
    })
    const history = await this.getJson(`/gmail/v1/users/me/history?${query}`, token, signal,
      MAX_LIST_RESPONSE_BYTES, 'invalid-cursor')
    if (!isRecord(history) || !safeString(history.historyId) || !/^\d+$/.test(history.historyId) ||
        (history.history !== undefined && !Array.isArray(history.history)) ||
        (history.nextPageToken !== undefined && !safeString(history.nextPageToken))) {
      throw failure('MALFORMED_PAYLOAD', false)
    }
    const states = new Map<string, 'load' | 'delete'>()
    for (const record of history.history ?? []) {
      if (!isRecord(record)) throw failure('MALFORMED_PAYLOAD', false)
      for (const [field, state] of [
        ['messagesAdded', 'load'], ['labelsAdded', 'load'], ['labelsRemoved', 'load'],
        ['messagesDeleted', 'delete']
      ] as const) {
        if (record[field] === undefined) continue
        if (!Array.isArray(record[field])) throw failure('MALFORMED_PAYLOAD', false)
        for (const event of record[field]) {
          const id = isRecord(event) && isRecord(event.message) && safeProviderId(event.message.id)
            ? event.message.id
            : undefined
          if (id === undefined) throw failure('MALFORMED_PAYLOAD', false)
          states.set(id, state)
        }
      }
    }
    if (states.size > 5_000) throw failure('MALFORMED_PAYLOAD', false)
    const offset = cursor.offset ?? 0
    const changes = [...states]
    if (offset > changes.length) throw failure('INVALID_CURSOR', true)
    const selected = changes.slice(offset, offset + SYNC_BATCH_SIZE)
    const loadIds = selected.flatMap(([id, state]) => state === 'load' ? [id] : [])
    const deleted = selected.flatMap(([id, state]) => state === 'delete' ? [id] : [])
    const { loaded, missing } = await this.loadMessagesAllowMissing(
      loadIds,
      request.accountId,
      token,
      signal
    )
    const nextOffset = offset + selected.length
    const hasMoreInPage = nextOffset < changes.length
    const complete = !hasMoreInPage && history.nextPageToken === undefined
    const nextCursor = hasMoreInPage
      ? encodeCursor({
        version: 1,
        mode: 'history',
        historyId: cursor.historyId,
        ...(cursor.pageToken === undefined ? {} : { pageToken: cursor.pageToken }),
        offset: nextOffset
      })
      : encodeCursor({
        version: 1,
        mode: 'history',
        historyId: complete ? history.historyId : cursor.historyId,
        ...(complete ? {} : { pageToken: history.nextPageToken })
      })
    return this.batch(request, loaded, [...deleted, ...missing], nextCursor, complete)
  }

  private batch(
    request: ProviderMailBatchRequestV1,
    normalized: NormalizedGoogleMessage[],
    deletedProviderMessageIds: string[],
    nextCursor: string,
    complete: boolean
  ): ProviderMailBatchV2 {
    const threads = new Map<string, ProviderMailThreadV1>()
    for (const item of normalized) {
      const existing = threads.get(item.thread.providerThreadId)
      threads.set(item.thread.providerThreadId, existing === undefined
        ? item.thread
        : { ...existing, messageIds: [...existing.messageIds, item.message.id] })
    }
    const batch: ProviderMailBatchV2 = {
      version: 2,
      accountId: request.accountId,
      provider: 'google',
      messages: normalized.map((item) => item.message),
      threads: [...threads.values()],
      deletedProviderMessageIds: [...new Set(deletedProviderMessageIds)],
      nextCursor,
      complete
    }
    if (!isProviderMailBatchV2(batch)) throw failure('MALFORMED_PAYLOAD', false)
    return batch
  }

  private async loadMessagesAllowMissing(
    ids: string[], accountId: string, token: string, signal: AbortSignal
  ): Promise<{ loaded: NormalizedGoogleMessage[]; missing: string[] }> {
    const loaded: NormalizedGoogleMessage[] = []
    const missing: string[] = []
    for (let offset = 0; offset < ids.length; offset += MAX_PARALLEL_MESSAGE_READS) {
      const group = ids.slice(offset, offset + MAX_PARALLEL_MESSAGE_READS)
      const values = await Promise.all(group.map(async (id) => {
        try {
          const value = await this.getJson(
            `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=FULL`,
            token,
            signal,
            MAX_MESSAGE_RESPONSE_BYTES,
            'missing-message'
          )
          const textBodyIds = googleExternalTextBodyIds(value)
          if (textBodyIds.length > 16) throw failure('MALFORMED_PAYLOAD', false)
          const externalBodies = new Map<string, string>()
          for (const attachmentId of textBodyIds) {
            const attachment = await this.getJson(
              `/gmail/v1/users/me/messages/${encodeURIComponent(id)}/attachments/${
                encodeURIComponent(attachmentId)}`,
              token,
              signal,
              MAX_MESSAGE_RESPONSE_BYTES
            )
            if (!isRecord(attachment) || !safeString(attachment.data, 2_700_000)) {
              throw failure('MALFORMED_PAYLOAD', false)
            }
            externalBodies.set(attachmentId, attachment.data)
          }
          const normalized = normalizeGoogleMessage(value, accountId, externalBodies)
          if (normalized === undefined || normalized.message.source.providerMessageId !== id) {
            throw failure('MALFORMED_PAYLOAD', false)
          }
          return normalized
        } catch (error) {
          if (error instanceof GoogleMissingMessageError) return undefined
          throw error
        }
      }))
      values.forEach((value, index) => value === undefined
        ? missing.push(group[index]!)
        : loaded.push(value))
    }
    return { loaded, missing }
  }

  private async getJson(
    path: string,
    token: string,
    signal: AbortSignal,
    maximumBytes: number,
    notFoundMeaning: NotFoundMeaning = 'provider-failure'
  ): Promise<unknown> {
    let response: Awaited<ReturnType<GoogleMailFetch>>
    try {
      response = await this.fetchRequest(`${GMAIL_API_ORIGIN}${path}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      })
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof ProviderMailAdapterError) throw error
      throw failure('PROVIDER_UNAVAILABLE', true, error)
    }
    if (response.status === 404) {
      try { await response.body?.cancel() } catch { /* Preserve classification. */ }
      if (notFoundMeaning === 'invalid-cursor') throw failure('INVALID_CURSOR', true)
      if (notFoundMeaning === 'missing-message') throw new GoogleMissingMessageError()
      throw failure('PROVIDER_UNAVAILABLE', false)
    }
    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      try { await response.body?.cancel() } catch { /* Preserve classification. */ }
      throw failure('MALFORMED_PAYLOAD', false)
    }
    if (response.status !== 200) {
      const text = await readBody(response.body, MAX_LIST_RESPONSE_BYTES)
      let payload: unknown
      try { payload = text.length === 0 ? undefined : JSON.parse(text) } catch { /* Safe class below. */ }
      if (response.status === 401) throw failure('AUTHENTICATION_EXPIRED', false)
      if (response.status === 429 || quotaReason(payload)) throw failure('QUOTA_EXHAUSTED', true)
      if (response.status === 403) throw failure('PERMISSION_REVOKED', false)
      throw failure('PROVIDER_UNAVAILABLE', response.status >= 500)
    }
    const text = await readBody(response.body, maximumBytes)
    try {
      return JSON.parse(text)
    } catch (error) {
      throw failure('MALFORMED_PAYLOAD', false, error)
    }
  }
}

class GoogleMissingMessageError extends Error {}
