import { describe, expect, it, vi } from 'vitest'
import { createOpenLiveMailOriginalClient } from './openLiveMailOriginalClient'

const request = {
  version: 1 as const,
  action: 'open-original' as const,
  accountId: 'account-work-1',
  messageId: 'message-1'
}

describe('preload open-original client', () => {
  it('copies one exact request and validates the safe response', async () => {
    const invoke = vi.fn(async (_request: unknown) => ({
      ok: true,
      value: { version: 1, status: 'external-open-requested' }
    }))
    await expect(createOpenLiveMailOriginalClient(invoke)(request)).resolves.toMatchObject({ ok: true })
    expect(invoke).toHaveBeenCalledExactlyOnceWith(request)
    expect(invoke.mock.calls[0]?.[0]).not.toBe(request)
  })

  it('rejects malformed request and response values', async () => {
    const invoke = vi.fn(async (_request: unknown) => ({ url: 'https://mail.google.com/' }))
    const client = createOpenLiveMailOriginalClient(invoke)
    await expect(client({ ...request, messageId: '../private' })).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' }
    })
    expect(invoke).not.toHaveBeenCalled()
    await expect(client(request)).resolves.toMatchObject({ error: { code: 'PROTOCOL_ERROR' } })
  })
})
