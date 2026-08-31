import { describe, expect, it } from 'vitest'
import { DELETE_LOCAL_DATA_CONFIRMATION_TEXT } from '../../shared/contracts'
import type {
  AccountLifecycleRepository,
  LifecycleOperationV1
} from './accountLifecycle'
import {
  DeleteLocalDataService,
  type DeleteLocalDataActions
} from './deleteLocalData'
import { LocalDataDeletionCommandService } from './localDataDeletionCommand'
import {
  LOCAL_ACTION_CONFIRMATION_TTL_MS,
  LocalActionConfirmationService,
  type LocalActionConfirmationRecordV1,
  type LocalActionConfirmationRepository
} from './localActionConfirmation'

class MemoryLifecycleRepository implements AccountLifecycleRepository {
  readonly operations = new Map<string, LifecycleOperationV1>()

  save(operation: LifecycleOperationV1): void {
    this.operations.set(operation.operationId, structuredClone(operation))
  }

  load(operationId: string): LifecycleOperationV1 | undefined {
    const operation = this.operations.get(operationId)
    return operation && structuredClone(operation)
  }

  loadLatestDeleteLocalData() {
    return [...this.operations.values()].reverse().find(
      (operation) => operation.operationType === 'delete-local-data'
    ) as Extract<LifecycleOperationV1, { operationType: 'delete-local-data' }> | undefined
  }

  listPending(): LifecycleOperationV1[] {
    return [...this.operations.values()].filter((operation) => operation.phase !== 'completed')
  }

  deleteCompleted(operationId: string): boolean {
    if (this.operations.get(operationId)?.phase !== 'completed') return false
    return this.operations.delete(operationId)
  }
}

class MemoryConfirmationRepository implements LocalActionConfirmationRepository {
  readonly records = new Map<string, LocalActionConfirmationRecordV1>()

  save(record: LocalActionConfirmationRecordV1): void {
    this.records.set(record.confirmationId, structuredClone(record))
  }

  load(confirmationId: string): LocalActionConfirmationRecordV1 | undefined {
    const record = this.records.get(confirmationId)
    return record && structuredClone(record)
  }

  deleteExpiredWithoutPendingOperation(): number { return 0 }
}

const createHarness = () => {
  let now = Date.parse('2026-08-24T12:00:00.000Z')
  let generated = 0
  const lifecycle = new MemoryLifecycleRepository()
  const calls: string[] = []
  const maintenanceCalls: string[] = []
  let failMailDeletion = false
  const actions: DeleteLocalDataActions = {
    deleteRefreshCredentials: async () => { calls.push('credentials') },
    deleteAccountState: () => { calls.push('account-state') },
    deleteMailRecords: () => {
      calls.push('mail')
      if (failMailDeletion) throw new Error('injected mail deletion failure')
    },
    sanitizeStorage: async () => { calls.push('storage') },
    eraseDataKey: async () => { calls.push('key') }
  }
  const confirmation = new LocalActionConfirmationService(
    new MemoryConfirmationRepository(),
    { now: () => new Date(now) },
    () => generated++ === 0 ? 'confirm-delete-1' : 'delete-local-1'
  )
  const transition = {
    deleted: false,
    markLocalDataDeleted() { this.deleted = true }
  }
  const command = new LocalDataDeletionCommandService(
    confirmation,
    new DeleteLocalDataService(lifecycle, actions, confirmation),
    transition,
    {
      suspend: async () => { maintenanceCalls.push('suspend') },
      resume: () => { maintenanceCalls.push('resume') }
    }
  )
  return {
    calls,
    command,
    lifecycle,
    maintenanceCalls,
    transition,
    advance: (milliseconds: number) => { now += milliseconds },
    failMailDeletion: (value: boolean) => { failMailDeletion = value }
  }
}

const prepare = (command: LocalDataDeletionCommandService) => {
  const response = command.prepare({ version: 1, action: 'delete-local-data' })
  if (!response.ok) throw new Error(response.error.message)
  return response.value
}

const executeRequest = (challenge: ReturnType<typeof prepare>) => ({
  version: 1 as const,
  confirmationId: challenge.confirmationId,
  operationId: challenge.operationId,
  action: challenge.action,
  enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
})

describe('LocalDataDeletionCommandService', () => {
  it('prepares consequence copy without creating lifecycle work', () => {
    const harness = createHarness()

    const response = harness.command.prepare({ version: 1, action: 'delete-local-data' })

    expect(response).toMatchObject({
      ok: true,
      value: {
        requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
        consequences: [
          expect.stringContaining('Posita mailbox cache'),
          expect.stringContaining('Google refresh credentials'),
          expect.stringContaining('Does not delete or change mail in Gmail')
        ]
      }
    })
    expect(harness.lifecycle.listPending()).toEqual([])
    expect(harness.calls).toEqual([])
  })

  it('requires exact confirmation before ordered deletion and state transition', async () => {
    const harness = createHarness()
    const challenge = prepare(harness.command)

    await expect(harness.command.execute({
      ...executeRequest(challenge),
      enteredText: 'delete local data'
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFIRMATION_TEXT_MISMATCH', retryable: false }
    })
    expect(harness.calls).toEqual([])
    expect(harness.transition.deleted).toBe(false)

    await expect(harness.command.execute(executeRequest(challenge))).resolves.toEqual({
      ok: true,
      value: { version: 1, operationId: 'delete-local-1', status: 'local-data-deleted' }
    })
    expect(harness.calls).toEqual(['credentials', 'account-state', 'mail', 'storage', 'key'])
    expect(harness.maintenanceCalls).toEqual(['suspend'])
    expect(harness.transition.deleted).toBe(true)
    expect(harness.lifecycle.load('delete-local-1')).toMatchObject({ phase: 'completed' })
    expect(harness.command.prepare({ version: 1, action: 'delete-local-data' }))
      .toMatchObject({ ok: false, error: { code: 'DELETION_UNAVAILABLE' } })
  })

  it('returns a safe retry error and resumes an authorized operation after expiry', async () => {
    const harness = createHarness()
    const challenge = prepare(harness.command)
    const request = executeRequest(challenge)
    harness.failMailDeletion(true)

    await expect(harness.command.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DELETION_FAILED', retryable: true }
    })
    expect(harness.lifecycle.load(challenge.operationId)).toMatchObject({
      phase: 'mail-data-delete-pending',
      lastErrorCode: 'MAIL_DATA_DELETE_FAILED'
    })
    expect(harness.transition.deleted).toBe(false)
    expect(harness.maintenanceCalls).toEqual(['suspend', 'resume'])

    harness.advance(LOCAL_ACTION_CONFIRMATION_TTL_MS + 1)
    harness.failMailDeletion(false)
    await expect(harness.command.execute(request)).resolves.toMatchObject({
      ok: true,
      value: { status: 'local-data-deleted' }
    })
    expect(harness.calls).toEqual([
      'credentials', 'account-state', 'mail', 'mail', 'storage', 'key'
    ])
    expect(harness.maintenanceCalls).toEqual(['suspend', 'resume', 'suspend'])
  })

  it('fails closed when the capability is unavailable or the request adds fields', async () => {
    const unavailable = new LocalDataDeletionCommandService()
    expect(unavailable.prepare({ version: 1, action: 'delete-local-data' })).toMatchObject({
      ok: false,
      error: { code: 'DELETION_UNAVAILABLE' }
    })
    await expect(unavailable.execute({
      version: 1,
      action: 'delete-local-data'
    })).resolves.toMatchObject({ ok: false, error: { code: 'DELETION_UNAVAILABLE' } })

    const harness = createHarness()
    expect(harness.command.prepare({
      version: 1,
      action: 'delete-local-data',
      deleteGmail: true
    })).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('refuses to prepare confirmation while other lifecycle work is pending', () => {
    const harness = createHarness()
    harness.lifecycle.save({
      version: 1,
      operationId: 'disconnect-work-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'revocation-pending'
    })

    expect(harness.command.prepare({ version: 1, action: 'delete-local-data' }))
      .toMatchObject({
        ok: false,
        error: { code: 'OPERATION_CONFLICT', retryable: true }
      })
    expect(harness.calls).toEqual([])
  })
})
