import type { SyncFailureCode } from './accountState.ts'

export type ProviderMailSyncRetryDispositionV1 =
  | 'retry-allowed'
  | 'retry-later'
  | 'reconnect-required'
  | 'review-required'
  | 'cancelled'

export interface ProviderMailSyncRetryPolicyV1 {
  version: 1
  errorCode: SyncFailureCode
  disposition: ProviderMailSyncRetryDispositionV1
}

const retryPolicy: Record<SyncFailureCode, ProviderMailSyncRetryDispositionV1> = {
  OFFLINE: 'retry-allowed',
  PROVIDER_UNAVAILABLE: 'retry-allowed',
  QUOTA_EXHAUSTED: 'retry-later',
  AUTHENTICATION_EXPIRED: 'reconnect-required',
  PERMISSION_REVOKED: 'reconnect-required',
  INVALID_CURSOR: 'review-required',
  MALFORMED_PAYLOAD: 'review-required',
  INVALID_SYNC_REQUEST: 'review-required',
  SYNC_CHECKPOINT_CONFLICT: 'review-required',
  SYNC_STORAGE_FAILED: 'retry-allowed',
  SYNC_BATCH_LIMIT_REACHED: 'retry-allowed',
  SYNC_CANCELLED: 'cancelled',
  SYNC_ATTEMPT_TIMED_OUT: 'retry-allowed',
  SYNC_INTERRUPTED: 'retry-allowed'
}

export const isProviderMailSyncFailureCode = (value: unknown): value is SyncFailureCode =>
  typeof value === 'string' && Object.hasOwn(retryPolicy, value)

export const providerMailSyncRetryPolicy = (
  errorCode: SyncFailureCode
): ProviderMailSyncRetryPolicyV1 => ({
  version: 1,
  errorCode,
  disposition: retryPolicy[errorCode]
})
