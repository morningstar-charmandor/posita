import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../../shared/fixtures'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  GOOGLE_CONNECT_CONSENT
} from '../../shared/contracts'
import { GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES } from '../../shared/contracts'
import { AccountLifecycleStatusService } from '../application/accountLifecycleStatus'
import type { AccountLifecycleRepository } from '../application/accountLifecycle'
import { ApplicationStateService } from '../application/applicationStateService'
import { LiveMailMessageDetailService } from '../application/liveMailMessageDetailService'
import { OpenProviderMailOriginalService } from '../application/openProviderMailOriginal'
import { LocalDataDeletionCommandService } from '../application/localDataDeletionCommand'
import { AccountConnectionRecoveryCommandService } from '../application/accountConnectionRecoveryCommand'
import { MailApplicationService } from '../application/mailApplicationService'
import type { MailRepository } from '../application/mailRepository'
import {
  createExecuteLocalDataDeletionHandler,
  createExecuteAccountConnectionRecoveryHandler,
  createLoadApplicationStateHandler,
  createLoadLiveMailMessageDetailHandler,
  createOpenLiveMailOriginalHandler,
  createPrepareLocalDataDeletionHandler,
  createPrepareAccountConnectionRecoveryHandler,
  createPrepareGoogleAccountConnectionHandler,
  createConnectGoogleAccountHandler,
  createCancelGoogleAccountConnectionHandler,
  createRetryGoogleAccountSyncHandler,
  createPrepareGoogleAccountDisconnectHandler,
  createExecuteGoogleAccountDisconnectHandler,
  GoogleAccountDisconnectIpcAuthorization,
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

describe('Gmail connection preparation IPC handler', () => {
  const result = {
    version: 1 as const,
    action: 'prepare-google-account-connection' as const,
    provider: 'google' as const,
    status: 'authorization-not-started' as const,
    consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
    requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes,
    notices: GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
    nextStep: 'explicit-google-authorization-required' as const
  }

  it('rejects untrusted senders before preparation', () => {
    const prepare = createPrepareGoogleAccountConnectionHandler(
      { prepare: () => ({ ok: true, value: result }) },
      () => false
    )
    expect(prepare(event, { version: 1, action: result.action })).toMatchObject({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER' }
    })
  })

  it('returns only the exact validated preflight result', () => {
    const prepare = createPrepareGoogleAccountConnectionHandler(
      { prepare: () => ({ ok: true, value: result }) },
      () => true
    )
    expect(prepare(event, { version: 1, action: result.action }))
      .toEqual({ ok: true, value: result })
  })
})

describe('Google account connection IPC handlers', () => {
  const connected = {
    version: 1 as const,
    accountId: 'account-1',
    provider: 'google' as const,
    mailboxAddress: 'owner@example.test',
    connectedAt: '2026-09-03T12:00:00.000Z',
    status: 'connected-and-synced' as const
  }

  it('rejects an untrusted sender before authorization can start', async () => {
    let called = false
    const handler = createConnectGoogleAccountHandler({
      connect: async () => { called = true; return { ok: true, value: connected } }
    }, () => false)

    await expect(handler(event, {
      version: 1,
      action: 'connect-google-account',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
    })).resolves.toMatchObject({ ok: false, error: { code: 'UNTRUSTED_SENDER' } })
    expect(called).toBe(false)
  })

  it('returns exact trusted connection and cancellation results', async () => {
    const connect = createConnectGoogleAccountHandler({
      connect: async () => ({ ok: true, value: connected })
    }, () => true)
    const cancel = createCancelGoogleAccountConnectionHandler({
      cancel: () => ({
        ok: true,
        value: { version: 1, status: 'cancellation-requested' }
      })
    }, () => true)

    await expect(connect(event, {})).resolves.toEqual({ ok: true, value: connected })
    expect(cancel(event, {})).toEqual({
      ok: true,
      value: { version: 1, status: 'cancellation-requested' }
    })
  })
})

describe('Google account sync retry IPC handler', () => {
  const request = {
    version: 1 as const,
    action: 'retry-google-account-sync' as const,
    accountId: 'account-work-1'
  }
  const result = {
    version: 1 as const,
    accountId: request.accountId,
    provider: 'google' as const,
    status: 'synced' as const,
    mode: 'initial' as const,
    batchesCommitted: 1,
    insertedMessages: 2,
    updatedMessages: 0,
    replayedMessages: 0
  }

  it('rejects untrusted senders before invoking provider work', async () => {
    let called = false
    const handler = createRetryGoogleAccountSyncHandler({
      execute: async () => {
        called = true
        return { ok: true, value: result }
      }
    }, () => false)

    await expect(handler(event, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', retryable: false }
    })
    expect(called).toBe(false)
  })

  it('returns only an exact bounded cursor-free result', async () => {
    const handler = createRetryGoogleAccountSyncHandler({
      execute: async () => ({ ok: true, value: result })
    }, () => true)
    await expect(handler(event, request)).resolves.toEqual({ ok: true, value: result })

    const widened = createRetryGoogleAccountSyncHandler({
      execute: async () => ({
        ok: true,
        value: { ...result, cursor: 'forbidden' }
      } as never)
    }, () => true)
    await expect(widened(event, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR', retryable: false }
    })
  })
})

describe('Google account disconnect IPC handlers', () => {
  it('binds the confirmation to the trusted window that prepared it', async () => {
    const first = { sender: { id: 1 } } as IpcMainInvokeEvent
    const second = { sender: { id: 2 } } as IpcMainInvokeEvent
    const challenge = {
      version: 1 as const,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      action: 'disconnect-google-account' as const,
      accountId: 'account-1',
      requiredText: 'DISCONNECT GMAIL' as const,
      expiresAt: '2099-09-03T12:05:00.000Z',
      consequences: [
        'Revokes Posita’s Google authorization for this account.',
        'Removes its credential, encrypted account state, cursor, and cached mail from Posita.',
        'Does not delete or change messages in Gmail.'
      ] as const
    }
    const authorization = new GoogleAccountDisconnectIpcAuthorization()
    const prepare = createPrepareGoogleAccountDisconnectHandler(
      { prepare: async () => ({ ok: true, value: challenge }) },
      () => true,
      authorization
    )
    await prepare(first, {})
    const execute = createExecuteGoogleAccountDisconnectHandler(
      { execute: async () => ({
        ok: true,
        value: { version: 1, operationId: 'operation-1', accountId: 'account-1', status: 'disconnected' }
      }) },
      () => true,
      authorization
    )
    const request = {
      version: 1,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      action: 'disconnect-google-account',
      accountId: 'account-1',
      enteredText: 'DISCONNECT GMAIL'
    }

    await expect(execute(second, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_NOT_FOUND' }
    })
    await expect(execute(first, request)).resolves.toMatchObject({ ok: true })
  })

  it('revokes a disconnect confirmation when its window closes', () => {
    const first = { sender: { id: 1 } } as IpcMainInvokeEvent
    const authorization = new GoogleAccountDisconnectIpcAuthorization()
    authorization.record(first, {
      version: 1,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      action: 'disconnect-google-account',
      accountId: 'account-1',
      requiredText: 'DISCONNECT GMAIL',
      expiresAt: '2099-09-03T12:05:00.000Z',
      consequences: [
        'Revokes Posita’s Google authorization for this account.',
        'Removes its credential, encrypted account state, cursor, and cached mail from Posita.',
        'Does not delete or change messages in Gmail.'
      ]
    })

    authorization.revokeSender(1)

    expect(authorization.authorize(first, {
      version: 1,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      action: 'disconnect-google-account',
      accountId: 'account-1',
      enteredText: 'DISCONNECT GMAIL'
    })).toBe(false)
  })
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
  new AccountLifecycleStatusService(lifecycleRepository),
  {
    status: () => ({
      version: 1,
      retentionDays: 90,
      status: 'scheduled',
      nextRunAt: '2026-08-25T05:30:00.000Z'
    })
  }
)

describe('load application-state IPC handler', () => {
  it('rejects untrusted senders before inspecting the request', async () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => false)

    expect(await handler(event, { version: 1 })).toEqual({
      ok: false,
      error: {
        version: 1,
        code: 'UNTRUSTED_SENDER',
        message: 'This window is not allowed to access local mail data.',
        retryable: false
      }
    })
  })

  it('rejects unknown protocol versions and additional capabilities', async () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => true)

    expect(await handler(event, { version: 2, channel: 'send-mail' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', retryable: false }
    })
  })

  it('returns the validated application snapshot for an allowed request', async () => {
    const handler = createLoadApplicationStateHandler(applicationState, () => true)

    expect(await handler(event, { version: 1 })).toEqual({
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
        retention: {
          version: 1,
          retentionDays: 90,
          status: 'scheduled',
          nextRunAt: '2026-08-25T05:30:00.000Z'
        },
        connectConsent: GOOGLE_CONNECT_CONSENT
      }
    })
  })
})

describe('load live-mail source-detail IPC handler', () => {
  const detailService = new LiveMailMessageDetailService({
    loadMessageDetail: async (request) => ({
      version: 1,
      status: 'missing',
      accountId: request.accountId,
      messageId: request.messageId
    })
  })

  it('rejects untrusted and malformed requests before reading source mail', async () => {
    await expect(createLoadLiveMailMessageDetailHandler(detailService, () => false)(event, {
      version: 1, accountId: 'account-1', messageId: 'message-1'
    })).resolves.toMatchObject({ ok: false, error: { code: 'UNTRUSTED_SENDER' } })
    await expect(createLoadLiveMailMessageDetailHandler(detailService, () => true)(event, {
      version: 1, accountId: '../private', messageId: 'message-1'
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('returns an account-and-message-bound result to a trusted main frame', async () => {
    await expect(createLoadLiveMailMessageDetailHandler(detailService, () => true)(event, {
      version: 1, accountId: 'account-1', messageId: 'message-1'
    })).resolves.toEqual({
      ok: true,
      value: { version: 1, status: 'missing', accountId: 'account-1', messageId: 'message-1' }
    })
  })
})

describe('open live-mail original IPC handler', () => {
  const request = {
    version: 1 as const,
    action: 'open-original' as const,
    accountId: 'account-work-1',
    messageId: 'message-1'
  }
  const command = new OpenProviderMailOriginalService({
    loadOriginalSourceLocator: async () => ({
      version: 1,
      status: 'found',
      accountId: request.accountId,
      messageId: request.messageId,
      provider: 'google',
      mailboxAddress: 'owner@example.test',
      providerMessageId: 'provider-message-1'
    })
  }, { open: async () => undefined })

  it('rejects untrusted and widened requests before an external action', async () => {
    await expect(createOpenLiveMailOriginalHandler(command, () => false)(event, request))
      .resolves.toMatchObject({ error: { code: 'UNTRUSTED_SENDER' } })
    await expect(createOpenLiveMailOriginalHandler(command, () => true)(event, {
      ...request,
      url: 'https://evil.example/'
    })).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } })
  })

  it('returns only the safe handoff result to a trusted main frame', async () => {
    await expect(createOpenLiveMailOriginalHandler(command, () => true)(event, request))
      .resolves.toEqual({
        ok: true,
        value: { version: 1, status: 'external-open-requested' }
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
