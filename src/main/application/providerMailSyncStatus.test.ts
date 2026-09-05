import { describe, expect, it } from 'vitest'
import type { ProviderSyncStateV1, SyncFailureCode } from './accountState'
import {
  ProviderMailSyncStatusService,
  providerMailSyncRetryPolicy
} from './providerMailSyncStatus'

const request = { version: 1 as const, accountId: 'work', provider: 'google' as const }

const harness = (initial?: ProviderSyncStateV1) => {
  let state = initial
  const service = new ProviderMailSyncStatusService({
    loadSyncState: () => state,
    saveSyncState: (next) => { state = structuredClone(next) }
  }, { now: () => new Date('2026-09-02T08:00:00.000Z') })
  return { service, state: () => state }
}

describe('ProviderMailSyncStatusService', () => {
  it('persists start and success while preserving the last safe checkpoint', () => {
    const { service, state } = harness({
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'idle',
      cursor: 'cursor-before',
      lastSuccessAt: '2026-09-01T08:00:00.000Z'
    })
    expect(service.recordStarted(request)).toMatchObject({
      status: 'syncing', cursor: 'cursor-before', lastSuccessAt: '2026-09-01T08:00:00.000Z'
    })
    expect(service.recordSucceeded(request, {
      version: 1, accountId: 'work', provider: 'google', mode: 'incremental',
      batchesCommitted: 1, insertedMessages: 2, updatedMessages: 1,
      replayedMessages: 0, cursor: 'cursor-after'
    })).toEqual({
      version: 1, accountId: 'work', provider: 'google', status: 'idle',
      cursor: 'cursor-after', lastSuccessAt: '2026-09-02T08:00:00.000Z'
    })
    expect(state()).not.toHaveProperty('lastErrorCode')
  })

  it('records safe failure state and an exact retry disposition', () => {
    const codes: Array<[SyncFailureCode, string]> = [
      ['OFFLINE', 'retry-allowed'],
      ['QUOTA_EXHAUSTED', 'retry-later'],
      ['AUTHENTICATION_EXPIRED', 'reconnect-required'],
      ['MALFORMED_PAYLOAD', 'review-required']
    ]
    for (const [code, disposition] of codes) {
      const { service } = harness()
      expect(service.recordFailed(request, code)).toMatchObject({
        state: { status: 'error', lastErrorCode: code },
        policy: { version: 1, errorCode: code, disposition }
      })
    }
  })

  it('treats lifecycle cancellation as idle rather than a retry failure', () => {
    const { service } = harness({
      version: 1, accountId: 'work', provider: 'google', status: 'syncing',
      cursor: 'retained-cursor'
    })
    expect(service.recordFailed(request, 'SYNC_CANCELLED')).toEqual({
      state: {
        version: 1, accountId: 'work', provider: 'google', status: 'idle',
        cursor: 'retained-cursor'
      },
      policy: { version: 1, errorCode: 'SYNC_CANCELLED', disposition: 'cancelled' }
    })
  })

  it('recovers only a persisted interrupted sync into an explicit retryable failure', () => {
    const { service, state } = harness({
      version: 1, accountId: 'work', provider: 'google', status: 'syncing',
      cursor: 'retained-cursor'
    })

    expect(service.recoverInterrupted(request)).toEqual({
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'error',
      cursor: 'retained-cursor',
      lastErrorCode: 'SYNC_INTERRUPTED'
    })
    expect(state()).toEqual(service.recoverInterrupted(request))
    expect(providerMailSyncRetryPolicy('SYNC_INTERRUPTED').disposition).toBe('retry-allowed')
  })

  it('rejects mismatched results and maps repository failures safely', () => {
    const { service } = harness()
    expect(() => service.recordSucceeded(request, {
      version: 1, accountId: 'personal', provider: 'google', mode: 'initial',
      batchesCommitted: 1, insertedMessages: 0, updatedMessages: 0,
      replayedMessages: 0, cursor: 'cursor'
    })).toThrowError(expect.objectContaining({ retryable: false }))
    expect(providerMailSyncRetryPolicy('SYNC_STORAGE_FAILED')).toEqual({
      version: 1,
      errorCode: 'SYNC_STORAGE_FAILED',
      disposition: 'retry-allowed'
    })

    const unavailable = new ProviderMailSyncStatusService({
      loadSyncState: () => { throw new Error('private detail') },
      saveSyncState: () => undefined
    }, { now: () => new Date() })
    expect(() => unavailable.recordStarted(request)).toThrowError(expect.objectContaining({
      message: 'Provider-mail synchronization status could not be updated.', retryable: true
    }))
  })
})
