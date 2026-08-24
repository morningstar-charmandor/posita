import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import type { MailDataset } from '../../shared/domain'
import { MailApplicationService, type Clock } from './mailApplicationService'
import type { MailRepository } from './mailRepository'

const fixedClock: Clock = {
  now: () => new Date('2026-08-24T05:30:00.000Z')
}

const repository = (loadDataset: () => MailDataset): MailRepository => ({
  initialize: () => undefined,
  seedIfEmpty: () => false,
  loadDataset,
  close: () => undefined
})

describe('MailApplicationService', () => {
  it('returns a versioned fixture-seeded snapshot', () => {
    const service = new MailApplicationService(repository(() => fixtures), fixedClock)

    expect(service.loadSnapshot()).toEqual({
      ok: true,
      value: {
        version: 1,
        dataMode: 'fixture-seeded',
        loadedAt: '2026-08-24T05:30:00.000Z',
        dataset: fixtures
      }
    })
  })

  it('returns a safe retryable error without leaking the database failure', () => {
    const service = new MailApplicationService(repository(() => {
      throw new Error('SQLITE_CANTOPEN /private/user/path/posita.db')
    }), fixedClock)

    expect(service.loadSnapshot()).toEqual({
      ok: false,
      error: {
        version: 1,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Posita could not load local mail data. Please try again.',
        retryable: true
      }
    })
  })
})
