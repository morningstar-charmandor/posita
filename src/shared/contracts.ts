import type { MailDataset } from './domain'
import type { LiveMailSnapshotV2 } from './liveMail'
import type {
  LiveMailMessageDetailRequestV1,
  LiveMailMessageDetailResultV1
} from './liveMailDetail'

export const POSITA_PROTOCOL_VERSION = 1 as const
export const DELETE_LOCAL_DATA_CONFIRMATION_TEXT = 'DELETE LOCAL DATA' as const
export const LOCAL_DATA_DELETION_CONSEQUENCES = Object.freeze([
  'Removes Posita mailbox cache and derived data from this Mac.',
  'Removes Google refresh credentials stored by Posita.',
  'Does not delete or change mail in Gmail.'
] as const)
export const ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT =
  'DISCARD LOCAL CONNECTION' as const
export const ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES = Object.freeze([
  'Removes only incomplete Posita connection data stored on this Mac.',
  'Requires a fresh Gmail connection before Posita can use that account.',
  'Does not contact Google or delete or change mail in Gmail.'
] as const)
export const GOOGLE_CONNECT_SCOPES = Object.freeze([
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly'
] as const)
export const GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES = Object.freeze([
  'No browser was opened.',
  'No Google account was connected.',
  'No credential or mailbox data was received.'
] as const)
export const GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT = 'DISCONNECT GMAIL' as const
export const GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES = Object.freeze([
  'Revokes Posita’s Google authorization for this account.',
  'Removes its credential, encrypted account state, cursor, and cached mail from Posita.',
  'Does not delete or change messages in Gmail.'
] as const)
export const GOOGLE_CONNECT_CONSENT = Object.freeze({
  version: POSITA_PROTOCOL_VERSION,
  consentVersion: 'google-gmail-readonly-identity-v2',
  provider: 'google',
  status: 'preview-only',
  requestedScopes: GOOGLE_CONNECT_SCOPES,
  initialImportDays: 90,
  rollingRetentionDays: 90,
  disclosures: Object.freeze([
    Object.freeze({
      id: 'read-only-access',
      title: 'Read-only Gmail access',
      description: 'Posita will request permission to read mail. It will not request send, delete, archive, label, or compose access.'
    }),
    Object.freeze({
      id: 'verified-account-identity',
      title: 'Verified Google account identity',
      description: 'OpenID and email identify the Google account and verified mailbox address. They do not grant permission to change mail.'
    }),
    Object.freeze({
      id: 'bounded-retention',
      title: 'A rolling 90-day local window',
      description: 'The first import and encrypted local cache are limited to the previous 90 days. Local cleanup never changes Gmail.'
    }),
    Object.freeze({
      id: 'local-encryption',
      title: 'Encrypted on this Mac',
      description: 'Cached source and derived data use authenticated encryption with a key protected by the operating system.'
    }),
    Object.freeze({
      id: 'ai-inactive',
      title: 'No AI provider is connected',
      description: 'This build uses deterministic sample summaries and drafts. No mailbox content is sent to an AI provider.'
    }),
    Object.freeze({
      id: 'disconnect-control',
      title: 'Disconnect removes Posita access',
      description: 'Disconnect will revoke local use and remove the credential, cursor, cached mail, and account-derived data without deleting Gmail messages.'
    })
  ] as const)
} as const)

export type GoogleConnectConsentV1 = typeof GOOGLE_CONNECT_CONSENT

export const IPC_CHANNELS = Object.freeze({
  loadApplicationState: 'posita:application:load-state:v1',
  loadLiveMailMessageDetail: 'posita:live-mail:load-message-detail:v1',
  openLiveMailOriginal: 'posita:live-mail:open-original:v1',
  applicationStateChanged: 'posita:application:state-changed:v1',
  prepareLocalDataDeletion: 'posita:local-data:prepare-deletion:v1',
  executeLocalDataDeletion: 'posita:local-data:execute-deletion:v1',
  prepareAccountConnectionRecovery: 'posita:account-connection:prepare-recovery:v1',
  executeAccountConnectionRecovery: 'posita:account-connection:execute-recovery:v1',
  prepareGoogleAccountConnection: 'posita:google-account:prepare-connection:v1',
  connectGoogleAccount: 'posita:google-account:connect:v1',
  cancelGoogleAccountConnection: 'posita:google-account:cancel-connection:v1',
  retryGoogleAccountSync: 'posita:google-account:retry-sync:v1',
  prepareGoogleAccountDisconnect: 'posita:google-account:prepare-disconnect:v1',
  executeGoogleAccountDisconnect: 'posita:google-account:execute-disconnect:v1'
})

export interface LoadApplicationStateRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
}

export interface ApplicationStateChangedEventV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  reason: 'retention-maintenance'
}

export interface AppSnapshotV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  dataMode: 'fixture-seeded'
  loadedAt: string
  dataset: MailDataset
}

export type ApplicationMailSnapshotV1 = AppSnapshotV1 | LiveMailSnapshotV2

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

export type LoadSnapshotResponseV1 = AppResultV1<ApplicationMailSnapshotV1>

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

export interface RetentionMaintenanceRunV1 {
  completedAt: string
  cutoffAt: string
  changed: boolean
  removed: {
    messages: number
    topics: number
    briefItems: number
    people: number
  }
}

export const RETENTION_MAINTENANCE_FAILURE_MESSAGE =
  'Posita could not finish encrypted local cleanup. It will retry automatically.' as const

interface RetentionMaintenanceStatusBaseV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  retentionDays: 90
  lastRun?: RetentionMaintenanceRunV1
}

export type RetentionMaintenanceStatusV1 =
  | RetentionMaintenanceStatusBaseV1 & {
      status: 'scheduled'
      nextRunAt: string
    }
  | RetentionMaintenanceStatusBaseV1 & {
      status: 'running'
      startedAt: string
    }
  | RetentionMaintenanceStatusBaseV1 & {
      status: 'attention-required'
      nextRunAt: string
      errorCode: 'RETENTION_MAINTENANCE_FAILED'
      message: typeof RETENTION_MAINTENANCE_FAILURE_MESSAGE
    }

export type ApplicationStateV1 =
  | {
      version: typeof POSITA_PROTOCOL_VERSION
      mode: 'ready'
      snapshot: ApplicationMailSnapshotV1
      lifecycle: LifecycleStatusSnapshotV1
      retention: RetentionMaintenanceStatusV1
      connectConsent: GoogleConnectConsentV1
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
export type LoadLiveMailMessageDetailResponseV1 = AppResultV1<LiveMailMessageDetailResultV1>

export interface OpenLiveMailOriginalRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'open-original'
  accountId: string
  messageId: string
}

export interface OpenLiveMailOriginalResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  status: 'external-open-requested'
}

export type OpenLiveMailOriginalErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'OPEN_UNAVAILABLE'
  | 'SOURCE_NOT_FOUND'
  | 'ACCOUNT_IDENTITY_UNAVAILABLE'
  | 'OPEN_FAILED'
  | 'PROTOCOL_ERROR'

export interface OpenLiveMailOriginalErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: OpenLiveMailOriginalErrorCodeV1
  message: string
  retryable: boolean
}

export type OpenLiveMailOriginalResponseV1 =
  | { ok: true; value: OpenLiveMailOriginalResultV1 }
  | { ok: false; error: OpenLiveMailOriginalErrorV1 }

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

export type RecoverableAccountConnectionStatusV1 =
  | 'credential-only'
  | 'provider-state-only'

export interface PrepareAccountConnectionRecoveryRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'discard-orphaned-local-connection-state'
  accountId: string
}

export interface AccountConnectionRecoveryChallengeV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatusV1
  requiredText: typeof ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
  expiresAt: string
  consequences: typeof ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
}

export interface ExecuteAccountConnectionRecoveryRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatusV1
  enteredText: string
}

export interface AccountConnectionRecoveryResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  operationId: string
  accountId: string
  status: 'absent'
  removed: 'credential' | 'provider-state'
  reconnectRequired: true
}

export type AccountConnectionRecoveryErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'RECOVERY_UNAVAILABLE'
  | 'RECOVERY_NOT_NEEDED'
  | 'RECOVERY_REFUSED'
  | 'CONNECTION_STATE_CHANGED'
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_TEXT_MISMATCH'
  | 'CONFIRMATION_LIMIT_REACHED'
  | 'STORAGE_UNAVAILABLE'
  | 'RECOVERY_FAILED'
  | 'PROTOCOL_ERROR'

export interface AccountConnectionRecoveryErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: AccountConnectionRecoveryErrorCodeV1
  message: string
  retryable: boolean
}

export type AccountConnectionRecoveryResponseV1<T> =
  | { ok: true; value: T }
  | { ok: false; error: AccountConnectionRecoveryErrorV1 }

export type PrepareAccountConnectionRecoveryResponseV1 =
  AccountConnectionRecoveryResponseV1<AccountConnectionRecoveryChallengeV1>
export type ExecuteAccountConnectionRecoveryResponseV1 =
  AccountConnectionRecoveryResponseV1<AccountConnectionRecoveryResultV1>

export interface PrepareGoogleAccountConnectionRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'prepare-google-account-connection'
}

export interface GoogleAccountConnectionPreflightV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'prepare-google-account-connection'
  provider: 'google'
  status: 'authorization-not-started'
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
  requestedScopes: typeof GOOGLE_CONNECT_SCOPES
  notices: typeof GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES
  nextStep: 'explicit-google-authorization-required'
}

export type GoogleAccountConnectionPreflightErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'CONNECTION_UNAVAILABLE'
  | 'PROTOCOL_ERROR'

export interface GoogleAccountConnectionPreflightErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: GoogleAccountConnectionPreflightErrorCodeV1
  message: string
  retryable: boolean
}

export type PrepareGoogleAccountConnectionResponseV1 =
  | { ok: true; value: GoogleAccountConnectionPreflightV1 }
  | { ok: false; error: GoogleAccountConnectionPreflightErrorV1 }

export interface ConnectGoogleAccountRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'connect-google-account'
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
}

export interface ConnectedGoogleAccountV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  accountId: string
  provider: 'google'
  mailboxAddress: string
  connectedAt: string
  status: 'connected-and-synced' | 'connected-sync-retry-required' | 'connected-needs-review'
  syncErrorCode?: string
}

export type GoogleAccountConnectionErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'CONNECTION_UNAVAILABLE'
  | 'CONNECTION_IN_PROGRESS'
  | 'AUTHORIZATION_DECLINED'
  | 'AUTHORIZATION_FAILED'
  | 'CONNECTION_FAILED'
  | 'PROTOCOL_ERROR'

export interface GoogleAccountConnectionErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: GoogleAccountConnectionErrorCodeV1
  message: string
  retryable: boolean
}

export type ConnectGoogleAccountResponseV1 =
  | { ok: true; value: ConnectedGoogleAccountV1 }
  | { ok: false; error: GoogleAccountConnectionErrorV1 }

export interface CancelGoogleAccountConnectionRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'cancel-google-account-connection'
}

export interface CancelGoogleAccountConnectionResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  status: 'cancellation-requested' | 'no-connection-in-progress'
}

export type CancelGoogleAccountConnectionResponseV1 =
  | { ok: true; value: CancelGoogleAccountConnectionResultV1 }
  | { ok: false; error: GoogleAccountConnectionErrorV1 }

export interface RetryGoogleAccountSyncRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'retry-google-account-sync'
  accountId: string
}

export interface RetryGoogleAccountSyncResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  accountId: string
  provider: 'google'
  status: 'synced'
  mode: 'initial' | 'incremental' | 'bounded-resync'
  batchesCommitted: number
  insertedMessages: number
  updatedMessages: number
  replayedMessages: number
}

export type GoogleAccountSyncRetryErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'SYNC_UNAVAILABLE'
  | 'ACCOUNT_NOT_CONNECTED'
  | 'CONNECTION_RECOVERY_REQUIRED'
  | 'SYNC_IN_PROGRESS'
  | 'SYNC_RETRY_NOT_ALLOWED'
  | 'SYNC_FAILED'
  | 'PROTOCOL_ERROR'

export interface GoogleAccountSyncRetryErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: GoogleAccountSyncRetryErrorCodeV1
  message: string
  retryable: boolean
}

export type RetryGoogleAccountSyncResponseV1 =
  | { ok: true; value: RetryGoogleAccountSyncResultV1 }
  | { ok: false; error: GoogleAccountSyncRetryErrorV1 }

export interface PrepareGoogleAccountDisconnectRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  action: 'disconnect-google-account'
  accountId: string
}

export interface GoogleAccountDisconnectChallengeV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'disconnect-google-account'
  accountId: string
  requiredText: typeof GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
  expiresAt: string
  consequences: typeof GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES
}

export interface ExecuteGoogleAccountDisconnectRequestV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  confirmationId: string
  operationId: string
  action: 'disconnect-google-account'
  accountId: string
  enteredText: string
}

export interface GoogleAccountDisconnectResultV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  operationId: string
  accountId: string
  status: 'disconnected'
}

export type GoogleAccountDisconnectErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'UNTRUSTED_SENDER'
  | 'DISCONNECT_UNAVAILABLE'
  | 'ACCOUNT_NOT_CONNECTED'
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_TEXT_MISMATCH'
  | 'DISCONNECT_FAILED'
  | 'PROTOCOL_ERROR'

export interface GoogleAccountDisconnectErrorV1 {
  version: typeof POSITA_PROTOCOL_VERSION
  code: GoogleAccountDisconnectErrorCodeV1
  message: string
  retryable: boolean
}

export type PrepareGoogleAccountDisconnectResponseV1 =
  | { ok: true; value: GoogleAccountDisconnectChallengeV1 }
  | { ok: false; error: GoogleAccountDisconnectErrorV1 }

export type ExecuteGoogleAccountDisconnectResponseV1 =
  | { ok: true; value: GoogleAccountDisconnectResultV1 }
  | { ok: false; error: GoogleAccountDisconnectErrorV1 }

export interface PositaDesktopApi {
  platform: string
  prototypeMode: true
  loadApplicationState(): Promise<LoadApplicationStateResponseV1>
  loadLiveMailMessageDetail(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LoadLiveMailMessageDetailResponseV1>
  openLiveMailOriginal(
    request: OpenLiveMailOriginalRequestV1
  ): Promise<OpenLiveMailOriginalResponseV1>
  onApplicationStateChanged(
    listener: (event: ApplicationStateChangedEventV1) => void
  ): () => void
  prepareLocalDataDeletion(): Promise<PrepareLocalDataDeletionResponseV1>
  executeLocalDataDeletion(
    request: ExecuteLocalDataDeletionRequestV1
  ): Promise<ExecuteLocalDataDeletionResponseV1>
  prepareAccountConnectionRecovery(
    request: PrepareAccountConnectionRecoveryRequestV1
  ): Promise<PrepareAccountConnectionRecoveryResponseV1>
  executeAccountConnectionRecovery(
    request: ExecuteAccountConnectionRecoveryRequestV1
  ): Promise<ExecuteAccountConnectionRecoveryResponseV1>
  prepareGoogleAccountConnection(): Promise<PrepareGoogleAccountConnectionResponseV1>
  connectGoogleAccount(): Promise<ConnectGoogleAccountResponseV1>
  cancelGoogleAccountConnection(): Promise<CancelGoogleAccountConnectionResponseV1>
  retryGoogleAccountSync(
    request: RetryGoogleAccountSyncRequestV1
  ): Promise<RetryGoogleAccountSyncResponseV1>
  prepareGoogleAccountDisconnect(
    request: PrepareGoogleAccountDisconnectRequestV1
  ): Promise<PrepareGoogleAccountDisconnectResponseV1>
  executeGoogleAccountDisconnect(
    request: ExecuteGoogleAccountDisconnectRequestV1
  ): Promise<ExecuteGoogleAccountDisconnectResponseV1>
}
