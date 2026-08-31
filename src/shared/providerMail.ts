export const PROVIDER_MAIL_SCHEMA_VERSION = 1 as const

export type MailProvider = 'google'
export type MailRecipientRole = 'to' | 'cc' | 'bcc' | 'reply-to'

export interface MailboxIdentityV1 {
  address: string
  displayName?: string
}

export interface MailRecipientV1 {
  role: MailRecipientRole
  mailbox: MailboxIdentityV1
}

export interface MailAttachmentV1 {
  providerAttachmentId: string
  filename: string
  mediaType: string
  sizeBytes: number
  inline: boolean
  contentId?: string
}

export interface ReviewedHtmlBodyV1 {
  sanitization: 'reviewed-html-v1'
  content: string
}

export interface ProviderMailSourceV1 {
  provider: MailProvider
  accountId: string
  providerMessageId: string
  providerThreadId: string
}

/**
 * The canonical provider-independent source-message contract.
 *
 * Provider adapters must normalize and validate into this shape before data can
 * enter an application use case. The current fixture-backed `Message` type is a
 * presentation compatibility record and is not a provider-ingestion contract.
 */
export interface ProviderMailMessageV1 {
  version: typeof PROVIDER_MAIL_SCHEMA_VERSION
  id: string
  threadId: string
  accountId: string
  source: ProviderMailSourceV1
  sender: MailboxIdentityV1
  recipients: MailRecipientV1[]
  sentAt: string
  receivedAt: string
  subject: string
  body: {
    plain: string
    html?: ReviewedHtmlBodyV1
  }
  labels: string[]
  isRead: boolean
  attachments: MailAttachmentV1[]
}

export interface ProviderMailThreadV1 {
  version: typeof PROVIDER_MAIL_SCHEMA_VERSION
  id: string
  accountId: string
  provider: MailProvider
  providerThreadId: string
  messageIds: string[]
}

type JsonRecord = Record<string, unknown>

const limits = Object.freeze({
  id: 128,
  providerId: 512,
  address: 320,
  displayName: 256,
  subject: 998,
  body: 2_000_000,
  label: 256,
  labels: 256,
  recipients: 256,
  attachments: 256,
  filename: 1024,
  mediaType: 256,
  contentId: 512,
  threadMessages: 10_000
})

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const isBoundedString = (value: unknown, maximum: number, allowEmpty = false): value is string =>
  typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0)

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const PROVIDER_ID_PATTERN = /^[\u0021-\u007E]{1,512}$/
const MAILBOX_PATTERN = /^[^\s@]+@[^\s@]+$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/

const isId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

const isProviderId = (value: unknown): value is string =>
  typeof value === 'string' && PROVIDER_ID_PATTERN.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && TIMESTAMP_PATTERN.test(value) &&
  Number.isFinite(Date.parse(value))

const isMailbox = (value: unknown): value is MailboxIdentityV1 => {
  if (!isRecord(value)) return false
  const optionalName = value.displayName === undefined ? [] : ['displayName']
  return hasOnlyKeys(value, ['address', ...optionalName]) &&
    isBoundedString(value.address, limits.address) && MAILBOX_PATTERN.test(value.address) &&
    (value.displayName === undefined || isBoundedString(value.displayName, limits.displayName))
}

const isRecipient = (value: unknown): value is MailRecipientV1 =>
  isRecord(value) && hasOnlyKeys(value, ['role', 'mailbox']) &&
  (value.role === 'to' || value.role === 'cc' || value.role === 'bcc' ||
    value.role === 'reply-to') && isMailbox(value.mailbox)

const isAttachment = (value: unknown): value is MailAttachmentV1 => {
  if (!isRecord(value)) return false
  const optionalContentId = value.contentId === undefined ? [] : ['contentId']
  return hasOnlyKeys(value, [
    'providerAttachmentId', 'filename', 'mediaType', 'sizeBytes', 'inline',
    ...optionalContentId
  ]) && isProviderId(value.providerAttachmentId) &&
    isBoundedString(value.filename, limits.filename) &&
    isBoundedString(value.mediaType, limits.mediaType) &&
    typeof value.sizeBytes === 'number' && Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 && typeof value.inline === 'boolean' &&
    (value.contentId === undefined || isBoundedString(value.contentId, limits.contentId))
}

const isSource = (value: unknown): value is ProviderMailSourceV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'provider', 'accountId', 'providerMessageId', 'providerThreadId'
  ]) && value.provider === 'google' && isId(value.accountId) &&
  isProviderId(value.providerMessageId) && isProviderId(value.providerThreadId)

const isBody = (value: unknown): value is ProviderMailMessageV1['body'] => {
  if (!isRecord(value)) return false
  const optionalHtml = value.html === undefined ? [] : ['html']
  if (!hasOnlyKeys(value, ['plain', ...optionalHtml]) ||
      !isBoundedString(value.plain, limits.body, true)) return false
  return value.html === undefined || (isRecord(value.html) &&
    hasOnlyKeys(value.html, ['sanitization', 'content']) &&
    value.html.sanitization === 'reviewed-html-v1' &&
    isBoundedString(value.html.content, limits.body, true))
}

const hasUniqueValues = (values: readonly string[]): boolean =>
  new Set(values).size === values.length

export const isProviderMailMessageV1 = (value: unknown): value is ProviderMailMessageV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'id', 'threadId', 'accountId', 'source', 'sender', 'recipients',
    'sentAt', 'receivedAt', 'subject', 'body', 'labels', 'isRead', 'attachments'
  ]) || value.version !== PROVIDER_MAIL_SCHEMA_VERSION || !isId(value.id) ||
      !isId(value.threadId) || !isId(value.accountId) || !isSource(value.source) ||
      !isMailbox(value.sender) || !Array.isArray(value.recipients) ||
      value.recipients.length > limits.recipients || !value.recipients.every(isRecipient) ||
      !isTimestamp(value.sentAt) || !isTimestamp(value.receivedAt) ||
      !isBoundedString(value.subject, limits.subject, true) || !isBody(value.body) ||
      !Array.isArray(value.labels) || value.labels.length > limits.labels ||
      !value.labels.every((label) => isBoundedString(label, limits.label)) ||
      !hasUniqueValues(value.labels) || typeof value.isRead !== 'boolean' ||
      !Array.isArray(value.attachments) || value.attachments.length > limits.attachments ||
      !value.attachments.every(isAttachment)) return false

  return value.source.accountId === value.accountId &&
    hasUniqueValues(value.attachments.map((attachment) => attachment.providerAttachmentId))
}

export const isProviderMailThreadV1 = (value: unknown): value is ProviderMailThreadV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'id', 'accountId', 'provider', 'providerThreadId', 'messageIds'
  ]) && value.version === PROVIDER_MAIL_SCHEMA_VERSION && isId(value.id) &&
  isId(value.accountId) && value.provider === 'google' &&
  isProviderId(value.providerThreadId) && Array.isArray(value.messageIds) &&
  value.messageIds.length > 0 && value.messageIds.length <= limits.threadMessages &&
  value.messageIds.every(isId) && hasUniqueValues(value.messageIds)
