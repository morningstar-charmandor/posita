import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import { AccountLifecycleStatusService } from '../application/accountLifecycleStatus'
import type { AccountLifecycleRepository } from '../application/accountLifecycle'
import { ApplicationStateService } from '../application/applicationStateService'
import { MailApplicationService } from '../application/mailApplicationService'
import type { MailRepository } from '../application/mailRepository'
import { createLoadApplicationStateHandler } from './applicationIpc'

const event = {} as IpcMainInvokeEvent
const repository: MailRepository = {
  initialize: () => undefined,
  seedIfEmpty: () => false,
  loadDataset: () => fixtures,
  close: () => undefined
}
const service = new MailApplicationService(repository, {
  now: () => new Date('2026-08-24T05:30:00.000Z')
})
const lifecycleRepository: AccountLifecycleRepository = {
  save: () => undefined,
  load: () => undefined,
  listPending: () => [],
  loadLatestDeleteLocalData: () => undefined,
  deleteCompleted: () => false
}
const applicationState = new ApplicationStateService(
  'ready',
  service,
  new AccountLifecycleStatusService(lifecycleRepository)
)

describe('load application-state IPC handler', () => {
  it('rejects untrusted senders before inspecting the request', () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => false)

    expect(handler(event, { version: 1 })).toEqual({
      ok: false,
      error: {
        version: 1,
        code: 'UNTRUSTED_SENDER',
        message: 'This window is not allowed to access local mail data.',
        retryable: false
      }
    })
  })

  it('rejects unknown protocol versions and additional capabilities', () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => true)

    expect(handler(event, { version: 2, channel: 'send-mail' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', retryable: false }
    })
  })

  it('returns the validated application snapshot for an allowed request', () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => true)

    expect(handler(event, { version: 1 })).toEqual({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: {
          version: 1,
          dataMode: 'fixture-seeded',
          loadedAt: '2026-08-24T05:30:00.000Z',
          dataset: fixtures
        },
        lifecycle: { version: 1, state: 'idle', operations: [] }
      }
    })
  })
})
