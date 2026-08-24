import { describe, expect, it, vi } from 'vitest'
import { fixtures } from '../shared/fixtures'
import { createLoadSnapshotClient } from './loadSnapshotClient'

describe('preload loadSnapshot client', () => {
  it('sends only the fixed protocol request and accepts a valid response', async () => {
    const response = {
      ok: true as const,
      value: {
        version: 1 as const,
        dataMode: 'fixture-seeded' as const,
        loadedAt: '2026-08-24T05:30:00.000Z',
        dataset: fixtures
      }
    }
    const invoke = vi.fn().mockResolvedValue(response)

    await expect(createLoadSnapshotClient(invoke)()).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ version: 1 })
  })

  it('converts malformed backend values into a safe protocol error', async () => {
    const loadSnapshot = createLoadSnapshotClient(async () => ({
      ok: true,
      value: { databasePath: '/private/user/posita.sqlite3' }
    }))

    await expect(loadSnapshot()).resolves.toEqual({
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
