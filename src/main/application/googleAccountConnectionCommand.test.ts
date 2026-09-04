import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import type { ProviderAccountRecordV2 } from './accountState'
import { GoogleAccountConnectionCommandService } from './googleAccountConnectionCommand'

const request = {
  version: 1 as const,
  action: 'connect-google-account' as const,
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
}
const account: ProviderAccountRecordV2 = {
  version: 2,
  accountId: 'account-1',
  provider: 'google',
  providerAccountId: 'hidden-subject',
  displayIdentity: { mailboxAddress: 'owner@example.test' },
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-09-03T12:00:00.000Z'
}

describe('GoogleAccountConnectionCommandService', () => {
  it('creates the account ID in main and activates initial sync after authorization', async () => {
    const connect = vi.fn().mockResolvedValue(account)
    const activateConnectedAccount = vi.fn().mockResolvedValue({
      version: 1, accountId: account.accountId, provider: 'google', status: 'synced',
      result: {
        version: 1, accountId: account.accountId, provider: 'google',
        batchesApplied: 1, messagesInserted: 2, messagesUpdated: 0,
        messagesDeleted: 0, threadsUpserted: 1, nextCursor: 'opaque'
      }
    })
    const service = new GoogleAccountConnectionCommandService(
      { connect }, { activateConnectedAccount, disconnectAccount: vi.fn() }, () => account.accountId
    )

    await expect(service.connect(request)).resolves.toEqual({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-03T12:00:00.000Z',
        status: 'connected-and-synced'
      }
    })
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1',
      requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes
    }), expect.any(AbortSignal))
    expect(activateConnectedAccount).toHaveBeenCalledWith({
      version: 1, accountId: 'account-1', provider: 'google'
    })
  })

  it('reports a connected account safely when initial activation needs review', async () => {
    const service = new GoogleAccountConnectionCommandService(
      { connect: vi.fn().mockResolvedValue(account) },
      {
        activateConnectedAccount: vi.fn().mockRejectedValue(new Error('private')),
        disconnectAccount: vi.fn().mockRejectedValue(new Error('cleanup-private'))
      },
      vi.fn().mockReturnValueOnce(account.accountId).mockReturnValueOnce('rollback-1')
    )

    const response = await service.connect(request)
    expect(response).toMatchObject({
      ok: true,
      value: { status: 'connected-needs-review', syncErrorCode: 'ACTIVATION_FAILED' }
    })
    expect(JSON.stringify(response)).not.toContain('private')
  })

  it('removes the new connection when initial activation fails but rollback succeeds', async () => {
    const disconnectAccount = vi.fn().mockResolvedValue({ status: 'disconnected' })
    const service = new GoogleAccountConnectionCommandService(
      { connect: vi.fn().mockResolvedValue(account) },
      {
        activateConnectedAccount: vi.fn().mockRejectedValue(new Error('private')),
        disconnectAccount
      },
      vi.fn().mockReturnValueOnce(account.accountId).mockReturnValueOnce('rollback-1')
    )

    await expect(service.connect(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_FAILED', retryable: true }
    })
    expect(disconnectAccount).toHaveBeenCalledWith({
      version: 1,
      operationId: 'rollback-1',
      accountId: account.accountId
    })
  })

  it('cancels only the active connection and rejects renderer-selected account IDs', async () => {
    let observedSignal: AbortSignal | undefined
    const connect = vi.fn((_request, signal?: AbortSignal) => {
      observedSignal = signal
      return new Promise<ProviderAccountRecordV2>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })
    })
    const service = new GoogleAccountConnectionCommandService(
      { connect }, {
        activateConnectedAccount: vi.fn(),
        disconnectAccount: vi.fn()
      }, () => account.accountId
    )
    const pending = service.connect(request)

    expect(service.cancel({ version: 1, action: 'cancel-google-account-connection' }))
      .toEqual({ ok: true, value: { version: 1, status: 'cancellation-requested' } })
    expect(observedSignal?.aborted).toBe(true)
    await expect(pending).resolves.toMatchObject({ ok: false })
    await expect(service.connect({ ...request, accountId: 'renderer-choice' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })
})
