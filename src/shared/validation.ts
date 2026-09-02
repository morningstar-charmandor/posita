import type {
  AppErrorCodeV1,
  AppErrorV1,
  AppSnapshotV1,
  AccountConnectionRecoveryChallengeV1,
  AccountConnectionRecoveryErrorCodeV1,
  AccountConnectionRecoveryErrorV1,
  AccountConnectionRecoveryResultV1,
  ApplicationStateChangedEventV1,
  ApplicationStateV1,
  GoogleConnectConsentV1,
  LifecycleOperationStatusV1,
  LifecycleStatusSnapshotV1,
  ExecuteLocalDataDeletionRequestV1,
  ExecuteLocalDataDeletionResponseV1,
  ExecuteLocalDataDeletionResultV1,
  ExecuteAccountConnectionRecoveryRequestV1,
  ExecuteAccountConnectionRecoveryResponseV1,
  LocalDataDeletionChallengeV1,
  LocalDataDeletionErrorCodeV1,
  LocalDataDeletionErrorV1,
  LoadApplicationStateRequestV1,
  LoadApplicationStateResponseV1,
  LoadSnapshotResponseV1,
  OpenLiveMailOriginalErrorCodeV1,
  OpenLiveMailOriginalErrorV1,
  OpenLiveMailOriginalRequestV1,
  OpenLiveMailOriginalResponseV1,
  PrepareLocalDataDeletionRequestV1,
  PrepareLocalDataDeletionResponseV1,
  PrepareAccountConnectionRecoveryRequestV1,
  PrepareAccountConnectionRecoveryResponseV1,
  RetentionMaintenanceRunV1,
  RetentionMaintenanceStatusV1
} from './contracts'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  GOOGLE_CONNECT_CONSENT,
  LOCAL_DATA_DELETION_CONSEQUENCES,
  POSITA_PROTOCOL_VERSION,
  RETENTION_MAINTENANCE_FAILURE_MESSAGE
} from './contracts'
import { isLiveMailSnapshotV2, type LiveMailSnapshotV2 } from './liveMail'
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

export const isApplicationStateChangedEvent = (
  value: unknown
): value is ApplicationStateChangedEventV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'reason']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  value.reason === 'retention-maintenance'

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

const isFixtureAppSnapshot = (value: unknown): value is AppSnapshotV1 =>
  isRecord(value) &&
  hasOnlyKeys(value, ['version', 'dataMode', 'loadedAt', 'dataset']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  value.dataMode === 'fixture-seeded' &&
  isString(value.loadedAt) &&
  Number.isFinite(Date.parse(value.loadedAt)) &&
  isMailDataset(value.dataset)

export const isLiveMailSnapshot = isLiveMailSnapshotV2

export const isAppSnapshot = (
  value: unknown
): value is AppSnapshotV1 | LiveMailSnapshotV2 =>
  isFixtureAppSnapshot(value) || isLiveMailSnapshot(value)

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

const isRetentionMaintenanceRun = (
  value: unknown
): value is RetentionMaintenanceRunV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'completedAt', 'cutoffAt', 'changed', 'removed'
  ]) || !isAbsoluteTimestamp(value.completedAt) ||
      !isAbsoluteTimestamp(value.cutoffAt) || !isBoolean(value.changed) ||
      !isRecord(value.removed) || !hasOnlyKeys(value.removed, [
        'messages', 'topics', 'briefItems', 'people'
      ])) return false
  const removed = value.removed
  if (!['messages', 'topics', 'briefItems', 'people'].every((key) =>
    isNonNegativeInteger(removed[key]))) return false
  return value.changed === ['messages', 'topics', 'briefItems', 'people'].some((key) =>
    (removed[key] as number) > 0)
}

export const isRetentionMaintenanceStatus = (
  value: unknown
): value is RetentionMaintenanceStatusV1 => {
  if (!isRecord(value) || value.version !== POSITA_PROTOCOL_VERSION ||
      value.retentionDays !== 90 ||
      (value.lastRun !== undefined && !isRetentionMaintenanceRun(value.lastRun))) return false
  const lastRunKey = value.lastRun === undefined ? [] : ['lastRun']
  if (value.status === 'scheduled') {
    return hasOnlyKeys(value, [
      'version', 'retentionDays', 'status', 'nextRunAt', ...lastRunKey
    ]) && isAbsoluteTimestamp(value.nextRunAt)
  }
  if (value.status === 'running') {
    return hasOnlyKeys(value, [
      'version', 'retentionDays', 'status', 'startedAt', ...lastRunKey
    ]) && isAbsoluteTimestamp(value.startedAt)
  }
  return value.status === 'attention-required' && hasOnlyKeys(value, [
    'version', 'retentionDays', 'status', 'nextRunAt', 'errorCode', 'message',
    ...lastRunKey
  ]) && isAbsoluteTimestamp(value.nextRunAt) &&
    value.errorCode === 'RETENTION_MAINTENANCE_FAILED' &&
    value.message === RETENTION_MAINTENANCE_FAILURE_MESSAGE
}

export const isGoogleConnectConsent = (value: unknown): value is GoogleConnectConsentV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'consentVersion', 'provider', 'status', 'requestedScope',
    'initialImportDays', 'rollingRetentionDays', 'disclosures'
  ]) || value.version !== GOOGLE_CONNECT_CONSENT.version ||
      value.consentVersion !== GOOGLE_CONNECT_CONSENT.consentVersion ||
      value.provider !== GOOGLE_CONNECT_CONSENT.provider ||
      value.status !== GOOGLE_CONNECT_CONSENT.status ||
      value.requestedScope !== GOOGLE_CONNECT_CONSENT.requestedScope ||
      value.initialImportDays !== GOOGLE_CONNECT_CONSENT.initialImportDays ||
      value.rollingRetentionDays !== GOOGLE_CONNECT_CONSENT.rollingRetentionDays ||
      !Array.isArray(value.disclosures) ||
      value.disclosures.length !== GOOGLE_CONNECT_CONSENT.disclosures.length) return false

  return value.disclosures.every((disclosure, index) => {
    const expected = GOOGLE_CONNECT_CONSENT.disclosures[index]
    return expected !== undefined && isRecord(disclosure) &&
      hasOnlyKeys(disclosure, ['id', 'title', 'description']) &&
      disclosure.id === expected.id && disclosure.title === expected.title &&
      disclosure.description === expected.description
  })
}

export const isApplicationState = (value: unknown): value is ApplicationStateV1 => {
  if (!isRecord(value) || value.version !== POSITA_PROTOCOL_VERSION ||
      !isOneOf(value.mode, ['ready', 'local-data-deleted', 'recovery-required'])) return false
  if (value.mode === 'ready') {
    return hasOnlyKeys(value, [
      'version', 'mode', 'snapshot', 'lifecycle', 'retention', 'connectConsent'
    ]) && isAppSnapshot(value.snapshot) &&
      isLifecycleStatusSnapshot(value.lifecycle) &&
      isRetentionMaintenanceStatus(value.retention) &&
      isGoogleConnectConsent(value.connectConsent)
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

const openOriginalErrorCodes: readonly OpenLiveMailOriginalErrorCodeV1[] = [
  'INVALID_REQUEST', 'UNTRUSTED_SENDER', 'OPEN_UNAVAILABLE', 'SOURCE_NOT_FOUND',
  'ACCOUNT_IDENTITY_UNAVAILABLE', 'OPEN_FAILED', 'PROTOCOL_ERROR'
]

export const isOpenLiveMailOriginalRequest = (
  value: unknown
): value is OpenLiveMailOriginalRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'action', 'accountId', 'messageId']) &&
  value.version === POSITA_PROTOCOL_VERSION && value.action === 'open-original' &&
  isOperationId(value.accountId) && isOperationId(value.messageId)

const isOpenLiveMailOriginalError = (
  value: unknown
): value is OpenLiveMailOriginalErrorV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'code', 'message', 'retryable']) &&
  value.version === POSITA_PROTOCOL_VERSION && isOneOf(value.code, openOriginalErrorCodes) &&
  isBoundedString(value.message, 240) && isBoolean(value.retryable)

export const isOpenLiveMailOriginalResponse = (
  value: unknown
): value is OpenLiveMailOriginalResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isRecord(value.value) &&
      hasOnlyKeys(value.value, ['version', 'status']) &&
      value.value.version === POSITA_PROTOCOL_VERSION &&
      value.value.status === 'external-open-requested'
    : hasOnlyKeys(value, ['ok', 'error']) && isOpenLiveMailOriginalError(value.error)
}

const operationIdPattern = /^[A-Za-z0-9_-]{1,128}$/
const isOperationId = (value: unknown): value is string =>
  isString(value) && operationIdPattern.test(value)

export const isPrepareLocalDataDeletionRequest = (
  value: unknown
): value is PrepareLocalDataDeletionRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'action']) &&
  value.version === POSITA_PROTOCOL_VERSION && value.action === 'delete-local-data'

export const isExecuteLocalDataDeletionRequest = (
  value: unknown
): value is ExecuteLocalDataDeletionRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'confirmationId', 'operationId', 'action', 'enteredText'
  ]) && value.version === POSITA_PROTOCOL_VERSION &&
  isOperationId(value.confirmationId) && isOperationId(value.operationId) &&
  value.confirmationId !== value.operationId && value.action === 'delete-local-data' &&
  isString(value.enteredText) && value.enteredText.length <= 64

const isDeletionChallenge = (value: unknown): value is LocalDataDeletionChallengeV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'confirmationId', 'operationId', 'action', 'requiredText',
    'expiresAt', 'consequences'
  ]) && value.version === POSITA_PROTOCOL_VERSION &&
  isOperationId(value.confirmationId) && isOperationId(value.operationId) &&
  value.confirmationId !== value.operationId && value.action === 'delete-local-data' &&
  value.requiredText === DELETE_LOCAL_DATA_CONFIRMATION_TEXT &&
  isAbsoluteTimestamp(value.expiresAt) && Array.isArray(value.consequences) &&
  value.consequences.length === LOCAL_DATA_DELETION_CONSEQUENCES.length &&
  value.consequences.every((consequence, index) =>
    consequence === LOCAL_DATA_DELETION_CONSEQUENCES[index])

const deletionErrorCodes: readonly LocalDataDeletionErrorCodeV1[] = [
  'INVALID_REQUEST', 'UNTRUSTED_SENDER', 'DELETION_UNAVAILABLE',
  'CONFIRMATION_NOT_FOUND', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_TEXT_MISMATCH',
  'CONFIRMATION_LIMIT_REACHED', 'STORAGE_UNAVAILABLE', 'OPERATION_CONFLICT',
  'DELETION_FAILED', 'PROTOCOL_ERROR'
]

export const isLocalDataDeletionError = (
  value: unknown
): value is LocalDataDeletionErrorV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'code', 'message', 'retryable']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  isOneOf(value.code, deletionErrorCodes) &&
  isBoundedString(value.message, 240) && isBoolean(value.retryable)

const isExecuteLocalDataDeletionResult = (
  value: unknown
): value is ExecuteLocalDataDeletionResultV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'operationId', 'status']) &&
  value.version === POSITA_PROTOCOL_VERSION && isOperationId(value.operationId) &&
  value.status === 'local-data-deleted'

export const isPrepareLocalDataDeletionResponse = (
  value: unknown
): value is PrepareLocalDataDeletionResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isDeletionChallenge(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) && isLocalDataDeletionError(value.error)
}

export const isExecuteLocalDataDeletionResponse = (
  value: unknown
): value is ExecuteLocalDataDeletionResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isExecuteLocalDataDeletionResult(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) && isLocalDataDeletionError(value.error)
}

const accountIdPattern = /^[A-Za-z0-9_-]{1,128}$/
const isAccountId = (value: unknown): value is string =>
  isString(value) && accountIdPattern.test(value)
const isRecoverableAccountConnectionStatus = (
  value: unknown
): value is AccountConnectionRecoveryChallengeV1['expectedStatus'] =>
  isOneOf(value, ['credential-only', 'provider-state-only'])

export const isPrepareAccountConnectionRecoveryRequest = (
  value: unknown
): value is PrepareAccountConnectionRecoveryRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'action', 'accountId']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  value.action === 'discard-orphaned-local-connection-state' &&
  isAccountId(value.accountId)

export const isExecuteAccountConnectionRecoveryRequest = (
  value: unknown
): value is ExecuteAccountConnectionRecoveryRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'confirmationId', 'operationId', 'action', 'accountId',
    'expectedStatus', 'enteredText'
  ]) && value.version === POSITA_PROTOCOL_VERSION &&
  isOperationId(value.confirmationId) && isOperationId(value.operationId) &&
  value.confirmationId !== value.operationId &&
  value.action === 'discard-orphaned-local-connection-state' &&
  isAccountId(value.accountId) &&
  isRecoverableAccountConnectionStatus(value.expectedStatus) &&
  isString(value.enteredText) && value.enteredText.length <= 64

const recoveryErrorCodes: readonly AccountConnectionRecoveryErrorCodeV1[] = [
  'INVALID_REQUEST', 'UNTRUSTED_SENDER', 'RECOVERY_UNAVAILABLE',
  'RECOVERY_NOT_NEEDED', 'RECOVERY_REFUSED', 'CONNECTION_STATE_CHANGED',
  'CONFIRMATION_NOT_FOUND', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_TEXT_MISMATCH',
  'CONFIRMATION_LIMIT_REACHED', 'STORAGE_UNAVAILABLE', 'RECOVERY_FAILED',
  'PROTOCOL_ERROR'
]

export const isAccountConnectionRecoveryError = (
  value: unknown
): value is AccountConnectionRecoveryErrorV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'code', 'message', 'retryable']) &&
  value.version === POSITA_PROTOCOL_VERSION &&
  isOneOf(value.code, recoveryErrorCodes) &&
  isBoundedString(value.message, 240) && isBoolean(value.retryable)

const isAccountConnectionRecoveryChallenge = (
  value: unknown
): value is AccountConnectionRecoveryChallengeV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'confirmationId', 'operationId', 'action', 'accountId',
    'expectedStatus', 'requiredText', 'expiresAt', 'consequences'
  ]) && value.version === POSITA_PROTOCOL_VERSION &&
  isOperationId(value.confirmationId) && isOperationId(value.operationId) &&
  value.confirmationId !== value.operationId &&
  value.action === 'discard-orphaned-local-connection-state' &&
  isAccountId(value.accountId) &&
  isRecoverableAccountConnectionStatus(value.expectedStatus) &&
  value.requiredText === ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT &&
  isAbsoluteTimestamp(value.expiresAt) && Array.isArray(value.consequences) &&
  value.consequences.length === ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES.length &&
  value.consequences.every((consequence, index) =>
    consequence === ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES[index])

const isAccountConnectionRecoveryResult = (
  value: unknown
): value is AccountConnectionRecoveryResultV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'operationId', 'accountId', 'status', 'removed', 'reconnectRequired'
  ]) && value.version === POSITA_PROTOCOL_VERSION &&
  isOperationId(value.operationId) && isAccountId(value.accountId) &&
  value.status === 'absent' && isOneOf(value.removed, ['credential', 'provider-state']) &&
  value.reconnectRequired === true

export const isPrepareAccountConnectionRecoveryResponse = (
  value: unknown
): value is PrepareAccountConnectionRecoveryResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) &&
      isAccountConnectionRecoveryChallenge(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) &&
      isAccountConnectionRecoveryError(value.error)
}

export const isExecuteAccountConnectionRecoveryResponse = (
  value: unknown
): value is ExecuteAccountConnectionRecoveryResponseV1 => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? hasOnlyKeys(value, ['ok', 'value']) && isAccountConnectionRecoveryResult(value.value)
    : hasOnlyKeys(value, ['ok', 'error']) &&
      isAccountConnectionRecoveryError(value.error)
}
