import { describe, expect, it, vi } from 'vitest'
import type { LiveMailSnapshotV1 } from '../../shared/liveMail'
import { ProviderMailReadModelService } from './providerMailReadModel'

const emptySnapshot = (loadedAt: string): LiveMailSnapshotV1 => ({
  version: 1,
  dataMode: 'live-canonical',
  loadedAt,
  status: 'empty',
  accounts: [],
  messages: [],
  hasMore: false
})

describe('ProviderMailReadModelService', () => {
  it('binds the worker query to an injected load timestamp', async () => {
    const loadReadModel = vi.fn(async (loadedAt: string) => emptySnapshot(loadedAt))
    const service = new ProviderMailReadModelService(
      { loadReadModel },
      { now: () => new Date('2026-09-01T05:00:00.000Z') }
    )

    await expect(service.loadSnapshot()).resolves.toEqual({
      ok: true,
      value: emptySnapshot('2026-09-01T05:00:00.000Z')
    })
    expect(loadReadModel).toHaveBeenCalledExactlyOnceWith('2026-09-01T05:00:00.000Z')
  })

  it('maps worker failure and malformed output to the same safe retryable error', async () => {
    const failure = new ProviderMailReadModelService(
      { loadReadModel: async () => { throw new Error('/private/mail.sqlite') } },
      { now: () => new Date('2026-09-01T05:00:00.000Z') }
    )
    await expect(failure.loadSnapshot()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        retryable: true,
        message: 'Posita could not load the encrypted live-mail projection. Please try again.'
      }
    })

    const malformed = new ProviderMailReadModelService(
      { loadReadModel: async () => ({ ...emptySnapshot('invalid'), loadedAt: 'invalid' }) },
      { now: () => new Date('2026-09-01T05:00:00.000Z') }
    )
    await expect(malformed.loadSnapshot()).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: true }
    })
  })
})
