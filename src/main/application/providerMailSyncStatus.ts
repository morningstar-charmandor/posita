import {
  isProviderSyncStateV1,
  type AccountStateRepository,
  type ProviderSyncStateV1,
  type SyncFailureCode
} from './accountState'
import {
  isSyncAccountRequestV1,
  isSyncAccountResultV1,
  type SyncAccountRequestV1
} from './mailSync'

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

export const providerMailSyncRetryPolicy = (
  errorCode: SyncFailureCode
): ProviderMailSyncRetryPolicyV1 => ({
  version: 1,
  errorCode,
  disposition: retryPolicy[errorCode]
})

export class ProviderMailSyncStatusError extends Error {
  constructor(message: string, readonly retryable: boolean, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProviderMailSyncStatusError'
  }
}

export class ProviderMailSyncStatusService {
  constructor(
    private readonly accountState: Pick<AccountStateRepository, 'loadSyncState' | 'saveSyncState'>,
    private readonly clock: { now(): Date }
  ) {}

  recordStarted(request: unknown): ProviderSyncStateV1 {
    if (!isSyncAccountRequestV1(request)) throw this.invalid()
    return this.save(request, { status: 'syncing' })
  }

  recordSucceeded(request: unknown, result: unknown): ProviderSyncStateV1 {
    if (!isSyncAccountRequestV1(request) || !isSyncAccountResultV1(result) ||
        result.accountId !== request.accountId || result.provider !== request.provider) {
      throw this.invalid()
    }
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime())) throw this.invalid()
    return this.save(request, {
      status: 'idle',
      cursor: result.cursor,
      lastSuccessAt: now.toISOString()
    })
  }

  recordFailed(request: unknown, errorCode: unknown): {
    state: ProviderSyncStateV1
    policy: ProviderMailSyncRetryPolicyV1
  } {
    if (!isSyncAccountRequestV1(request) || typeof errorCode !== 'string' ||
        !Object.hasOwn(retryPolicy, errorCode)) throw this.invalid()
    const code = errorCode as SyncFailureCode
    const policy = providerMailSyncRetryPolicy(code)
    const state = policy.disposition === 'cancelled'
      ? this.save(request, { status: 'idle' })
      : this.save(request, { status: 'error', lastErrorCode: code })
    return { state, policy }
  }

  recoverInterrupted(request: unknown): ProviderSyncStateV1 | undefined {
    if (!isSyncAccountRequestV1(request)) throw this.invalid()
    try {
      const current = this.accountState.loadSyncState(request.accountId)
      if (current === undefined) return undefined
      if (!isProviderSyncStateV1(current) ||
          current.accountId !== request.accountId || current.provider !== request.provider) {
        throw this.invalid()
      }
      if (current.status !== 'syncing') return current
      return this.save(request, { status: 'error', lastErrorCode: 'SYNC_INTERRUPTED' })
    } catch (error) {
      if (error instanceof ProviderMailSyncStatusError) throw error
      throw new ProviderMailSyncStatusError(
        'Interrupted provider-mail synchronization state could not be recovered.',
        true,
        { cause: error }
      )
    }
  }

  private save(
    request: SyncAccountRequestV1,
    update: Pick<ProviderSyncStateV1, 'status'> &
      Partial<Pick<ProviderSyncStateV1, 'cursor' | 'lastSuccessAt' | 'lastErrorCode'>>
  ): ProviderSyncStateV1 {
    try {
      const current = this.accountState.loadSyncState(request.accountId)
      const state: ProviderSyncStateV1 = {
        version: 1,
        accountId: request.accountId,
        provider: request.provider,
        status: update.status,
        ...(update.cursor !== undefined ? { cursor: update.cursor } :
          current?.cursor === undefined ? {} : { cursor: current.cursor }),
        ...(update.lastSuccessAt !== undefined ? { lastSuccessAt: update.lastSuccessAt } :
          current?.lastSuccessAt === undefined ? {} : { lastSuccessAt: current.lastSuccessAt }),
        ...(update.lastErrorCode === undefined ? {} : { lastErrorCode: update.lastErrorCode })
      }
      this.accountState.saveSyncState(state)
      return state
    } catch (error) {
      if (error instanceof ProviderMailSyncStatusError) throw error
      throw new ProviderMailSyncStatusError(
        'Provider-mail synchronization status could not be updated.',
        true,
        { cause: error }
      )
    }
  }

  private invalid(): ProviderMailSyncStatusError {
    return new ProviderMailSyncStatusError('Provider-mail synchronization status is invalid.', false)
  }
}
