import type { MailDataset } from './domain'

export const POSITA_PROTOCOL_VERSION = 1 as const
export const DELETE_LOCAL_DATA_CONFIRMATION_TEXT = 'DELETE LOCAL DATA' as const
export const LOCAL_DATA_DELETION_CONSEQUENCES = Object.freeze([
  'Removes Posita mailbox cache and derived data from this Mac.',
  'Removes Google refresh credentials stored by Posita.',
  'Does not delete or change mail in Gmail.'
] as const)

export const IPC_CHANNELS = Object.freeze({
  loadApplicationState: 'posita:application:load-state:v1',
  prepareLocalDataDeletion: 'posita:local-data:prepare-deletion:v1',
  executeLocalDataDeletion: 'posita:local-data:execute-deletion:v1'
})

export interface LoadApplicationStateRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
}

export interface AppSnapshotV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  dataMode: 'fixture-seeded'
  loadedAt: string
  dataset: MailDataset
}

export type AppErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'DATABASE_UNAVAILABLE'
  | 'PROTOCOL_ERROR'

export interface AppErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: AppErrorCodeV1
  message: string
  retryable: boolean
}

export type AppResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppErrorV1 }

export type LoadSnapshotResponseV1 = AppResultV1<AppSnapshotV1>

export type LifecyclePublicStageV1 =
  | 'revoking-access'
  | 'removing-credentials'
  | 'removing-account-state'
  | 'removing-mail-data'
  | 'sanitizing-storage'
  | 'erasing-encryption-key'

export type LifecycleFailureCodeV1 =
  | 'REVOCATION_FAILED'
  | 'CREDENTIAL_DELETE_FAILED'
  | 'ACCOUNT_STATE_DELETE_FAILED'
  | 'MAIL_DATA_DELETE_FAILED'
  | 'COMPACTION_FAILED'
  | 'DATA_KEY_DELETE_FAILED'

export interface LifecycleOperationStatusV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  operationId: string
  operationType: 'disconnect-account' | 'delete-local-data'
  accountId?: string
  status: 'pending' | 'retry-required'
  stage: LifecyclePublicStageV1
  completedSteps: number
  totalSteps: number
  message: string
  lastErrorCode?: LifecycleFailureCodeV1
}

export interface LifecycleStatusSnapshotV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  state: 'idle' | 'pending' | 'attention-required'
  operations: LifecycleOperationStatusV1[]
}

export type ApplicationStateV1 =
  | {
      version: typeof POSITA_PROTOCOL_VERSION
      mode: 'ready'
      snapshot: AppSnapshotV1
      lifecycle: LifecycleStatusSnapshotV1
    }
  | {
      version: typeof POSITA_PROTOCOL_VERSION
      mode: 'local-data-deleted'
    }
  | {
      version: typeof POSITA_PROTOCOL_VERSION
      mode: 'recovery-required'
    }

export type LoadApplicationStateResponseV1 = AppResultV1<ApplicationStateV1>

export interface PrepareLocalDataDeletionRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'delete-local-data'
}

export interface LocalDataDeletionChallengeV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  requiredText: typeof DELETE_LOCAL_DATA_CONFIRMATION_TEXT
  expiresAt: string
  consequences: typeof LOCAL_DATA_DELETION_CONSEQUENCES
}

export interface ExecuteLocalDataDeletionRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  enteredText: string
}

export interface ExecuteLocalDataDeletionResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  operationId: string
  status: 'local-data-deleted'
}

export type LocalDataDeletionErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'DELETION_UNAVAILABLE'
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_TEXT_MISMATCH'
  | 'CONFIRMATION_LIMIT_REACHED'
  | 'STORAGE_UNAVAILABLE'
  | 'OPERATION_CONFLICT'
  | 'DELETION_FAILED'
  | 'PROTOCOL_ERROR'

export interface LocalDataDeletionErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: LocalDataDeletionErrorCodeV1
  message: string
  retryable: boolean
}

export type LocalDataDeletionResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; error: LocalDataDeletionErrorV1 }

export type PrepareLocalDataDeletionResponseV1 =
  LocalDataDeletionResultV1<LocalDataDeletionChallengeV1>
export type ExecuteLocalDataDeletionResponseV1 =
  LocalDataDeletionResultV1<ExecuteLocalDataDeletionResultV1>

export interface PositaDesktopApi {
  platform: string
  prototypeMode: true
  loadApplicationState(): Promise<LoadApplicationStateResponseV1>
  prepareLocalDataDeletion(): Promise<PrepareLocalDataDeletionResponseV1>
  executeLocalDataDeletion(
    request: ExecuteLocalDataDeletionRequestV1
  ): Promise<ExecuteLocalDataDeletionResponseV1>
}
