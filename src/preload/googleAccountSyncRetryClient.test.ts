import { describe, expect, it, vi } from 'vitest'
import { createRetryGoogleAccountSyncClient } from './googleAccountSyncRetryClient'

const request = {
  version: 1 as const,
  action: 'retry-google-account-sync' as const,
  accountId: 'account-work-1'
}

describe('Google account sync retry preload client', () => {
  it('passes an exact cursor-free result to the renderer', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: request.accountId,
        provider: 'google',
        status: 'synced',
        mode: 'initial',
        batchesCommitted: 1,
        insertedMessages: 2,
        updatedMessages: 0,
        replayedMessages: 0
      }
    }))
    const client = createRetryGoogleAccountSyncClient(invoke)

    await expect(client(request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'synced', insertedMessages: 2 }
    })
    expect(invoke).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('rejects malformed requests and privileged response fields', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: request.accountId,
        provider: 'google',
        status: 'synced',
        mode: 'initial',
        batchesCommitted: 1,
        insertedMessages: 2,
        updatedMessages: 0,
        replayedMessages: 0,
        cursor: 'forbidden'
      }
    }))
    const client = createRetryGoogleAccountSyncClient(invoke)

    await expect(client({ ...request, accountId: 'unsafe id' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } })
    expect(invoke).not.toHaveBeenCalled()
    await expect(client(request))
      .resolves.toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } })
  })
})
