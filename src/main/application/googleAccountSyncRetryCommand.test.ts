import { describe, expect, it, vi } from 'vitest'
import type { AccountConnectionConsistencyInspector } from './accountConnection'
import type { ProviderSyncStateV1, SyncFailureCode } from './accountState'
import { GoogleAccountSyncRetryCommandService } from './googleAccountSyncRetryCommand'
import type { ProviderMailLifecycleAccountOutcomeV1 } from './providerMailLifecycleOwner'

const request = {
  version: 1 as const,
  action: 'retry-google-account-sync' as const,
  accountId: 'account-work-1'
}

const syncState = (lastErrorCode: SyncFailureCode = 'PROVIDER_UNAVAILABLE'): ProviderSyncStateV1 => ({
  version: 1,
  accountId: request.accountId,
  provider: 'google',
  status: 'error',
  lastErrorCode
})

const synced = (): ProviderMailLifecycleAccountOutcomeV1 => ({
  version: 1,
  accountId: request.accountId,
  provider: 'google',
  status: 'synced',
  result: {
    version: 1,
    accountId: request.accountId,
    provider: 'google',
    mode: 'initial',
    batchesCommitted: 2,
    insertedMessages: 3,
    updatedMessages: 1,
    replayedMessages: 0,
    cursor: 'private-cursor'
  }
})

const connection = (
  status: 'absent' | 'connected' | 'credential-only' | 'provider-state-only' = 'connected'
): AccountConnectionConsistencyInspector => ({
  inspect: async (accountId) => ({ version: 1, accountId, status })
})

describe('GoogleAccountSyncRetryCommandService', () => {
  it('runs one reviewed retry through the lifecycle owner and omits private cursor state', async () => {
    const syncAccounts = vi.fn(async () => [synced()])
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts }
    )

    await expect(service.execute(request)).resolves.toEqual({
      ok: true,
      value: {
        version: 1,
        accountId: request.accountId,
        provider: 'google',
        status: 'synced',
        mode: 'initial',
        batchesCommitted: 2,
        insertedMessages: 3,
        updatedMessages: 1,
        replayedMessages: 0
      }
    })
    expect(syncAccounts).toHaveBeenCalledExactlyOnceWith(
      [{
        version: 1,
        accountId: request.accountId,
        provider: 'google'
      }],
      expect.any(AbortSignal)
    )
  })

  it('rejects malformed, unavailable, absent, and one-sided connection states', async () => {
    await expect(new GoogleAccountSyncRetryCommandService().execute(request))
      .resolves.toMatchObject({ ok: false, error: { code: 'SYNC_UNAVAILABLE' } })
    await expect(new GoogleAccountSyncRetryCommandService().execute({ ...request, send: true }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })

    for (const status of ['absent', 'credential-only', 'provider-state-only'] as const) {
      const service = new GoogleAccountSyncRetryCommandService(
        connection(status),
        { loadSyncState: () => syncState() },
        { syncAccounts: async () => [synced()] }
      )
      await expect(service.execute(request)).resolves.toMatchObject({
        ok: false,
        error: { code: status === 'absent' ? 'ACCOUNT_NOT_CONNECTED' : 'CONNECTION_RECOVERY_REQUIRED' }
      })
    }

    const mismatched = new GoogleAccountSyncRetryCommandService(
      { inspect: async () => ({ version: 1, accountId: 'another-account', status: 'connected' }) },
      { loadSyncState: () => syncState() },
      { syncAccounts: async () => [synced()] }
    )
    await expect(mismatched.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_UNAVAILABLE', retryable: false }
    })
  })

  it('permits only durable failures whose fixed policy explicitly allows retry', async () => {
    const syncAccounts = vi.fn(async () => [synced()])
    for (const state of [
      undefined,
      { ...syncState(), status: 'idle', lastErrorCode: undefined } as ProviderSyncStateV1,
      syncState('QUOTA_EXHAUSTED'),
      syncState('AUTHENTICATION_EXPIRED'),
      syncState('INVALID_CURSOR')
    ]) {
      const service = new GoogleAccountSyncRetryCommandService(
        connection(),
        { loadSyncState: () => state },
        { syncAccounts }
      )
      await expect(service.execute(request)).resolves.toMatchObject({
        ok: false,
        error: { code: 'SYNC_RETRY_NOT_ALLOWED', retryable: false }
      })
    }
    expect(syncAccounts).not.toHaveBeenCalled()
  })

  it('refuses overlapping retries for the same account', async () => {
    let finish: ((value: ProviderMailLifecycleAccountOutcomeV1[]) => void) | undefined
    const pending = new Promise<ProviderMailLifecycleAccountOutcomeV1[]>((resolve) => {
      finish = resolve
    })
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts: () => pending }
    )

    const first = service.execute(request)
    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_IN_PROGRESS', retryable: false }
    })
    finish?.([synced()])
    await expect(first).resolves.toMatchObject({ ok: true })
  })

  it('bounds the complete attempt and keeps overlap blocked until cancellation settles', async () => {
    let finish: ((value: ProviderMailLifecycleAccountOutcomeV1[]) => void) | undefined
    const pending = new Promise<ProviderMailLifecycleAccountOutcomeV1[]>((resolve) => {
      finish = resolve
    })
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts: () => pending },
      5
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SYNC_FAILED',
        retryable: true,
        message: expect.stringContaining('cancelled the bounded attempt')
      }
    })
    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_IN_PROGRESS', retryable: false }
    })

    finish?.([synced()])
    await Promise.resolve()
    await expect(service.execute(request)).resolves.toMatchObject({ ok: true })
  })

  it('returns only bounded safe failures from lifecycle and unexpected errors', async () => {
    const retryableFailure = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts: async () => [{
        version: 1,
        accountId: request.accountId,
        provider: 'google',
        status: 'retry-required',
        errorCode: 'PROVIDER_UNAVAILABLE',
        retryable: true
      }] }
    )
    await expect(retryableFailure.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_FAILED', retryable: true }
    })

    const unexpected = new GoogleAccountSyncRetryCommandService(
      { inspect: async () => { throw new Error('private failure') } },
      { loadSyncState: () => syncState() },
      { syncAccounts: async () => [synced()] }
    )
    await expect(unexpected.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_FAILED', retryable: true }
    })
  })
})
