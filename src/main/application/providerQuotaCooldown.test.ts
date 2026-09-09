import { describe, expect, it, vi } from 'vitest'
import { isProviderSyncState, type ProviderSyncState } from './accountState'
import { providerMailSyncRetryAvailability, withProviderQuotaCooldown } from './providerMailSyncRetryPolicy'
import { ProviderMailSyncStatusService } from './providerMailSyncStatus'
import { GoogleAccountSyncRetryCommandService } from './googleAccountSyncRetryCommand'

const now = Date.parse('2026-09-09T12:00:00.000Z')
const request = { version: 1, action: 'retry-google-account-sync', accountId: 'work' } as const
const setupRequest = { ...request, quotaIntent: { version: 1, action: 'start-cooldown' } } as const
const resumeRequest = { ...request, quotaIntent: { version: 1, action: 'resume' } } as const
const syncRequest = { version: 1, accountId: 'work', provider: 'google' } as const
const legacy = (): ProviderSyncState => ({
  version: 1, accountId: 'work', provider: 'google', status: 'error',
  lastErrorCode: 'QUOTA_EXHAUSTED', cursor: 'private-synthetic-cursor'
})
const harness = (initial = legacy()) => {
  let state = structuredClone(initial)
  let time = now
  const store = { loadSyncState: () => state, saveSyncState: vi.fn((next: ProviderSyncState) => { state = next }) }
  const clock = { now: () => new Date(time) }
  const syncAccounts = vi.fn(async () => [])
  const command = new GoogleAccountSyncRetryCommandService({
    inspect: async (accountId) => ({ version: 1, accountId, status: 'connected' })
  }, store, { syncAccounts }, undefined, undefined, clock)
  return { store, clock, syncAccounts, command, state: () => state, setTime: (value: number) => { time = value },
    status: new ProviderMailSyncStatusService(store, clock) }
}

describe('durable quota cooldown', () => {
  it('keeps legacy reads unchanged and upgrades only through explicit local setup', async () => {
    const h = harness()
    expect(providerMailSyncRetryAvailability(h.state(), now)).toBe('quota-setup')
    expect(h.store.saveSyncState).not.toHaveBeenCalled()
    expect(h.state()).toEqual(legacy())
    expect(await h.command.execute(setupRequest)).toMatchObject({ ok: false, error: { code: 'SYNC_RETRY_NOT_ALLOWED' } })
    expect(h.state()).toMatchObject({ version: 2, cursor: 'private-synthetic-cursor',
      lastErrorCode: 'QUOTA_EXHAUSTED', quotaCooldown: { failureStreak: 1, notBefore: '2026-09-09T12:15:00.000Z' } })
    expect(h.syncAccounts).not.toHaveBeenCalled()
    const prepared = structuredClone(h.state())
    await h.command.execute(setupRequest)
    expect(h.state()).toEqual(prepared)
    expect(h.store.saveSyncState).toHaveBeenCalledOnce()
  })

  it('never dispatches early; expiry only permits an explicit call that reserves another wait', async () => {
    const h = harness(withProviderQuotaCooldown(legacy(), now, false))
    h.setTime(now + 15 * 60_000 - 1)
    await h.command.execute(resumeRequest)
    expect(h.syncAccounts).not.toHaveBeenCalled()
    h.setTime(now + 15 * 60_000)
    expect(providerMailSyncRetryAvailability(h.state(), h.clock.now().getTime())).toBe('quota-ready')
    expect(h.syncAccounts).not.toHaveBeenCalled()
    h.syncAccounts.mockImplementation(async () => {
      expect(providerMailSyncRetryAvailability(h.state(), h.clock.now().getTime())).toBe('quota-waiting')
      return []
    })
    await h.command.execute(resumeRequest)
    expect(h.syncAccounts).toHaveBeenCalledOnce()
    await h.command.execute(resumeRequest)
    expect(h.syncAccounts).toHaveBeenCalledOnce()
  })

  it('preserves backoff through start, cancellation and interrupted-state recovery', () => {
    const h = harness(withProviderQuotaCooldown(legacy(), now, false))
    h.status.recordStarted(syncRequest)
    h.status.recoverInterrupted(syncRequest)
    expect(providerMailSyncRetryAvailability(h.state(), now)).toBe('quota-waiting')
    h.status.recordStarted(syncRequest)
    h.status.recordFailed(syncRequest, 'SYNC_CANCELLED')
    expect(h.state()).toMatchObject({ version: 2, status: 'idle', quotaCooldown: { failureStreak: 1 } })
  })

  it('doubles repeated quota pauses to one hour, and clears history only after full success', () => {
    const h = harness()
    for (const [streak, duration] of [[1, 15], [2, 30], [3, 60], [3, 60]] as const) {
      h.status.recordStarted(syncRequest)
      h.status.recordFailed(syncRequest, 'QUOTA_EXHAUSTED')
      expect(h.state()).toMatchObject({ quotaCooldown: { failureStreak: streak,
        notBefore: new Date(now + duration * 60_000).toISOString() } })
    }
    h.status.recordSucceeded(syncRequest, { version: 1, accountId: 'work', provider: 'google', mode: 'incremental',
      batchesCommitted: 1, insertedMessages: 0, updatedMessages: 0, replayedMessages: 0, cursor: 'new-cursor' })
    expect(h.state()).toMatchObject({ version: 1, status: 'idle', cursor: 'new-cursor' })
    expect(h.state()).not.toHaveProperty('quotaCooldown')
  })

  it.each(['AUTHENTICATION_EXPIRED', 'PERMISSION_REVOKED', 'MALFORMED_PAYLOAD', 'INVALID_CURSOR'] as const)(
    'never widens %s eligibility even with an expired cooldown', async (code) => {
      const state = withProviderQuotaCooldown({ ...legacy(), lastErrorCode: code }, now, false)
      const h = harness(state)
      h.setTime(now + 60 * 60_000)
      expect(providerMailSyncRetryAvailability(h.state(), h.clock.now().getTime())).toBe('unavailable')
      await h.command.execute(request)
      expect(h.syncAccounts).not.toHaveBeenCalled()
      expect(h.store.saveSyncState).not.toHaveBeenCalled()
    })

  it.each([NaN, now - 1, now + 15 * 60_000 - 1])('refuses invalid or too-early clocks without writes (%s)', async (time) => {
    const h = harness(withProviderQuotaCooldown(legacy(), now, false))
    h.setTime(time)
    await h.command.execute(request)
    expect(h.syncAccounts).not.toHaveBeenCalled()
    expect(h.store.saveSyncState).not.toHaveBeenCalled()
  })

  it('fails closed when cooldown persistence fails before dispatch', async () => {
    const h = harness(withProviderQuotaCooldown(legacy(), now, false))
    h.setTime(now + 15 * 60_000)
    h.store.saveSyncState.mockImplementation(() => { throw new Error('private-storage-error') })
    const result = await h.command.execute(resumeRequest)
    expect(result).toMatchObject({ ok: false, error: { code: 'SYNC_FAILED' } })
    expect(JSON.stringify(result)).not.toContain('private-storage-error')
    expect(h.syncAccounts).not.toHaveBeenCalled()
  })

  it('rejects cross-account stored state before local writes or provider work', async () => {
    const h = harness({ ...legacy(), accountId: 'other' })
    await h.command.execute(request)
    expect(h.syncAccounts).not.toHaveBeenCalled()
    expect(h.store.saveSyncState).not.toHaveBeenCalled()
  })

  it('never turns stale local setup or an ordinary retry into provider resume', async () => {
    const h = harness()
    await h.command.execute(request)
    await h.command.execute(resumeRequest)
    expect(h.store.saveSyncState).not.toHaveBeenCalled()
    await h.command.execute(setupRequest)
    h.setTime(now + 15 * 60_000)
    await h.command.execute(setupRequest)
    await h.command.execute(request)
    expect(h.store.saveSyncState).toHaveBeenCalledOnce()
    expect(h.syncAccounts).not.toHaveBeenCalled()
    await h.command.execute(resumeRequest)
    expect(h.syncAccounts).toHaveBeenCalledOnce()
  })

  it('refuses overlapping quota resumes while the existing lifecycle owns the attempt', async () => {
    const h = harness(withProviderQuotaCooldown(legacy(), now, false))
    h.setTime(now + 15 * 60_000)
    let finish: (() => void) | undefined
    h.syncAccounts.mockImplementation(() => new Promise((resolve) => { finish = () => resolve([]) }))
    const first = h.command.execute(resumeRequest)
    await vi.waitFor(() => expect(h.syncAccounts).toHaveBeenCalledOnce())
    expect(await h.command.execute(resumeRequest)).toMatchObject({ ok: false, error: { code: 'SYNC_IN_PROGRESS' } })
    finish?.()
    await first
    expect(h.syncAccounts).toHaveBeenCalledOnce()
  })

  it('strictly validates the versioned metadata and refuses silent V1 extensions', () => {
    const state = withProviderQuotaCooldown(legacy(), now, false)
    expect(isProviderSyncState(state)).toBe(true)
    expect(isProviderSyncState({ ...state, version: 1 })).toBe(false)
    for (const quotaCooldown of [undefined, null, { ...state.quotaCooldown, failureStreak: 4 },
      { ...state.quotaCooldown, failureStreak: 1.5 }, { ...state.quotaCooldown, notBefore: 'invalid' },
      { ...state.quotaCooldown, notBefore: '2026-09-09T12:00:00.000Z' },
      { ...state.quotaCooldown, providerReason: 'private' }]) {
      expect(isProviderSyncState({ ...state, quotaCooldown })).toBe(false)
    }
    expect(() => withProviderQuotaCooldown(state, NaN, false)).toThrow()
  })
})
