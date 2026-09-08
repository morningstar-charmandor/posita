import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleAccountSyncRetryCommandService } from './googleAccountSyncRetryCommand'
import type { ProviderSyncStateV1, SyncFailureCode } from './accountState'

const accountId = 'account-work-1'
const request = { version: 1, action: 'retry-google-account-sync', accountId }
const state = (lastErrorCode: SyncFailureCode = 'MALFORMED_PAYLOAD'): ProviderSyncStateV1 => ({
  version: 1, accountId, provider: 'google', status: 'error', lastErrorCode
})
const setup = () => {
  const loadSyncState = vi.fn(() => state())
  const inspect = vi.fn(async (id: string) => ({ version: 1 as const, accountId: id, status: 'connected' as const }))
  const syncAccounts = vi.fn(async () => [{
    version: 1 as const, accountId, provider: 'google' as const, status: 'failed' as const,
    errorCode: 'MALFORMED_PAYLOAD' as const, retryable: false
  }])
  const confirm = vi.fn(async () => true)
  const consume = vi.fn(() => true)
  const command = new GoogleAccountSyncRetryCommandService({ inspect }, { loadSyncState }, { syncAccounts }, 50)
  return { command, inspect, loadSyncState, syncAccounts, approval: { accountId, confirm, consume } }
}
afterEach(() => vi.useRealTimers())

describe('one-use reviewed Gmail command', () => {
  it('keeps ordinary retry disallowed and consumes reviewed permission before the sole dispatch', async () => {
    const s = setup()
    s.syncAccounts.mockImplementation(async () => {
      expect(s.approval.consume).toHaveBeenCalledOnce()
      return []
    })
    await expect(s.command.execute(request)).resolves.toMatchObject({ ok: false, error: { code: 'SYNC_RETRY_NOT_ALLOWED' } })
    expect(s.syncAccounts).not.toHaveBeenCalled()
    await s.command.executeReviewed(request, s.approval)
    expect(s.approval.confirm).toHaveBeenCalledOnce()
    expect(s.approval.consume).toHaveBeenCalledOnce()
    expect(s.syncAccounts).toHaveBeenCalledOnce()
  })

  it.each(['INVALID_CURSOR', 'PERMISSION_REVOKED', 'AUTHENTICATION_EXPIRED', 'PROVIDER_UNAVAILABLE'] as const)
    ('never overrides unrelated %s state', async (code) => {
      const s = setup()
      s.loadSyncState.mockReturnValue(state(code))
      await expect(s.command.executeReviewed(request, s.approval)).resolves.toMatchObject({ ok: false })
      expect(s.approval.confirm).not.toHaveBeenCalled()
      expect(s.approval.consume).not.toHaveBeenCalled()
      expect(s.syncAccounts).not.toHaveBeenCalled()
    })

  it('refuses cross-account approval and cancellation', async () => {
    const s = setup()
    await s.command.executeReviewed(request, { ...s.approval, accountId: 'account-other' })
    expect(s.approval.confirm).not.toHaveBeenCalled()
    s.approval.confirm.mockResolvedValue(false)
    await s.command.executeReviewed(request, s.approval)
    expect(s.approval.consume).not.toHaveBeenCalled()
    expect(s.syncAccounts).not.toHaveBeenCalled()
  })

  it('rechecks state after confirmation without rewriting it', async () => {
    const s = setup()
    s.loadSyncState.mockReturnValueOnce(state()).mockReturnValueOnce(state('INVALID_CURSOR'))
    await s.command.executeReviewed(request, s.approval)
    expect(s.approval.consume).not.toHaveBeenCalled()
    expect(s.syncAccounts).not.toHaveBeenCalled()
  })

  it('rechecks connection after confirmation', async () => {
    const s = setup()
    s.inspect.mockResolvedValueOnce({ version: 1, accountId, status: 'connected' })
      .mockRejectedValueOnce(new Error('synthetic connection failure'))
    await s.command.executeReviewed(request, s.approval)
    expect(s.approval.consume).not.toHaveBeenCalled()
    expect(s.syncAccounts).not.toHaveBeenCalled()
  })

  it.each([false, 'throw'] as const)('fails closed when receipt consumption returns %s', async (result) => {
    const s = setup()
    s.approval.consume.mockImplementation(() => {
      if (result === 'throw') throw new Error('synthetic storage failure')
      return false
    })
    await expect(s.command.executeReviewed(request, s.approval)).resolves.toMatchObject({ ok: false })
    expect(s.syncAccounts).not.toHaveBeenCalled()
  })

  it('excludes overlapping ordinary/reviewed work and cannot dispatch after a late confirmation', async () => {
    vi.useFakeTimers()
    const s = setup()
    let confirm!: (value: boolean) => void
    s.approval.confirm.mockImplementation(() => new Promise((resolve) => { confirm = resolve }))
    const running = s.command.executeReviewed(request, s.approval)
    await vi.advanceTimersByTimeAsync(0)
    await expect(s.command.execute(request)).resolves.toMatchObject({ error: { code: 'SYNC_IN_PROGRESS' } })
    await vi.advanceTimersByTimeAsync(50)
    await expect(running).resolves.toMatchObject({ error: { code: 'SYNC_FAILED' } })
    confirm(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(s.approval.consume).not.toHaveBeenCalled()
    expect(s.syncAccounts).not.toHaveBeenCalled()
  })
})
