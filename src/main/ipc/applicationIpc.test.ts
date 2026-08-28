import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import { AccountLifecycleStatusService } from '../application/accountLifecycleStatus'
import type { AccountLifecycleRepository } from '../application/accountLifecycle'
import { ApplicationStateService } from '../application/applicationStateService'
import { LocalDataDeletionCommandService } from '../application/localDataDeletionCommand'
import { MailApplicationService } from '../application/mailApplicationService'
import type { MailRepository } from '../application/mailRepository'
import {
  createExecuteLocalDataDeletionHandler,
  createLoadApplicationStateHandler,
  createPrepareLocalDataDeletionHandler,
  LocalDataDeletionIpcAuthorization
} from './applicationIpc'

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
        lifecycle: { version: 1, state: 'idle', operations: [] },
        connectConsent: GOOGLE_CONNECT_CONSENT
      }
    })
  })
})

describe('local-data deletion IPC handlers', () => {
  it('rejects untrusted preparation before the command service is called', () => {
    const command = new LocalDataDeletionCommandService()
    const prepare = createPrepareLocalDataDeletionHandler(
      command,
      () => false,
      new LocalDataDeletionIpcAuthorization()
    )

    expect(prepare(event, { version: 1, action: 'delete-local-data' })).toMatchObject({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', retryable: false }
    })
  })

  it('returns unavailable rather than widening the capability outside ready mode', () => {
    const command = new LocalDataDeletionCommandService()
    const prepare = createPrepareLocalDataDeletionHandler(
      command,
      () => true,
      new LocalDataDeletionIpcAuthorization()
    )

    expect(prepare(event, { version: 1, action: 'delete-local-data' })).toMatchObject({
      ok: false,
      error: { code: 'DELETION_UNAVAILABLE', retryable: false }
    })
  })

  it('rejects an untrusted execute request without inspecting confirmation text', async () => {
    const command = new LocalDataDeletionCommandService()
    const execute = createExecuteLocalDataDeletionHandler(
      command,
      () => false,
      new LocalDataDeletionIpcAuthorization()
    )

    await expect(execute(event, {
      version: 1,
      confirmationId: 'confirm-delete-1',
      operationId: 'delete-local-1',
      action: 'delete-local-data',
      enteredText: 'anything'
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', retryable: false }
    })
  })

  it('binds a prepared challenge to the window that received it', () => {
    const authorization = new LocalDataDeletionIpcAuthorization(
      () => Date.parse('2026-08-24T12:00:00.000Z')
    )
    const firstWindow = { sender: { id: 1 } } as IpcMainInvokeEvent
    const secondWindow = { sender: { id: 2 } } as IpcMainInvokeEvent
    const request = {
      version: 1 as const,
      confirmationId: 'confirm-delete-1',
      operationId: 'delete-local-1',
      action: 'delete-local-data' as const,
      enteredText: 'DELETE LOCAL DATA'
    }
    authorization.record(firstWindow, {
      confirmationId: request.confirmationId,
      operationId: request.operationId,
      expiresAt: '2026-08-24T12:05:00.000Z'
    })

    expect(authorization.authorize(secondWindow, request)).toBe(false)
    expect(authorization.authorize(firstWindow, request)).toBe(true)
  })
})
