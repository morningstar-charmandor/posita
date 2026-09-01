import {
  isLiveMailAccountDisplayIdentityV1,
  type LiveMailAccountDisplayIdentityV1
} from './liveMail.ts'
import type { MailRecipientRole, MailboxIdentityV1 } from './providerMail'

export const LIVE_MAIL_DETAIL_BODY_LIMIT = 128 * 1024

export interface LiveMailMessageDetailRequestV1 {
  version: 1
  accountId: string
  messageId: string
}

export interface LiveMailMessageDetailAttachmentV1 {
  filename: string
  mediaType: string
  sizeBytes: number
  inline: boolean
}

export interface LiveMailMessageDetailRecipientV1 {
  role: MailRecipientRole
  mailbox: MailboxIdentityV1
}

export interface LiveMailMessageDetailV1 {
  version: 1
  accountId: string
  messageId: string
  threadId: string
  provider: 'google'
  accountIdentity: LiveMailAccountDisplayIdentityV1
  sender: MailboxIdentityV1
  recipients: LiveMailMessageDetailRecipientV1[]
  sentAt: string
  receivedAt: string
  subject: string
  body: {
    plainText: string
    truncated: boolean
  }
  isRead: boolean
  attachments: LiveMailMessageDetailAttachmentV1[]
}

export type LiveMailMessageDetailResultV1 =
  | {
      version: 1
      status: 'found'
      detail: LiveMailMessageDetailV1
    }
  | {
      version: 1
      status: 'missing'
      accountId: string
      messageId: string
    }

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAILBOX_PATTERN = /^[^\s@]+@[^\s@]+$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/

const isId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && TIMESTAMP_PATTERN.test(value) &&
  Number.isFinite(Date.parse(value))

const isMailbox = (value: unknown): value is MailboxIdentityV1 => {
  if (!isRecord(value)) return false
  const name = value.displayName === undefined ? [] : ['displayName']
  return hasOnlyKeys(value, ['address', ...name]) &&
    typeof value.address === 'string' && value.address.length <= 320 &&
    MAILBOX_PATTERN.test(value.address) &&
    (value.displayName === undefined ||
      (typeof value.displayName === 'string' && value.displayName.length > 0 &&
        value.displayName.length <= 256))
}

const isRecipient = (value: unknown): value is LiveMailMessageDetailRecipientV1 =>
  isRecord(value) && hasOnlyKeys(value, ['role', 'mailbox']) &&
  (value.role === 'to' || value.role === 'cc' || value.role === 'bcc' ||
    value.role === 'reply-to') && isMailbox(value.mailbox)

const isAttachment = (value: unknown): value is LiveMailMessageDetailAttachmentV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'filename', 'mediaType', 'sizeBytes', 'inline'
  ]) && typeof value.filename === 'string' && value.filename.length > 0 &&
  value.filename.length <= 1024 && typeof value.mediaType === 'string' &&
  value.mediaType.length > 0 && value.mediaType.length <= 256 &&
  typeof value.sizeBytes === 'number' && Number.isSafeInteger(value.sizeBytes) &&
  value.sizeBytes >= 0 && typeof value.inline === 'boolean'

export const isLiveMailMessageDetailRequestV1 = (
  value: unknown
): value is LiveMailMessageDetailRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'accountId', 'messageId']) &&
  value.version === 1 && isId(value.accountId) && isId(value.messageId)

export const isLiveMailMessageDetailV1 = (
  value: unknown
): value is LiveMailMessageDetailV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'accountId', 'messageId', 'threadId', 'provider', 'accountIdentity',
    'sender', 'recipients', 'sentAt', 'receivedAt', 'subject', 'body', 'isRead',
    'attachments'
  ]) || value.version !== 1 || !isId(value.accountId) || !isId(value.messageId) ||
      !isId(value.threadId) || value.provider !== 'google' ||
      !isLiveMailAccountDisplayIdentityV1(value.accountIdentity) ||
      !isMailbox(value.sender) || !Array.isArray(value.recipients) ||
      value.recipients.length > 256 || !value.recipients.every(isRecipient) ||
      !isTimestamp(value.sentAt) || !isTimestamp(value.receivedAt) ||
      typeof value.subject !== 'string' || value.subject.length > 998 ||
      !isRecord(value.body) || !hasOnlyKeys(value.body, ['plainText', 'truncated']) ||
      typeof value.body.plainText !== 'string' ||
      value.body.plainText.length > LIVE_MAIL_DETAIL_BODY_LIMIT ||
      typeof value.body.truncated !== 'boolean' || typeof value.isRead !== 'boolean' ||
      !Array.isArray(value.attachments) || value.attachments.length > 256 ||
      !value.attachments.every(isAttachment)) return false
  return true
}

export const isLiveMailMessageDetailResultV1 = (
  value: unknown
): value is LiveMailMessageDetailResultV1 => {
  if (!isRecord(value) || value.version !== 1 || typeof value.status !== 'string') return false
  if (value.status === 'missing') {
    return hasOnlyKeys(value, ['version', 'status', 'accountId', 'messageId']) &&
      isId(value.accountId) && isId(value.messageId)
  }
  return value.status === 'found' && hasOnlyKeys(value, [
    'version', 'status', 'detail'
  ]) && isLiveMailMessageDetailV1(value.detail)
}
