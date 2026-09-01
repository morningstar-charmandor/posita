export const LIVE_MAIL_READ_LIMIT = 50 as const

export type LiveMailAccountStatusV1 =
  | 'not-synced'
  | 'syncing'
  | 'ready'
  | 'offline'
  | 'attention-required'
  | 'disabled'

export interface LiveMailAccountV1 {
  accountId: string
  provider: 'google'
  status: LiveMailAccountStatusV1
  lastSuccessAt?: string
}

export interface LiveMailMessageSummaryV1 {
  id: string
  threadId: string
  accountId: string
  provider: 'google'
  sender: {
    address: string
    displayName?: string
  }
  receivedAt: string
  subject: string
  preview: string
  isRead: boolean
  attachmentCount: number
}

export type LiveMailSnapshotStatusV1 =
  | 'empty'
  | 'ready'
  | 'syncing'
  | 'offline'
  | 'attention-required'

/**
 * Bounded presentation projection for canonical provider mail. It deliberately
 * omits message bodies, recipients, provider IDs, account subjects, and sync cursors.
 */
export interface LiveMailSnapshotV1 {
  version: 1
  dataMode: 'live-canonical'
  loadedAt: string
  status: LiveMailSnapshotStatusV1
  accounts: LiveMailAccountV1[]
  messages: LiveMailMessageSummaryV1[]
  hasMore: boolean
}

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/
const mailboxPattern = /^[^\s@]+@[^\s@]+$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && timestampPattern.test(value) &&
  Number.isFinite(Date.parse(value))
const statuses: readonly LiveMailAccountStatusV1[] = [
  'not-synced', 'syncing', 'ready', 'offline', 'attention-required', 'disabled'
]

const isAccount = (value: unknown): value is LiveMailAccountV1 => {
  if (!isRecord(value)) return false
  const success = value.lastSuccessAt === undefined ? [] : ['lastSuccessAt']
  return hasOnlyKeys(value, ['accountId', 'provider', 'status', ...success]) &&
    typeof value.accountId === 'string' && idPattern.test(value.accountId) &&
    value.provider === 'google' && typeof value.status === 'string' &&
    statuses.includes(value.status as LiveMailAccountStatusV1) &&
    (value.lastSuccessAt === undefined || isTimestamp(value.lastSuccessAt))
}

const isMessage = (value: unknown): value is LiveMailMessageSummaryV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'id', 'threadId', 'accountId', 'provider', 'sender', 'receivedAt', 'subject',
    'preview', 'isRead', 'attachmentCount'
  ]) || typeof value.id !== 'string' || !idPattern.test(value.id) ||
      typeof value.threadId !== 'string' || !idPattern.test(value.threadId) ||
      typeof value.accountId !== 'string' || !idPattern.test(value.accountId) ||
      value.provider !== 'google' || !isRecord(value.sender)) return false
  const name = value.sender.displayName === undefined ? [] : ['displayName']
  return hasOnlyKeys(value.sender, ['address', ...name]) &&
    typeof value.sender.address === 'string' && value.sender.address.length <= 320 &&
    mailboxPattern.test(value.sender.address) &&
    (value.sender.displayName === undefined ||
      (typeof value.sender.displayName === 'string' && value.sender.displayName.length > 0 &&
        value.sender.displayName.length <= 256)) &&
    isTimestamp(value.receivedAt) && typeof value.subject === 'string' &&
    value.subject.length <= 998 && typeof value.preview === 'string' &&
    value.preview.length <= 240 && typeof value.isRead === 'boolean' &&
    typeof value.attachmentCount === 'number' && Number.isInteger(value.attachmentCount) &&
    value.attachmentCount >= 0 && value.attachmentCount <= 256
}

const expectedStatus = (
  accounts: readonly LiveMailAccountV1[],
  messageCount: number
): LiveMailSnapshotStatusV1 => {
  if (accounts.some((account) => account.status === 'attention-required')) {
    return 'attention-required'
  }
  if (accounts.some((account) => account.status === 'offline')) return 'offline'
  if (accounts.some((account) => account.status === 'syncing')) return 'syncing'
  return messageCount > 0 ? 'ready' : 'empty'
}

export const isLiveMailSnapshotV1 = (value: unknown): value is LiveMailSnapshotV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'dataMode', 'loadedAt', 'status', 'accounts', 'messages', 'hasMore'
  ]) || value.version !== 1 || value.dataMode !== 'live-canonical' ||
      !isTimestamp(value.loadedAt) || !Array.isArray(value.accounts) ||
      value.accounts.length > 32 || !value.accounts.every(isAccount) ||
      !Array.isArray(value.messages) || value.messages.length > LIVE_MAIL_READ_LIMIT ||
      !value.messages.every(isMessage) || typeof value.hasMore !== 'boolean') return false

  const accounts = value.accounts as LiveMailAccountV1[]
  const messages = value.messages as LiveMailMessageSummaryV1[]
  const accountIds = accounts.map((account) => account.accountId)
  const messageIds = messages.map((message) => `${message.accountId}\u0000${message.id}`)
  if (new Set(accountIds).size !== accountIds.length ||
      new Set(messageIds).size !== messageIds.length ||
      !messages.every((message) => accountIds.includes(message.accountId))) return false
  if (messages.some((message, index) => {
    const previous = messages[index - 1]
    return previous !== undefined && Date.parse(previous.receivedAt) < Date.parse(message.receivedAt)
  })) return false
  return value.status === expectedStatus(accounts, messages.length)
}
