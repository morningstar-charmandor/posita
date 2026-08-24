import { isAccountId } from './accountState'

export type LifecycleFailureCode =
  | 'REVOCATION_FAILED'
  | 'CREDENTIAL_DELETE_FAILED'
  | 'ACCOUNT_STATE_DELETE_FAILED'
  | 'MAIL_DATA_DELETE_FAILED'
  | 'COMPACTION_FAILED'
  | 'DATA_KEY_DELETE_FAILED'

export type DisconnectPhase =
  | 'revocation-pending'
  | 'credential-delete-pending'
  | 'account-state-delete-pending'
  | 'mail-data-delete-pending'
  | 'compaction-pending'
  | 'completed'

export type DeleteLocalDataPhase =
  | 'credentials-delete-pending'
  | 'account-state-delete-pending'
  | 'mail-data-delete-pending'
  | 'compaction-pending'
  | 'data-key-delete-pending'
  | 'completed'

interface LifecycleOperationBase {
  version: 1
  operationId: string
  lastErrorCode?: LifecycleFailureCode
}

export interface DisconnectAccountOperationV1 extends LifecycleOperationBase {
  operationType: 'disconnect-account'
  accountId: string
  phase: DisconnectPhase
}

export interface DeleteLocalDataOperationV1 extends LifecycleOperationBase {
  operationType: 'delete-local-data'
  phase: DeleteLocalDataPhase
}

export type LifecycleOperationV1 = DisconnectAccountOperationV1 | DeleteLocalDataOperationV1

export interface AccountLifecycleRepository {
  save(operation: LifecycleOperationV1): void
  load(operationId: string): LifecycleOperationV1 | undefined
  loadLatestDeleteLocalData(): DeleteLocalDataOperationV1 | undefined
  listPending(): LifecycleOperationV1[]
  deleteCompleted(operationId: string): boolean
}

export class AccountLifecycleError extends Error {
  readonly code: 'INVALID_LIFECYCLE_STATE' | 'LIFECYCLE_STORAGE_FAILED'

  constructor(code: AccountLifecycleError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AccountLifecycleError'
    this.code = code
  }
}

const operationIdPattern = /^[A-Za-z0-9_-]{1,128}$/
const disconnectPhases = new Set<DisconnectPhase>([
  'revocation-pending', 'credential-delete-pending', 'account-state-delete-pending',
  'mail-data-delete-pending', 'compaction-pending', 'completed'
])
const deleteLocalDataPhases = new Set<DeleteLocalDataPhase>([
  'credentials-delete-pending', 'account-state-delete-pending',
  'mail-data-delete-pending', 'compaction-pending', 'data-key-delete-pending', 'completed'
])
const failureCodes = new Set<LifecycleFailureCode>([
  'REVOCATION_FAILED', 'CREDENTIAL_DELETE_FAILED', 'ACCOUNT_STATE_DELETE_FAILED',
  'MAIL_DATA_DELETE_FAILED', 'COMPACTION_FAILED', 'DATA_KEY_DELETE_FAILED'
])

export const isOperationId = (value: unknown): value is string =>
  typeof value === 'string' && operationIdPattern.test(value)

export const isLifecycleOperationV1 = (value: unknown): value is LifecycleOperationV1 => {
  if (typeof value !== 'object' || value === null) return false
  const operation = value as Record<string, unknown>
  const commonValid = operation.version === 1 && isOperationId(operation.operationId) &&
    (operation.lastErrorCode === undefined ||
      (typeof operation.lastErrorCode === 'string' &&
        failureCodes.has(operation.lastErrorCode as LifecycleFailureCode))) &&
    (operation.phase !== 'completed' || operation.lastErrorCode === undefined)
  if (!commonValid) return false

  if (operation.operationType === 'disconnect-account') {
    return Object.keys(operation).every((key) => [
      'version', 'operationId', 'operationType', 'accountId', 'phase', 'lastErrorCode'
    ].includes(key)) && isAccountId(operation.accountId) &&
      typeof operation.phase === 'string' && disconnectPhases.has(operation.phase as DisconnectPhase)
  }
  if (operation.operationType === 'delete-local-data') {
    return Object.keys(operation).every((key) => [
      'version', 'operationId', 'operationType', 'phase', 'lastErrorCode'
    ].includes(key)) && typeof operation.phase === 'string' &&
      deleteLocalDataPhases.has(operation.phase as DeleteLocalDataPhase)
  }
  return false
}
