import { describe, expect, it, vi } from 'vitest'
import { createLoadApplicationStateClient } from './loadApplicationStateClient'

describe('preload application-state client', () => {
  it('sends only the fixed protocol request and accepts a valid response', async () => {
    const response = {
      ok: true as const,
      value: { version: 1 as const, mode: 'local-data-deleted' as const }
    }
    const invoke = vi.fn().mockResolvedValue(response)

    await expect(createLoadApplicationStateClient(invoke)()).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ version: 1 })
  })

  it('converts malformed backend values into a safe protocol error', async () => {
    const loadApplicationState = createLoadApplicationStateClient(async () => ({
      ok: true,
      value: { databasePath: '/private/user/posita.sqlite3' }
    }))

    await expect(loadApplicationState()).resolves.toEqual({
      ok: false,
      error: {
        version: 1,
        code: 'PROTOCOL_ERROR',
        message: 'The desktop backend returned an unsupported response.',
        retryable: false
      }
    })
  })
})
