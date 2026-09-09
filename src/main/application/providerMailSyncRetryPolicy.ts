import {
  isProviderSyncState, providerQuotaCooldownDurationMs, PROVIDER_QUOTA_MAX_STREAK,
  type ProviderSyncState, type ProviderSyncStateV2, type SyncFailureCode
} from './accountState.ts'
import type { LiveMailSyncRetryAvailabilityV1 } from '../../shared/liveMail.ts'

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

/** No timer or provider action: trusted command and projection share this clock-based decision. */
export const providerMailSyncRetryAvailability = (
  state: ProviderSyncState | undefined, nowMs: number
): LiveMailSyncRetryAvailabilityV1 => {
  if (!Number.isFinite(nowMs) || !isProviderSyncState(state) || state.status !== 'error' ||
      state.lastErrorCode === undefined) return 'unavailable'
  const disposition = providerMailSyncRetryPolicy(state.lastErrorCode).disposition
  if (disposition !== 'retry-allowed' && disposition !== 'retry-later') return 'unavailable'
  if (state.version === 2) {
    return nowMs < Date.parse(state.quotaCooldown.notBefore) ? 'quota-waiting' : 'quota-ready'
  }
  return disposition === 'retry-later' ? 'quota-setup' : 'available'
}

/** Explicit V1->V2 transition; preserves private cursor and never assumes a past quota reset. */
export const withProviderQuotaCooldown = (
  state: ProviderSyncState, nowMs: number, increment: boolean
): ProviderSyncStateV2 => {
  if (!isProviderSyncState(state) || !Number.isFinite(nowMs)) throw new Error('Invalid cooldown state')
  const previous = state.version === 2 ? state.quotaCooldown.failureStreak : 0
  const failureStreak = Math.min(PROVIDER_QUOTA_MAX_STREAK, Math.max(1, previous + (increment ? 1 : 0)))
  const startedAt = new Date(nowMs).toISOString()
  const notBefore = new Date(nowMs + providerQuotaCooldownDurationMs(failureStreak)).toISOString()
  return { ...state, version: 2, quotaCooldown: { version: 1, failureStreak, startedAt, notBefore } }
}
