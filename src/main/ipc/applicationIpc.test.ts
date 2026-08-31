import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  GOOGLE_CONNECT_CONSENT
} from '../../shared/contracts'
import { AccountLifecycleStatusService } from '../application/accountLifecycleStatus'
import type { AccountLifecycleRepository } from '../application/accountLifecycle'
import { ApplicationStateService } from '../application/applicationStateService'
import { LocalDataDeletionCommandService } from '../application/localDataDeletionCommand'
import { AccountConnectionRecoveryCommandService } from '../application/accountConnectionRecoveryCommand'
import { MailApplicationService } from '../application/mailApplicationService'
import type { MailRepository } from '../application/mailRepository'
import {
  createExecuteLocalDataDeletionHandler,
  createExecuteAccountConnectionRecoveryHandler,
  createLoadApplicationStateHandler,
  createPrepareLocalDataDeletionHandler,
  createPrepareAccountConnectionRecoveryHandler,
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

describe('account-connection recovery IPC handlers', () => {
  const challenge = {
    version: 1 as const,
    confirmationId: 'confirmation-recovery-1',
    operationId: 'operation-recovery-1',
    action: 'discard-orphaned-local-connection-state' as const,
    accountId: 'account-work-1',
    expectedStatus: 'credential-only' as const,
    requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
    expiresAt: '2026-08-30T12:05:00.000Z',
    consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
  }
  const request = {
    version: 1 as const,
    confirmationId: challenge.confirmationId,
    operationId: challenge.operationId,
    action: challenge.action,
    accountId: challenge.accountId,
    expectedStatus: challenge.expectedStatus,
    enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
  }

  it('rejects untrusted preparation before calling the command', async () => {
    const prepare = createPrepareAccountConnectionRecoveryHandler(
      { prepare: async () => ({ ok: true, value: challenge }) },
      () => false,
      new LocalDataDeletionIpcAuthorization()
    )

    await expect(prepare(event, {
      version: 1,
      action: challenge.action,
      accountId: challenge.accountId
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', retryable: false }
    })
  })

  it('binds recovery execution to the window that received the challenge', async () => {
    const now = () => Date.parse('2026-08-30T12:00:00.000Z')
    const authorization = new LocalDataDeletionIpcAuthorization(now)
    const firstWindow = { sender: { id: 1 } } as IpcMainInvokeEvent
    const secondWindow = { sender: { id: 2 } } as IpcMainInvokeEvent
    const prepare = createPrepareAccountConnectionRecoveryHandler(
      { prepare: async () => ({ ok: true, value: challenge }) },
      () => true,
      authorization
    )
    const executeCommand = {
      execute: async () => ({
        ok: true as const,
        value: {
          version: 1 as const,
          operationId: challenge.operationId,
          accountId: challenge.accountId,
          status: 'absent' as const,
          removed: 'credential' as const,
          reconnectRequired: true as const
        }
      })
    }
    const execute = createExecuteAccountConnectionRecoveryHandler(
      executeCommand,
      () => true,
      authorization
    )
    await prepare(firstWindow, {
      version: 1,
      action: challenge.action,
      accountId: challenge.accountId
    })

    await expect(execute(secondWindow, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_NOT_FOUND' }
    })
    await expect(execute(firstWindow, request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'absent', reconnectRequired: true }
    })
    await expect(execute(firstWindow, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_NOT_FOUND' }
    })
  })

  it('consumes window authority before recovery execution can overlap', async () => {
    const authorization = new LocalDataDeletionIpcAuthorization(
      () => Date.parse('2026-08-30T12:00:00.000Z')
    )
    const firstWindow = { sender: { id: 1 } } as IpcMainInvokeEvent
    let finishExecution: (() => void) | undefined
    const executionPending = new Promise<void>((resolve) => { finishExecution = resolve })
    const prepare = createPrepareAccountConnectionRecoveryHandler(
      { prepare: async () => ({ ok: true, value: challenge }) },
      () => true,
      authorization
    )
    const execute = createExecuteAccountConnectionRecoveryHandler(
      {
        execute: async () => {
          await executionPending
          return {
            ok: true as const,
            value: {
              version: 1 as const,
              operationId: challenge.operationId,
              accountId: challenge.accountId,
              status: 'absent' as const,
              removed: 'credential' as const,
              reconnectRequired: true as const
            }
          }
        }
      },
      () => true,
      authorization
    )
    await prepare(firstWindow, {
      version: 1,
      action: challenge.action,
      accountId: challenge.accountId
    })

    const firstExecution = execute(firstWindow, request)
    await expect(execute(firstWindow, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_NOT_FOUND' }
    })
    finishExecution?.()
    await expect(firstExecution).resolves.toMatchObject({ ok: true })
  })

  it('is unavailable outside ready-mode composition', async () => {
    const prepare = createPrepareAccountConnectionRecoveryHandler(
      new AccountConnectionRecoveryCommandService(),
      () => true,
      new LocalDataDeletionIpcAuthorization()
    )

    await expect(prepare(event, {
      version: 1,
      action: challenge.action,
      accountId: challenge.accountId
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'RECOVERY_UNAVAILABLE', retryable: false }
    })
  })
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
