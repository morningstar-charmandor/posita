import { describe, expect, it, vi } from 'vitest'
import type { AccountConnectionConsistencyInspector } from './accountConnection'
import type { ProviderSyncState, SyncFailureCode } from './accountState'
import { GoogleAccountSyncRetryCommandService } from './googleAccountSyncRetryCommand'
import type { ProviderMailLifecycleAccountOutcomeV1 } from './providerMailLifecycleOwner'
import type { ProviderMailSyncStageEventV1 } from './providerMailSyncDiagnostics'

const request = {
  version: 1 as const,
  action: 'retry-google-account-sync' as const,
  accountId: 'account-work-1'
}

const syncState = (lastErrorCode: SyncFailureCode = 'PROVIDER_UNAVAILABLE'): ProviderSyncState => ({
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
    const events: ProviderMailSyncStageEventV1[] = []
    const syncAccounts = vi.fn(async () => [synced()])
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts },
      undefined,
      { report: (event) => events.push(event) }
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
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:completed',
      'sync-state-read:started',
      'sync-state-read:completed',
      'sync-retry-eligibility:started',
      'sync-retry-eligibility:completed',
      'lifecycle-dispatch:started',
      'lifecycle-dispatch:completed',
      'sync-retry-command:completed'
    ])
  })

  it('marks a failed connection preflight without entering lifecycle work', async () => {
    const events: ProviderMailSyncStageEventV1[] = []
    const syncAccounts = vi.fn(async () => [synced()])
    const service = new GoogleAccountSyncRetryCommandService(
      { inspect: async () => { throw new Error('test-only preflight failure') } },
      { loadSyncState: () => syncState() },
      { syncAccounts },
      undefined,
      { report: (event) => events.push(event) }
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_FAILED', retryable: true }
    })
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:failed',
      'sync-retry-command:completed'
    ])
    expect(syncAccounts).not.toHaveBeenCalled()
  })

  it('marks encrypted sync-state read failure without entering lifecycle work', async () => {
    const events: ProviderMailSyncStageEventV1[] = []
    const syncAccounts = vi.fn(async () => [synced()])
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => { throw new Error('test-only private state failure') } },
      { syncAccounts },
      undefined,
      { report: (event) => events.push(event) }
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_FAILED', retryable: true }
    })
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:completed',
      'sync-state-read:started',
      'sync-state-read:failed',
      'sync-retry-command:completed'
    ])
    expect(syncAccounts).not.toHaveBeenCalled()
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
      { ...syncState(), status: 'idle', lastErrorCode: undefined } as ProviderSyncState,
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

  it('separates retry eligibility rejection from lifecycle dispatch', async () => {
    const events: ProviderMailSyncStageEventV1[] = []
    const syncAccounts = vi.fn(async () => [synced()])
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState('AUTHENTICATION_EXPIRED') },
      { syncAccounts },
      undefined,
      { report: (event) => events.push(event) }
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_RETRY_NOT_ALLOWED', retryable: false }
    })
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:completed',
      'sync-state-read:started',
      'sync-state-read:completed',
      'sync-retry-eligibility:started',
      'sync-retry-eligibility:failed',
      'sync-retry-command:completed'
    ])
    expect(syncAccounts).not.toHaveBeenCalled()
  })

  it('marks a synchronous lifecycle dispatch failure and still settles the safe command', async () => {
    const events: ProviderMailSyncStageEventV1[] = []
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      { syncAccounts: () => { throw new Error('test-only dispatch failure') } },
      undefined,
      { report: (event) => events.push(event) }
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_FAILED', retryable: true }
    })
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'connection-preflight:completed',
      'sync-state-read:started',
      'sync-state-read:completed',
      'sync-retry-eligibility:started',
      'sync-retry-eligibility:completed',
      'lifecycle-dispatch:started',
      'lifecycle-dispatch:failed',
      'sync-retry-command:completed'
    ])
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
    await new Promise<void>((resolve) => setImmediate(resolve))
    await expect(service.execute(request)).resolves.toMatchObject({ ok: true })
  })

  it('starts the complete-attempt deadline before connection preflight', async () => {
    let finishInspection: ((value: {
      version: 1
      accountId: string
      status: 'connected'
    }) => void) | undefined
    let inspectionCalls = 0
    const firstInspection = new Promise<{
      version: 1
      accountId: string
      status: 'connected'
    }>((resolve) => { finishInspection = resolve })
    const syncAccounts = vi.fn(async () => [synced()])
    const events: ProviderMailSyncStageEventV1[] = []
    const service = new GoogleAccountSyncRetryCommandService(
      {
        inspect: async (accountId) => {
          inspectionCalls += 1
          return inspectionCalls === 1
            ? firstInspection
            : { version: 1, accountId, status: 'connected' }
        }
      },
      { loadSyncState: () => syncState() },
      { syncAccounts },
      5,
      { report: (event) => events.push(event) }
    )

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SYNC_FAILED',
        retryable: true,
        message: expect.stringContaining('cancelled the bounded attempt')
      }
    })
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'sync-retry-command:started',
      'connection-preflight:started',
      'sync-retry-command:completed'
    ])
    expect(syncAccounts).not.toHaveBeenCalled()
    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SYNC_IN_PROGRESS', retryable: false }
    })

    finishInspection?.({ version: 1, accountId: request.accountId, status: 'connected' })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await expect(service.execute(request)).resolves.toMatchObject({ ok: true })
    expect(syncAccounts).toHaveBeenCalledTimes(1)
  })

  it('keeps the whole-attempt deadline referenced by the Electron main event loop', async () => {
    const timerSpy = vi.spyOn(globalThis, 'setTimeout')
    let timerWasReferenced = false
    const service = new GoogleAccountSyncRetryCommandService(
      connection(),
      { loadSyncState: () => syncState() },
      {
        syncAccounts: async () => {
          const handle: unknown = timerSpy.mock.results.at(-1)?.value
          if (typeof handle === 'object' && handle !== null && 'hasRef' in handle) {
            const hasRef = (handle as { hasRef?: unknown }).hasRef
            if (typeof hasRef === 'function') {
              timerWasReferenced = hasRef.call(handle) === true
            }
          }
          return [synced()]
        }
      }
    )

    try {
      await expect(service.execute(request)).resolves.toMatchObject({ ok: true })
      expect(timerWasReferenced).toBe(true)
    } finally {
      timerSpy.mockRestore()
    }
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
