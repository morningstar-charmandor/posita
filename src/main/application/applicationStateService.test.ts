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
const retention = {
  status: () => ({
    version: 1 as const,
    retentionDays: 90 as const,
    status: 'scheduled' as const,
    nextRunAt: '2026-08-25T05:30:00.000Z'
  })
}

describe('ApplicationStateService', () => {
  it('composes mail and lifecycle reads into one ready state', async () => {
    const service = new ApplicationStateService(
      'ready',
      new MailApplicationService(mailRepository, {
        now: () => new Date('2026-08-24T05:30:00.000Z')
      }),
      new AccountLifecycleStatusService(lifecycleRepository),
      retention
    )

    expect(await service.load()).toMatchObject({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: { dataset: fixtures },
        lifecycle: { state: 'idle', operations: [] },
        retention: {
          status: 'scheduled',
          retentionDays: 90,
          nextRunAt: '2026-08-25T05:30:00.000Z'
        },
        connectConsent: {
          consentVersion: 'google-gmail-readonly-identity-v2',
          status: 'preview-only',
          requestedScopes: [
            'openid',
            'email',
            'https://www.googleapis.com/auth/gmail.readonly'
          ],
          initialImportDays: 90,
          rollingRetentionDays: 90
        }
      }
    })
  })

  it.each(['local-data-deleted', 'recovery-required'] as const)(
    'reports %s without attempting to read private mail',
    async (mode) => {
      expect(await new ApplicationStateService(mode).load()).toEqual({
        ok: true,
        value: { version: 1, mode }
      })
    }
  )

  it('fails closed when a ready service is incomplete', async () => {
    expect(await new ApplicationStateService('ready').load()).toMatchObject({
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', retryable: true }
    })
  })

  it('transitions to deleted mode without reading destroyed private data', async () => {
    const service = new ApplicationStateService(
      'ready',
      new MailApplicationService(mailRepository, { now: () => new Date() }),
      new AccountLifecycleStatusService(lifecycleRepository),
      retention
    )

    service.markLocalDataDeleted()

    expect(await service.load()).toEqual({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted' }
    })
  })
})
