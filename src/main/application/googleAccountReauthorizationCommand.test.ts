import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import type { ProviderAccountRecordV2 } from './accountState'
import { GoogleAccountReauthorizationCommandService } from './googleAccountReauthorizationCommand'
import type { ProviderMailLifecycleAccountOutcomeV1 } from './providerMailLifecycleOwner'

const account: ProviderAccountRecordV2 = {
  version: 2,
  accountId: 'account-1',
  provider: 'google',
  providerAccountId: 'hidden-subject',
  displayIdentity: { mailboxAddress: 'owner@example.test' },
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-09-04T12:00:00.000Z'
}
const request = {
  version: 1 as const,
  action: 'reauthorize-google-account' as const,
  accountId: account.accountId,
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
}

describe('GoogleAccountReauthorizationCommandService', () => {
  it('renews the selected existing account and delegates one read to the lifecycle owner', async () => {
    const connect = vi.fn().mockResolvedValue(account)
    const syncAccounts = vi.fn().mockResolvedValue([{
      version: 1,
      accountId: account.accountId,
      provider: 'google',
      status: 'synced',
      result: {
        version: 1, accountId: account.accountId, provider: 'google',
        batchesApplied: 1, messagesInserted: 1, messagesUpdated: 0,
        messagesDeleted: 0, threadsUpserted: 1, nextCursor: 'opaque'
      }
    }])
    const service = new GoogleAccountReauthorizationCommandService({ connect }, { syncAccounts })

    await expect(service.reauthorize(request)).resolves.toMatchObject({
      ok: true,
      value: { accountId: account.accountId, status: 'connected-and-synced' }
    })
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.accountId,
      requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes
    }), expect.any(AbortSignal))
    expect(syncAccounts).toHaveBeenCalledExactlyOnceWith([{
      version: 1, accountId: account.accountId, provider: 'google'
    }], expect.any(AbortSignal))
  })

  it('reports renewed access truthfully when the following read still needs attention', async () => {
    const service = new GoogleAccountReauthorizationCommandService(
      { connect: vi.fn().mockResolvedValue(account) },
      { syncAccounts: vi.fn().mockResolvedValue([{
        version: 1, accountId: account.accountId, provider: 'google',
        status: 'retry-required', errorCode: 'QUOTA_EXHAUSTED', retryable: true
      }]) }
    )

    await expect(service.reauthorize(request)).resolves.toMatchObject({
      ok: true,
      value: {
        status: 'connected-sync-retry-required',
        syncErrorCode: 'QUOTA_EXHAUSTED'
      }
    })
  })

  it('cancels only the active renewal and rejects malformed account selection', async () => {
    let signal: AbortSignal | undefined
    const connect = vi.fn((_request, current?: AbortSignal) => {
      signal = current
      return new Promise<ProviderAccountRecordV2>((_resolve, reject) => {
        current?.addEventListener('abort', () => reject(new Error('private')), { once: true })
      })
    })
    const service = new GoogleAccountReauthorizationCommandService(
      { connect }, { syncAccounts: vi.fn() }
    )
    const pending = service.reauthorize(request)
    expect(service.cancel({ version: 1, action: 'cancel-google-account-reauthorization' }))
      .toMatchObject({ ok: true, value: { status: 'cancellation-requested' } })
    expect(signal?.aborted).toBe(true)
    await expect(pending).resolves.toMatchObject({ ok: false })
    await expect(service.reauthorize({ ...request, accountId: '../other' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('bounds the post-renewal sync and keeps duplicate renewal blocked until cleanup settles', async () => {
    let settle: (() => void) | undefined
    const syncAccounts = vi.fn((_accounts, signal?: AbortSignal) =>
      new Promise<ProviderMailLifecycleAccountOutcomeV1[]>((resolve) => {
        settle = () => resolve([{
          version: 1, accountId: account.accountId, provider: 'google',
          status: 'failed', errorCode: 'SYNC_ATTEMPT_TIMED_OUT', retryable: true
        }])
        signal?.addEventListener('abort', () => undefined, { once: true })
      }))
    const service = new GoogleAccountReauthorizationCommandService(
      { connect: vi.fn().mockResolvedValue(account) },
      { syncAccounts },
      5
    )
    await expect(service.reauthorize(request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'connected-needs-review', syncErrorCode: 'SYNC_ATTEMPT_TIMED_OUT' }
    })
    await expect(service.reauthorize(request)).resolves.toMatchObject({
      ok: false, error: { code: 'CONNECTION_IN_PROGRESS' }
    })
    settle?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(syncAccounts).toHaveBeenCalledOnce()
  })
})
