import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import type { AccountLifecycleRepository } from './accountLifecycle'
import { AccountLifecycleStatusService } from './accountLifecycleStatus'
import { ApplicationStateService } from './applicationStateService'
import { MailApplicationService } from './mailApplicationService'
import type { MailRepository } from './mailRepository'

const mailRepository: MailRepository = {
  initialize: () => undefined,
  seedIfEmpty: () => false,
  loadDataset: () => fixtures,
  close: () => undefined
}
const lifecycleRepository: AccountLifecycleRepository = {
  save: () => undefined,
  load: () => undefined,
  listPending: () => [],
  loadLatestDeleteLocalData: () => undefined,
  deleteCompleted: () => false
}

describe('ApplicationStateService', () => {
  it('composes mail and lifecycle reads into one ready state', () => {
    const service = new ApplicationStateService(
      'ready',
      new MailApplicationService(mailRepository, {
        now: () => new Date('2026-08-24T05:30:00.000Z')
      }),
      new AccountLifecycleStatusService(lifecycleRepository)
    )

    expect(service.load()).toMatchObject({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: { dataset: fixtures },
        lifecycle: { state: 'idle', operations: [] }
      }
    })
  })

  it.each(['local-data-deleted', 'recovery-required'] as const)(
    'reports %s without attempting to read private mail',
    (mode) => {
      expect(new ApplicationStateService(mode).load()).toEqual({
        ok: true,
        value: { version: 1, mode }
      })
    }
  )

  it('fails closed when a ready service is incomplete', () => {
    expect(new ApplicationStateService('ready').load()).toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: true }
    })
  })

  it('transitions to deleted mode without reading destroyed private data', () => {
    const service = new ApplicationStateService(
      'ready',
      new MailApplicationService(mailRepository, { now: () => new Date() }),
      new AccountLifecycleStatusService(lifecycleRepository)
    )

    service.markLocalDataDeleted()

    expect(service.load()).toEqual({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted' }
    })
  })
})
