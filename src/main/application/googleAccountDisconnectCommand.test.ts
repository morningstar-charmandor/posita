import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT } from '../../shared/contracts'
import { GoogleAccountDisconnectCommandService } from './googleAccountDisconnectCommand'

const clock = { now: () => new Date('2026-09-03T12:00:00.000Z') }

const harness = () => {
  const saved: unknown[] = []
  const disconnectAccount = vi.fn().mockResolvedValue({
    version: 1,
    operationId: 'operation-1',
    accountId: 'account-1',
    status: 'completed'
  })
  const ids = ['confirmation-1', 'operation-1']
  const service = new GoogleAccountDisconnectCommandService(
    { inspect: async (accountId) => ({ version: 1, accountId, status: 'connected' }) },
    { disconnectAccount },
    { save: (record) => saved.push(record) },
    clock,
    () => ids.shift() ?? 'unused'
  )
  return { service, saved, disconnectAccount }
}

describe('GoogleAccountDisconnectCommandService', () => {
  it('records exact confirmation before the journaled disconnect', async () => {
    const { service, saved, disconnectAccount } = harness()
    const prepared = await service.prepare({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })
    expect(prepared).toMatchObject({ ok: true })
    if (!prepared.ok) throw new Error('Expected challenge.')

    await expect(service.execute({
      version: 1,
      confirmationId: prepared.value.confirmationId,
      operationId: prepared.value.operationId,
      action: prepared.value.action,
      accountId: prepared.value.accountId,
      enteredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
    })).resolves.toEqual({
      ok: true,
      value: {
        version: 1,
        operationId: 'operation-1',
        accountId: 'account-1',
        status: 'disconnected'
      }
    })
    expect(saved).toEqual([expect.objectContaining({
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      accountId: 'account-1'
    })])
    expect(disconnectAccount).toHaveBeenCalledTimes(1)
  })

  it('refuses mismatched text and accounts that are no longer connected', async () => {
    const { service, disconnectAccount } = harness()
    const prepared = await service.prepare({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })
    if (!prepared.ok) throw new Error('Expected challenge.')
    await expect(service.execute({
      version: 1,
      confirmationId: prepared.value.confirmationId,
      operationId: prepared.value.operationId,
      action: prepared.value.action,
      accountId: prepared.value.accountId,
      enteredText: 'disconnect'
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_TEXT_MISMATCH' }
    })
    expect(disconnectAccount).not.toHaveBeenCalled()

    const unavailable = new GoogleAccountDisconnectCommandService(
      { inspect: async (accountId) => ({ version: 1, accountId, status: 'absent' }) },
      { disconnectAccount },
      { save: vi.fn() },
      clock,
      () => 'id'
    )
    await expect(unavailable.prepare({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })).resolves.toMatchObject({ ok: false, error: { code: 'ACCOUNT_NOT_CONNECTED' } })
  })

  it('reuses the original audit receipt when a journaled disconnect is retried', async () => {
    const saved: Array<{ confirmedAt: string }> = []
    const disconnectAccount = vi.fn()
      .mockRejectedValueOnce(new Error('retryable private failure'))
      .mockResolvedValueOnce({ status: 'completed' })
    let now = new Date('2026-09-03T12:00:00.000Z')
    const ids = ['confirmation-1', 'operation-1']
    const service = new GoogleAccountDisconnectCommandService(
      { inspect: async (accountId) => ({ version: 1, accountId, status: 'connected' }) },
      { disconnectAccount },
      { save: (record) => saved.push(record) },
      { now: () => now },
      () => ids.shift() ?? 'unused'
    )
    const prepared = await service.prepare({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })
    if (!prepared.ok) throw new Error('Expected challenge.')
    const request = {
      version: 1,
      confirmationId: prepared.value.confirmationId,
      operationId: prepared.value.operationId,
      action: prepared.value.action,
      accountId: prepared.value.accountId,
      enteredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
    }

    await expect(service.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DISCONNECT_FAILED', retryable: true }
    })
    now = new Date('2026-09-03T12:01:00.000Z')
    await expect(service.execute(request)).resolves.toMatchObject({ ok: true })

    expect(saved).toHaveLength(2)
    expect(saved[1]?.confirmedAt).toBe(saved[0]?.confirmedAt)
    expect(disconnectAccount).toHaveBeenCalledTimes(2)
  })
})
