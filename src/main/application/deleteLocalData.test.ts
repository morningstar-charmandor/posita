import { describe, expect, it } from 'vitest'
import type { MailDataset } from '../../shared/domain'
import { fixtures } from '../../shared/fixtures'
import type {
  AccountLifecycleRepository,
  DeleteLocalDataOperationV1,
  DeleteLocalDataPhase,
  LifecycleOperationV1
} from './accountLifecycle'
import type {
  AccountStateRepository,
  ProviderAccountRecordV1,
  ProviderSyncStateV1
} from './accountState'
import {
  ComposedDeleteLocalDataActions,
  DeleteLocalDataService,
  type CacheDataKeyEraser
} from './deleteLocalData'
import type { LocalActionConfirmationVerifier } from './localActionConfirmation'
import type { MutableMailRepository } from './mailRepository'
import type { SecretName, SecretVault } from './secretVault'

type FailureStep = 'credentials' | 'account-state' | 'mail-data' | 'compaction' | 'data-key'

class MemoryLifecycleRepository implements AccountLifecycleRepository {
  readonly operations = new Map<string, LifecycleOperationV1>()
  failSavePhase?: DeleteLocalDataPhase
  save(operation: LifecycleOperationV1): void {
    if (operation.operationType === 'delete-local-data' && operation.phase === this.failSavePhase) {
      this.failSavePhase = undefined
      throw new Error('journal save failed')
    }
    this.operations.set(operation.operationId, structuredClone(operation))
  }
  load(operationId: string): LifecycleOperationV1 | undefined {
    const value = this.operations.get(operationId)
    return value && structuredClone(value)
  }
  loadLatestDeleteLocalData(): DeleteLocalDataOperationV1 | undefined {
    const operations = [...this.operations.values()]
      .filter((value): value is DeleteLocalDataOperationV1 =>
        value.operationType === 'delete-local-data')
    const value = operations.at(-1)
    return value && structuredClone(value)
  }
  listPending(): LifecycleOperationV1[] {
    return [...this.operations.values()].filter((operation) => operation.phase !== 'completed')
  }
  deleteCompleted(operationId: string): boolean {
    return this.operations.get(operationId)?.phase === 'completed' && this.operations.delete(operationId)
  }
}

class FakeMailRepository implements MutableMailRepository {
  failOnce?: FailureStep
  private dataset: MailDataset = structuredClone(fixtures)
  constructor(readonly actions: string[], failure?: FailureStep) { this.failOnce = failure }
  initialize(): void {}
  seedIfEmpty(): boolean { return false }
  loadDataset(): MailDataset {
    this.actions.push('load-mail')
    return structuredClone(this.dataset)
  }
  replaceDataset(dataset: MailDataset): void { this.dataset = structuredClone(dataset) }
  deleteAllRecords(): void {
    this.actions.push('delete-all-mail')
    this.maybeFail('mail-data')
    this.dataset = { accounts: [], people: [], messages: [], topics: [], briefItems: [] }
  }
  sanitizeStorage(): void {
    this.actions.push('sanitize')
    this.maybeFail('compaction')
  }
  destroyEncryptionContext(): void { this.actions.push('destroy-key') }
  close(): void {}
  private maybeFail(step: FailureStep): void {
    if (this.failOnce === step) {
      this.failOnce = undefined
      throw new Error(`${step} failed`)
    }
  }
}

class FakeAccountState implements AccountStateRepository {
  failOnce?: FailureStep
  constructor(private readonly actions: string[], failure?: FailureStep) {
    this.failOnce = failure
  }
  saveProviderAccount(_record: ProviderAccountRecordV1): void {}
  loadProviderAccount(): ProviderAccountRecordV1 | undefined { return undefined }
  saveSyncState(_state: ProviderSyncStateV1): void {}
  loadSyncState(): ProviderSyncStateV1 | undefined { return undefined }
  deleteAccountState(): boolean { return false }
  deleteAllAccountState(): boolean {
    this.actions.push('delete-all-account-state')
    if (this.failOnce === 'account-state') {
      this.failOnce = undefined
      throw new Error('account state failed')
    }
    return true
  }
}

class FakeVault implements SecretVault {
  failOnce?: FailureStep
  constructor(private readonly actions: string[], failure?: FailureStep) {
    this.failOnce = failure
  }
  async set(): Promise<void> {}
  async get(): Promise<string | undefined> { return undefined }
  async delete(name: SecretName): Promise<boolean> {
    this.actions.push(`delete-credential:${name}`)
    if (this.failOnce === 'credentials') {
      this.failOnce = undefined
      throw new Error('credential failed')
    }
    return true
  }
  async deleteGoogleRefreshTokens(): Promise<number> {
    this.actions.push('delete-all-refresh-credentials')
    if (this.failOnce === 'credentials') {
      this.failOnce = undefined
      throw new Error('credential failed')
    }
    return 3
  }
}

class FakeKeyEraser implements CacheDataKeyEraser {
  failOnce?: FailureStep
  constructor(private readonly actions: string[], failure?: FailureStep) {
    this.failOnce = failure
  }
  async delete(): Promise<boolean> {
    this.actions.push('delete-key')
    if (this.failOnce === 'data-key') {
      this.failOnce = undefined
      throw new Error('data key failed')
    }
    return true
  }
}

class FakeConfirmation implements LocalActionConfirmationVerifier {
  valid = true
  matched = true
  fail = false
  isValid(): boolean {
    if (this.fail) throw new Error('confirmation unavailable')
    return this.valid
  }
  matches(): boolean {
    if (this.fail) throw new Error('confirmation unavailable')
    return this.matched
  }
}

const operation = (phase: DeleteLocalDataPhase): DeleteLocalDataOperationV1 => ({
  version: 1,
  operationId: 'delete-local-1',
  operationType: 'delete-local-data',
  phase
})

const createHarness = (failure?: FailureStep) => {
  const actions: string[] = []
  const lifecycle = new MemoryLifecycleRepository()
  const mail = new FakeMailRepository(actions, failure)
  const confirmation = new FakeConfirmation()
  const vault = new FakeVault(actions, failure)
  const accountState = new FakeAccountState(actions, failure)
  const keyEraser = new FakeKeyEraser(actions, failure)
  const service = new DeleteLocalDataService(
    lifecycle,
    new ComposedDeleteLocalDataActions(
      vault,
      accountState,
      mail,
      keyEraser,
      { sanitize: async () => mail.sanitizeStorage() }
    ),
    confirmation
  )
  return { actions, accountState, confirmation, keyEraser, lifecycle, mail, service, vault }
}

const request = {
  version: 1 as const,
  operationId: 'delete-local-1',
  confirmationId: 'confirm-delete-1'
}

describe('DeleteLocalDataService', () => {
  it('deletes credentials, private records, storage remnants, and key material in order', async () => {
    const harness = createHarness()

    await expect(harness.service.delete(request)).resolves.toEqual({
      version: 1,
      operationId: 'delete-local-1',
      status: 'completed'
    })
    expect(harness.actions).toEqual([
      'delete-all-refresh-credentials',
      'delete-all-account-state',
      'delete-all-mail',
      'sanitize',
      'delete-key',
      'destroy-key'
    ])
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('completed'))
    expect(harness.mail.loadDataset()).toEqual({
      accounts: [], people: [], messages: [], topics: [], briefItems: []
    })
  })

  it.each([
    ['credentials-delete-pending', 'credentials', 'CREDENTIAL_DELETE_FAILED'],
    ['account-state-delete-pending', 'account-state', 'ACCOUNT_STATE_DELETE_FAILED'],
    ['mail-data-delete-pending', 'mail-data', 'MAIL_DATA_DELETE_FAILED'],
    ['compaction-pending', 'compaction', 'COMPACTION_FAILED'],
    ['data-key-delete-pending', 'data-key', 'DATA_KEY_DELETE_FAILED']
  ] as const)('records and resumes a failure at %s', async (phase, failure, code) => {
    const harness = createHarness(failure)
    harness.lifecycle.save(operation(phase))

    await expect(harness.service.delete(request)).rejects.toMatchObject({ code, retryable: true })
    expect(harness.lifecycle.load(request.operationId)).toEqual({
      ...operation(phase),
      lastErrorCode: code
    })
    await expect(harness.service.delete(request)).resolves.toMatchObject({ status: 'completed' })
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('completed'))
  })

  it.each([
    ['credentials-delete-pending', 'account-state-delete-pending', 'delete-all-refresh-credentials'],
    ['account-state-delete-pending', 'mail-data-delete-pending', 'delete-all-account-state'],
    ['mail-data-delete-pending', 'compaction-pending', 'delete-all-mail'],
    ['compaction-pending', 'data-key-delete-pending', 'sanitize'],
    ['data-key-delete-pending', 'completed', 'delete-key']
  ] as const)(
    'repeats an idempotent %s action when journal advancement crashes',
    async (phase, failedSavePhase, repeatedAction) => {
      const harness = createHarness()
      harness.lifecycle.save(operation(phase))
      harness.lifecycle.failSavePhase = failedSavePhase

      await expect(harness.service.delete(request)).rejects.toMatchObject({
        code: 'LIFECYCLE_STORAGE_FAILED', retryable: true
      })
      expect(harness.lifecycle.load(request.operationId)).toEqual(operation(phase))
      await expect(harness.service.delete(request)).resolves.toMatchObject({ status: 'completed' })
      expect(harness.actions.filter((action) => action === repeatedAction)).toHaveLength(2)
    }
  )

  it('rejects an operation ID already used for account disconnect', async () => {
    const harness = createHarness()
    harness.lifecycle.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'revocation-pending'
    })
    await expect(harness.service.delete(request)).rejects.toMatchObject({
      code: 'DELETE_LOCAL_DATA_OPERATION_CONFLICT', retryable: false
    })
  })

  it('rejects a new installation deletion while any lifecycle operation is pending', async () => {
    const harness = createHarness()
    harness.lifecycle.save({
      version: 1,
      operationId: 'disconnect-work-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'credential-delete-pending'
    })

    await expect(harness.service.delete(request)).rejects.toMatchObject({
      code: 'DELETE_LOCAL_DATA_IN_PROGRESS', retryable: true
    })
    expect(harness.lifecycle.load(request.operationId)).toBeUndefined()
  })

  it('rejects a competing durable installation deletion after restart', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('mail-data-delete-pending'))

    await expect(harness.service.delete({
      version: 1,
      operationId: 'delete-local-2',
      confirmationId: 'confirm-delete-2'
    }))
      .rejects.toMatchObject({ code: 'DELETE_LOCAL_DATA_IN_PROGRESS', retryable: true })
  })

  it('shares identical in-flight work and rejects a competing installation operation', async () => {
    let release = (): void => undefined
    const pending = new Promise<boolean>((resolve) => { release = () => resolve(true) })
    const harness = createHarness()
    const waiting = new DeleteLocalDataService(
      harness.lifecycle,
      new ComposedDeleteLocalDataActions(
        new FakeVault(harness.actions),
        new FakeAccountState(harness.actions),
        harness.mail,
        { delete: () => pending },
        { sanitize: async () => harness.mail.sanitizeStorage() }
      ),
      harness.confirmation
    )
    harness.lifecycle.save(operation('data-key-delete-pending'))

    const first = waiting.delete(request)
    expect(waiting.delete(request)).toBe(first)
    await expect(waiting.delete({
      version: 1,
      operationId: 'delete-local-2',
      confirmationId: 'confirm-delete-2'
    }))
      .rejects.toMatchObject({ code: 'DELETE_LOCAL_DATA_IN_PROGRESS' })
    release()
    await expect(first).resolves.toMatchObject({ status: 'completed' })
  })

  it('rejects invalid input before creating a lifecycle operation', async () => {
    const harness = createHarness()
    await expect(harness.service.delete({
      version: 1,
      operationId: '../delete',
      confirmationId: 'confirm-delete-1'
    }))
      .rejects.toMatchObject({ code: 'INVALID_DELETE_LOCAL_DATA_REQUEST' })
    expect(harness.lifecycle.operations.size).toBe(0)
  })

  it('requires a current confirmation before creating destructive work', async () => {
    const harness = createHarness()
    harness.confirmation.valid = false

    await expect(harness.service.delete(request)).rejects.toMatchObject({
      code: 'DELETE_LOCAL_DATA_NOT_CONFIRMED', retryable: false
    })
    expect(harness.lifecycle.operations.size).toBe(0)
    expect(harness.actions).toEqual([])
  })

  it('requires the same confirmation when a confirmed command is retried', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('mail-data-delete-pending'))
    harness.confirmation.matched = false

    await expect(harness.service.delete(request)).rejects.toMatchObject({
      code: 'DELETE_LOCAL_DATA_NOT_CONFIRMED', retryable: false
    })
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('mail-data-delete-pending'))
  })

  it('resumes already-journaled deletion without requiring a fresh confirmation', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('compaction-pending'))
    harness.confirmation.fail = true

    await expect(harness.service.resume({
      version: 1,
      operationId: request.operationId
    })).resolves.toMatchObject({ status: 'completed' })
    expect(harness.actions).toEqual(['sanitize', 'delete-key', 'destroy-key'])
  })

  it('does not create destructive work through the recovery entry point', async () => {
    const harness = createHarness()

    await expect(harness.service.resume({
      version: 1,
      operationId: request.operationId
    })).rejects.toMatchObject({
      code: 'DELETE_LOCAL_DATA_RESUME_NOT_FOUND', retryable: false
    })
    expect(harness.lifecycle.operations.size).toBe(0)
  })

  it('stops recovery between phases when its lifecycle owner is cancelled', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('mail-data-delete-pending'))
    const controller = new AbortController()
    controller.abort()

    await expect(harness.service.resume(
      { version: 1, operationId: request.operationId },
      controller.signal
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('mail-data-delete-pending'))
    expect(harness.actions).toEqual([])
  })

  it('maps confirmation storage failure to a safe retryable error', async () => {
    const harness = createHarness()
    harness.confirmation.fail = true

    await expect(harness.service.delete(request)).rejects.toMatchObject({
      code: 'CONFIRMATION_UNAVAILABLE', retryable: true
    })
    expect(harness.lifecycle.operations.size).toBe(0)
  })
})
