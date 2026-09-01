import { describe, expect, it } from 'vitest'
import { LiveMailMessageDetailService } from './liveMailMessageDetailService'

const request = { version: 1 as const, accountId: 'account-1', messageId: 'message-1' }

describe('LiveMailMessageDetailService', () => {
  it('returns an exact bounded source result', async () => {
    const service = new LiveMailMessageDetailService({
      loadMessageDetail: async () => ({
        version: 1,
        status: 'missing',
        accountId: 'account-1',
        messageId: 'message-1'
      })
    })
    await expect(service.load(request)).resolves.toEqual({
      ok: true,
      value: { version: 1, status: 'missing', accountId: 'account-1', messageId: 'message-1' }
    })
  })

  it('fails safely without a composed source or when storage throws', async () => {
    await expect(new LiveMailMessageDetailService().load(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: false }
    })
    const service = new LiveMailMessageDetailService({
      loadMessageDetail: async () => { throw new Error('/private/posita.sqlite3') }
    })
    await expect(service.load(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: true }
    })
  })
})
