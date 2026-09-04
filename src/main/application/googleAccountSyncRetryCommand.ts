import {
  POSITA_PROTOCOL_VERSION,
  type GoogleAccountSyncRetryErrorCodeV1,
  type GoogleAccountSyncRetryErrorV1,
  type RetryGoogleAccountSyncResponseV1
} from '../../shared/contracts'
import {
  isRetryGoogleAccountSyncRequest,
  isRetryGoogleAccountSyncResponse
} from '../../shared/validation'
import {
  isAccountConnectionConsistencyV1,
  type AccountConnectionConsistencyInspector
} from './accountConnection'
import { isProviderSyncStateV1, type AccountStateRepository } from './accountState'
import { isSyncAccountResultV1 } from './mailSync'
import {
  providerMailSyncRetryPolicy,
  type ProviderMailSyncRetryDispositionV1
} from './providerMailSyncStatus'
import type {
  ProviderMailLifecycleAccountOutcomeV1,
  ProviderMailLifecycleOwner
} from './providerMailLifecycleOwner'

const error = (
  code: GoogleAccountSyncRetryErrorCodeV1,
  message: string,
  retryable: boolean
): { ok: false; error: GoogleAccountSyncRetryErrorV1 } => ({
  ok: false,
  error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable }
})

const notAllowedMessage: Record<ProviderMailSyncRetryDispositionV1, string> = {
  'retry-allowed': 'Gmail synchronization can be retried.',
  'retry-later': 'Gmail synchronization should be retried later.',
  'reconnect-required': 'Reconnect this Google account before synchronizing again.',
  'review-required': 'This synchronization state requires review before another provider request.',
  cancelled: 'The cancelled synchronization does not require a retry.'
}

export interface GoogleAccountSyncRetryState {
  loadSyncState: Pick<AccountStateRepository, 'loadSyncState'>['loadSyncState']
}

export interface GoogleAccountSyncRetryLifecycle {
  syncAccounts(
    accounts: unknown
  ): Promise<ProviderMailLifecycleAccountOutcomeV1[]>
}

/**
 * Trusted command boundary for one user-requested read-only provider retry. It
 * accepts only a complete connected account whose durable failure policy allows
 * retry, and delegates all provider work to the existing lifecycle owner.
 */
export class GoogleAccountSyncRetryCommandService {
  private readonly activeAccounts = new Set<string>()

  constructor(
    private readonly connection?: AccountConnectionConsistencyInspector,
    private readonly accountState?: GoogleAccountSyncRetryState,
    private readonly lifecycle?: GoogleAccountSyncRetryLifecycle
  ) {}

  async execute(requestValue: unknown): Promise<RetryGoogleAccountSyncResponseV1> {
    if (!isRetryGoogleAccountSyncRequest(requestValue)) {
      return error('INVALID_REQUEST', 'The Gmail synchronization retry request was invalid.', false)
    }
    if (!this.connection || !this.accountState || !this.lifecycle) {
      return error('SYNC_UNAVAILABLE', 'Gmail synchronization is unavailable in the current application state.', false)
    }
    const request = structuredClone(requestValue)
    if (this.activeAccounts.has(request.accountId)) {
      return error('SYNC_IN_PROGRESS', 'A Gmail synchronization is already running for this account.', false)
    }
    this.activeAccounts.add(request.accountId)
    try {
      const consistency = await this.connection.inspect(request.accountId)
      if (!isAccountConnectionConsistencyV1(consistency) ||
          consistency.accountId !== request.accountId) {
        return error(
          'SYNC_UNAVAILABLE',
          'Posita could not verify this Google account connection safely.',
          false
        )
      }
      if (consistency.status === 'absent') {
        return error('ACCOUNT_NOT_CONNECTED', 'This Google account is not connected to Posita.', false)
      }
      if (consistency.status !== 'connected') {
        return error(
          'CONNECTION_RECOVERY_REQUIRED',
          'This Google account has incomplete local connection state and cannot synchronize.',
          false
        )
      }

      const syncState = this.accountState.loadSyncState(request.accountId)
      if (syncState === undefined || !isProviderSyncStateV1(syncState) ||
          syncState.accountId !== request.accountId || syncState.provider !== 'google') {
        return error(
          'SYNC_RETRY_NOT_ALLOWED',
          'This Google account does not have a valid retryable synchronization state.',
          false
        )
      }
      if (syncState.status === 'syncing') {
        return error('SYNC_IN_PROGRESS', 'A Gmail synchronization is already recorded for this account.', false)
      }
      if (syncState.status !== 'error' || syncState.lastErrorCode === undefined) {
        return error('SYNC_RETRY_NOT_ALLOWED', 'This Google account does not currently need a synchronization retry.', false)
      }
      const policy = providerMailSyncRetryPolicy(syncState.lastErrorCode)
      if (policy.disposition !== 'retry-allowed') {
        return error('SYNC_RETRY_NOT_ALLOWED', notAllowedMessage[policy.disposition], false)
      }

      const outcomes = await this.lifecycle.syncAccounts([{
        version: POSITA_PROTOCOL_VERSION,
        accountId: request.accountId,
        provider: 'google'
      }])
      return this.mapOutcome(request.accountId, outcomes)
    } catch {
      return error(
        'SYNC_FAILED',
        'Posita could not complete the Gmail synchronization safely.',
        true
      )
    } finally {
      this.activeAccounts.delete(request.accountId)
    }
  }

  private mapOutcome(
    accountId: string,
    outcomes: ProviderMailLifecycleAccountOutcomeV1[]
  ): RetryGoogleAccountSyncResponseV1 {
    const outcome = outcomes.length === 1 ? outcomes[0] : undefined
    if (!outcome || outcome.accountId !== accountId || outcome.provider !== 'google') {
      return error('SYNC_FAILED', 'Posita returned an invalid Gmail synchronization result.', false)
    }
    if (outcome.status !== 'synced') {
      return error(
        'SYNC_FAILED',
        outcome.retryable
          ? 'Gmail synchronization did not complete. Posita kept the existing encrypted local cache unchanged where possible.'
          : 'Gmail synchronization requires review before it can run again.',
        outcome.retryable
      )
    }
    if (!isSyncAccountResultV1(outcome.result) || outcome.result.accountId !== accountId ||
        outcome.result.provider !== 'google') {
      return error('SYNC_FAILED', 'Posita returned an invalid Gmail synchronization result.', false)
    }
    const response: RetryGoogleAccountSyncResponseV1 = {
      ok: true,
      value: {
        version: POSITA_PROTOCOL_VERSION,
        accountId,
        provider: 'google',
        status: 'synced',
        mode: outcome.result.mode,
        batchesCommitted: outcome.result.batchesCommitted,
        insertedMessages: outcome.result.insertedMessages,
        updatedMessages: outcome.result.updatedMessages,
        replayedMessages: outcome.result.replayedMessages
      }
    }
    return isRetryGoogleAccountSyncResponse(response)
      ? response
      : error('SYNC_FAILED', 'Posita returned an invalid Gmail synchronization result.', false)
  }
}

export type GoogleAccountSyncRetryCommandLifecycle = Pick<
  ProviderMailLifecycleOwner,
  'syncAccounts'
>
