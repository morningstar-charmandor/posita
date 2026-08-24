import type {
  AppErrorCodeV1,
  AppErrorV1,
  AppSnapshotV1,
  ApplicationStateV1,
  LifecycleOperationStatusV1,
  LifecycleStatusSnapshotV1,
  LoadApplicationStateRequestV1,
  LoadApplicationStateResponseV1,
  LoadSnapshotResponseV1
} from './contracts'
import { POSITA_PROTOCOL_VERSION } from './contracts'
import type {
  Account,
  BriefItem,
  MailDataset,
  Message,
  Person,
  TimelineEvent,
  Topic
} from './domain'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

const isString = (value: unknown): value is string => typeof value === 'string'
const absoluteTimestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/
export const isAbsoluteTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && absoluteTimestampPattern.test(value) &&
  Number.isFinite(Date.parse(value))
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T)

const isAccount = (value: unknown): value is Account =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'label', 'address', 'tone']) &&
  isString(value.id) &&
  isString(value.label) &&
  isString(value.address) &&
  isOneOf(value.tone, ['sage', 'blue', 'sand'])

const isPerson = (value: unknown): value is Person =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'name', 'initials', 'role', 'email']) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.initials) &&
  isString(value.role) &&
  isString(value.email)

const isMessage = (value: unknown): value is Message =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'id', 'threadId', 'accountId', 'senderId', 'subject', 'preview', 'body',
    'receivedAt', 'isRead', ...(value.receivedAtIso === undefined ? [] : ['receivedAtIso'])
  ]) &&
  isString(value.id) &&
  isString(value.threadId) &&
  isString(value.accountId) &&
  isString(value.senderId) &&
  isString(value.subject) &&
  isString(value.preview) &&
  isString(value.body) &&
  isString(value.receivedAt) &&
  (value.receivedAtIso === undefined || isAbsoluteTimestamp(value.receivedAtIso)) &&
  isBoolean(value.isRead)

const isTimelineEvent = (value: unknown): value is TimelineEvent =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'dateLabel', 'description', 'citationMessageId']) &&
  isString(value.id) &&
  isString(value.dateLabel) &&
  isString(value.description) &&
  isString(value.citationMessageId)

const isTopic = (value: unknown): value is Topic =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'id', 'name', 'eyebrow', 'summary', 'status', 'priority', 'participantIds',
    'messageIds', 'events', 'nextStep'
  ]) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.eyebrow) &&
  isString(value.summary) &&
  isOneOf(value.status, ['needs-user', 'waiting', 'active']) &&
  isOneOf(value.priority, ['high', 'medium', 'low']) &&
  isStringArray(value.participantIds) &&
  isStringArray(value.messageIds) &&
  Array.isArray(value.events) &&
  value.events.every(isTimelineEvent) &&
  isString(value.nextStep)

const isBriefItem = (value: unknown): value is BriefItem =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'id', 'section', 'topicId', 'title', 'detail', 'reason', 'accountId',
    'citationMessageIds', ...(value.dueLabel === undefined ? [] : ['dueLabel'])
  ]) &&
  isString(value.id) &&
  isOneOf(value.section, ['needs-you', 'waiting', 'worth-knowing']) &&
  isString(value.topicId) &&
  isString(value.title) &&
  isString(value.detail) &&
  isString(value.reason) &&
  isString(value.accountId) &&
  isStringArray(value.citationMessageIds) &&
  (value.dueLabel === undefined || isString(value.dueLabel))

const uniqueIds = (values: readonly { id: string }[]): Set<string> | null => {
  const ids = new Set(values.map((value) => value.id))
  return ids.size === values.length ? ids : null
}

export const isMailDataset = (value: unknown): value is MailDataset => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'accounts', 'people', 'messages', 'topics', 'briefItems'
  ]) ||
      !Array.isArray(value.accounts) || !value.accounts.every(isAccount) ||
      !Array.isArray(value.people) || !value.people.every(isPerson) ||
      !Array.isArray(value.messages) || !value.messages.every(isMessage) ||
      !Array.isArray(value.topics) || !value.topics.every(isTopic) ||
      !Array.isArray(value.briefItems) || !value.briefItems.every(isBriefItem)) {
    return false
  }

  const accountIds = uniqueIds(value.accounts)
  const personIds = uniqueIds(value.people)
  const messageIds = uniqueIds(value.messages)
  const topicIds = uniqueIds(value.topics)
  const briefIds = uniqueIds(value.briefItems)
  if (!accountIds || !personIds || !messageIds || !topicIds || !briefIds) return false

  if (!value.messages.every((message) =>
    accountIds.has(message.accountId) && personIds.has(message.senderId))) return false

  if (!value.topics.every((topic) =>
    topic.participantIds.every((id) => personIds.has(id)) &&
    topic.messageIds.every((id) => messageIds.has(id)) &&
    topic.events.every((event) => messageIds.has(event.citationMessageId)))) return false

  return value.briefItems.every((item) =>
    topicIds.has(item.topicId) &&
    accountIds.has(item.accountId) &&
    item.citationMessageIds.every((id) => messageIds.has(id)))
}

export const isLoadApplicationStateRequest = (
  value: unknown
): value is LoadApplicationStateRequestV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['version']) &&
  value.version === POSITA_PROTOCOL_VERSION

const errorCodes: readonly AppErrorCodeV1[] = [
  'INVALID_REQUEST',
  'UNTRUSTED_SENDER',
  'DATABASE_UNAVAILABLE',
  'PROTOCOL_ERROR'
]

export const isAppError = (value: unknown): value is AppErrorV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['version', 'code', 'message', 'retryable']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  isOneOf(value.code, errorCodes) &&
  isString(value.message) &&
  isBoolean(value.retryable)

export const isAppSnapshot = (value: unknown): value is AppSnapshotV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['version', 'dataMode', 'loadedAt', 'dataset']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  value.dataMode === 'fixture-seeded' &&
  isString(value.loadedAt) &&
  Number.isFinite(Date.parse(value.loadedAt)) &&
  isMailDataset(value.dataset)

export const isLoadSnapshotResponse = (value: unknown): value is LoadSnapshotResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isAppSnapshot(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) && isAppError(value.error)
}

const lifecycleStages = [
  'revoking-access',
  'removing-credentials',
  'removing-account-state',
  'removing-mail-data',
  'sanitizing-storage',
  'erasing-encryption-key'
] as const

const lifecycleFailureCodes = [
  'REVOCATION_FAILED',
  'CREDENTIAL_DELETE_FAILED',
  'ACCOUNT_STATE_DELETE_FAILED',
  'MAIL_DATA_DELETE_FAILED',
  'COMPACTION_FAILED',
  'DATA_KEY_DELETE_FAILED'
] as const

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
const isBoundedString = (value: unknown, maximum: number): value is string =>
  isString(value) && value.length > 0 && value.length <= maximum

export const isLifecycleOperationStatus = (
  value: unknown
): value is LifecycleOperationStatusV1 => {
  if (!isRecord(value) || value.version !== POSITA_PROTOCOL_VERSION ||
      !isBoundedString(value.operationId, 128) ||
      !isOneOf(value.operationType, ['disconnect-account', 'delete-local-data']) ||
      !isOneOf(value.status, ['pending', 'retry-required']) ||
      !isOneOf(value.stage, lifecycleStages) ||
      !isNonNegativeInteger(value.completedSteps) ||
      !isNonNegativeInteger(value.totalSteps) ||
      value.totalSteps < 1 || value.totalSteps > 10 ||
      value.completedSteps >= value.totalSteps ||
      !isBoundedString(value.message, 240)) return false

  const allowedKeys = [
    'version', 'operationId', 'operationType', 'status', 'stage',
    'completedSteps', 'totalSteps', 'message',
    ...(value.accountId === undefined ? [] : ['accountId']),
    ...(value.lastErrorCode === undefined ? [] : ['lastErrorCode'])
  ]
  if (!hasOnlyKeys(value, allowedKeys)) return false
  if (value.accountId !== undefined && !isBoundedString(value.accountId, 128)) return false
  if (value.lastErrorCode !== undefined &&
      !isOneOf(value.lastErrorCode, lifecycleFailureCodes)) return false
  if (value.operationType === 'disconnect-account' && value.accountId === undefined) return false
  if (value.operationType === 'delete-local-data' && value.accountId !== undefined) return false
  return value.status === 'retry-required'
    ? value.lastErrorCode !== undefined
    : value.lastErrorCode === undefined
}

export const isLifecycleStatusSnapshot = (
  value: unknown
): value is LifecycleStatusSnapshotV1 => {
  if (!isRecord(value) || value.version !== POSITA_PROTOCOL_VERSION ||
      !hasOnlyKeys(value, ['version', 'state', 'operations']) ||
      !isOneOf(value.state, ['idle', 'pending', 'attention-required']) ||
      !Array.isArray(value.operations) ||
      !value.operations.every(isLifecycleOperationStatus)) return false
  if (value.state === 'idle') return value.operations.length === 0
  if (value.state === 'pending') {
    return value.operations.length > 0 &&
      value.operations.every((operation) => operation.status === 'pending')
  }
  return value.operations.some((operation) => operation.status === 'retry-required')
}

export const isApplicationState = (value: unknown): value is ApplicationStateV1 => {
  if (!isRecord(value) || value.version !== POSITA_PROTOCOL_VERSION ||
      !isOneOf(value.mode, ['ready', 'local-data-deleted', 'recovery-required'])) return false
  if (value.mode === 'ready') {
    return hasOnlyKeys(value, ['version', 'mode', 'snapshot', 'lifecycle']) &&
      isAppSnapshot(value.snapshot) && isLifecycleStatusSnapshot(value.lifecycle)
  }
  return hasOnlyKeys(value, ['version', 'mode'])
}

export const isLoadApplicationStateResponse = (
  value: unknown
): value is LoadApplicationStateResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isApplicationState(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) && isAppError(value.error)
}
