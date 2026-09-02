import { isAccountId, type SyncFailureCode } from './accountState.ts'
import {
  isProviderMailMessageV1,
  isProviderMailThreadV1,
  type MailProvider,
  type ProviderMailMessageV1,
  type ProviderMailThreadV1
} from '../../shared/providerMail.ts'

export const INITIAL_SYNC_DAYS = 90
export const SYNC_BATCH_SIZE = 100
export const MAX_BATCHES_PER_SYNC = 50
export const MAX_RECONCILIATION_RECORDS = SYNC_BATCH_SIZE * MAX_BATCHES_PER_SYNC

export interface ProviderMailBatchRequestV1 {
  version: 1
  accountId: string
  provider: MailProvider
  limit: typeof SYNC_BATCH_SIZE
  cursor?: string
  receivedAfter?: string
}

export interface ProviderMailBatchV2 {
  version: 2
  accountId: string
  provider: MailProvider
  messages: ProviderMailMessageV1[]
  threads: ProviderMailThreadV1[]
  deletedProviderMessageIds: string[]
  nextCursor: string
  complete: boolean
}

export interface MailSyncCheckpointV1 {
  version: 1
  accountId: string
  provider: MailProvider
  cursor: string
}

export interface CommitProviderMailBatchV2 {
  version: 2
  accountId: string
  provider: MailProvider
  expectedCursor?: string
  nextCursor: string
  reconciliation: 'incremental' | 'bounded-resync'
  messages: ProviderMailMessageV1[]
  threads: ProviderMailThreadV1[]
  deletedProviderMessageIds: string[]
}

export interface CommitProviderMailBatchResultV1 {
  version: 1
  accountId: string
  nextCursor: string
  insertedMessages: number
  updatedMessages: number
  replayedMessages: number
}

export interface SyncAccountRequestV1 {
  version: 1
  accountId: string
  provider: MailProvider
}

export interface SyncAccountResultV1 {
  version: 1
  accountId: string
  provider: MailProvider
  mode: 'initial' | 'incremental' | 'bounded-resync'
  batchesCommitted: number
  insertedMessages: number
  updatedMessages: number
  replayedMessages: number
  cursor: string
}

export interface ProviderMailAdapter {
  fetchBatch(request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown>
}

/** The implementation must commit normalized records and the next cursor atomically. */
export interface MailSyncProjection {
  loadCheckpoint(accountId: string): Promise<MailSyncCheckpointV1 | undefined>
  commitBatch(batch: CommitProviderMailBatchV2): Promise<CommitProviderMailBatchResultV1>
}

export type MailSyncErrorCode = SyncFailureCode |
  'INVALID_SYNC_REQUEST' |
  'SYNC_CANCELLED' |
  'SYNC_BATCH_LIMIT_REACHED' |
  'SYNC_CHECKPOINT_CONFLICT' |
  'SYNC_STORAGE_FAILED'

export class MailSyncError extends Error {
  constructor(
    readonly code: MailSyncErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'MailSyncError'
  }
}

export class ProviderMailAdapterError extends Error {
  constructor(
    readonly code: SyncFailureCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ProviderMailAdapterError'
  }
}

type JsonRecord = Record<string, unknown>
const CURSOR_MAX_LENGTH = 16_384
const PROVIDER_ID_MAX_LENGTH = 512

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const isCursor = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= CURSOR_MAX_LENGTH

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value))

export const isSyncAccountRequestV1 = (value: unknown): value is SyncAccountRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'accountId', 'provider']) &&
  value.version === 1 && isAccountId(value.accountId) && value.provider === 'google'

export const isSyncAccountResultV1 = (value: unknown): value is SyncAccountResultV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'accountId', 'provider', 'mode', 'batchesCommitted', 'insertedMessages',
    'updatedMessages', 'replayedMessages', 'cursor'
  ]) && value.version === 1 && isAccountId(value.accountId) &&
  value.provider === 'google' &&
  (value.mode === 'initial' || value.mode === 'incremental' || value.mode === 'bounded-resync') &&
  ['batchesCommitted', 'insertedMessages', 'updatedMessages', 'replayedMessages']
    .every((key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0) &&
  isCursor(value.cursor)

export const isProviderMailBatchRequestV1 = (
  value: unknown
): value is ProviderMailBatchRequestV1 => {
  if (!isRecord(value)) return false
  const cursorKey = value.cursor === undefined ? [] : ['cursor']
  const receivedAfterKey = value.receivedAfter === undefined ? [] : ['receivedAfter']
  return hasOnlyKeys(value, [
    'version', 'accountId', 'provider', 'limit', ...cursorKey, ...receivedAfterKey
  ]) && value.version === 1 && isAccountId(value.accountId) &&
    value.provider === 'google' && value.limit === SYNC_BATCH_SIZE &&
    (value.cursor === undefined || isCursor(value.cursor)) &&
    (value.receivedAfter === undefined || isTimestamp(value.receivedAfter)) &&
    ((value.cursor === undefined) !== (value.receivedAfter === undefined))
}

export const isMailSyncCheckpointV1 = (
  value: unknown
): value is MailSyncCheckpointV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'accountId', 'provider', 'cursor'
  ]) && value.version === 1 && isAccountId(value.accountId) &&
  value.provider === 'google' && isCursor(value.cursor)

const isProviderMessageId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= PROVIDER_ID_MAX_LENGTH &&
  /^[\u0021-\u007E]+$/.test(value)

const isProviderMailBatchV2WithLimit = (
  value: unknown,
  maximumRecords: number
): value is ProviderMailBatchV2 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'accountId', 'provider', 'messages', 'threads',
    'deletedProviderMessageIds', 'nextCursor', 'complete'
  ]) || value.version !== 2 || !isAccountId(value.accountId) ||
      value.provider !== 'google' || !Array.isArray(value.messages) ||
      value.messages.length > maximumRecords ||
      !value.messages.every(isProviderMailMessageV1) || !Array.isArray(value.threads) ||
      value.threads.length > maximumRecords ||
      !value.threads.every(isProviderMailThreadV1) ||
      !Array.isArray(value.deletedProviderMessageIds) ||
      value.deletedProviderMessageIds.length > maximumRecords ||
      !value.deletedProviderMessageIds.every(isProviderMessageId) ||
      new Set(value.deletedProviderMessageIds).size !== value.deletedProviderMessageIds.length ||
      !isCursor(value.nextCursor) ||
      typeof value.complete !== 'boolean') return false

  const messages = value.messages as ProviderMailMessageV1[]
  const threads = value.threads as ProviderMailThreadV1[]
  const deletedProviderMessageIds = value.deletedProviderMessageIds as string[]
  const messageIds = new Set<string>()
  const sourceIds = new Set<string>()
  for (const message of messages) {
    if (message.accountId !== value.accountId || message.source.provider !== value.provider ||
        messageIds.has(message.id) || sourceIds.has(message.source.providerMessageId)) return false
    messageIds.add(message.id)
    sourceIds.add(message.source.providerMessageId)
  }
  const threadIds = new Set<string>()
  const providerThreadIds = new Set<string>()
  for (const thread of threads) {
    if (thread.accountId !== value.accountId || thread.provider !== value.provider ||
        threadIds.has(thread.id) || providerThreadIds.has(thread.providerThreadId)) return false
    threadIds.add(thread.id)
    providerThreadIds.add(thread.providerThreadId)
  }
  return messages.every((message) => !deletedProviderMessageIds.includes(
    message.source.providerMessageId
  ) && threads.some((thread) =>
    thread.id === message.threadId &&
    thread.providerThreadId === message.source.providerThreadId &&
    thread.messageIds.includes(message.id)))
}

export const isProviderMailBatchV2 = (value: unknown): value is ProviderMailBatchV2 =>
  isProviderMailBatchV2WithLimit(value, SYNC_BATCH_SIZE)

export const isCommitProviderMailBatchV2 = (
  value: unknown
): value is CommitProviderMailBatchV2 => {
  if (!isRecord(value)) return false
  const expectedCursorKey = value.expectedCursor === undefined ? [] : ['expectedCursor']
  if (!hasOnlyKeys(value, [
    'version', 'accountId', 'provider', ...expectedCursorKey, 'nextCursor',
    'reconciliation', 'messages', 'threads', 'deletedProviderMessageIds'
  ]) || (value.reconciliation !== 'incremental' &&
      value.reconciliation !== 'bounded-resync')) return false

  const maximumRecords = value.reconciliation === 'bounded-resync'
    ? MAX_RECONCILIATION_RECORDS
    : SYNC_BATCH_SIZE
  if (!Array.isArray(value.messages) || value.messages.length > maximumRecords ||
      !Array.isArray(value.threads) || value.threads.length > maximumRecords) return false

  return isProviderMailBatchV2WithLimit({
    version: value.version,
    accountId: value.accountId,
    provider: value.provider,
    messages: value.messages,
    threads: value.threads,
    deletedProviderMessageIds: value.deletedProviderMessageIds,
    nextCursor: value.nextCursor,
    complete: true
  }, maximumRecords) && (value.expectedCursor === undefined || isCursor(value.expectedCursor))
}

export const isCommitProviderMailBatchResultV1 = (
  value: unknown
): value is CommitProviderMailBatchResultV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'accountId', 'nextCursor', 'insertedMessages', 'updatedMessages',
    'replayedMessages'
  ]) || value.version !== 1 || !isAccountId(value.accountId) || !isCursor(value.nextCursor)) {
    return false
  }
  return ['insertedMessages', 'updatedMessages', 'replayedMessages'].every((key) =>
    typeof value[key] === 'number' && Number.isSafeInteger(value[key]) &&
    (value[key] as number) >= 0)
}
