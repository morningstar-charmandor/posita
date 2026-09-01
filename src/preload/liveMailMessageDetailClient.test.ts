import { describe, expect, it, vi } from 'vitest'
import { createLoadLiveMailMessageDetailClient } from './liveMailMessageDetailClient'

describe('preload live-mail source-detail client', () => {
  it('validates and copies the narrow request', async () => {
    const invoke = vi.fn(async (_request: unknown) => ({
      ok: true,
      value: { version: 1, status: 'missing', accountId: 'account-1', messageId: 'message-1' }
    }))
    const request = { version: 1 as const, accountId: 'account-1', messageId: 'message-1' }
    await expect(createLoadLiveMailMessageDetailClient(invoke)(request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'missing' }
    })
    expect(invoke).toHaveBeenCalledExactlyOnceWith(request)
    expect(invoke.mock.calls[0]?.[0]).not.toBe(request)
  })

  it('rejects malformed input and output without invoking extra capabilities', async () => {
    const invoke = vi.fn(async (_request: unknown) => ({ databasePath: '/private/posita.sqlite3' }))
    const client = createLoadLiveMailMessageDetailClient(invoke)
    await expect(client({ version: 1, accountId: '../bad', messageId: 'message-1' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(invoke).not.toHaveBeenCalled()
    await expect(client({ version: 1, accountId: 'account-1', messageId: 'message-1' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } })
  })
})
