import { describe, expect, it } from 'vitest'
import type { MailDataset } from '../../shared/domain'
import { fixtures } from '../../shared/fixtures'
import type {
  AccountLifecycleRepository,
  DisconnectAccountOperationV1,
  DisconnectPhase,
  LifecycleOperationV1
} from './accountLifecycle'
import type {
  AccountStateRepository,
  ProviderAccountRecordV1,
  ProviderSyncStateV1
} from './accountState'
import { AccountDataRemovalService } from './accountDataRemoval'
import {
  DisconnectAccountService,
  type AccountAuthorizationRevoker
} from './disconnectAccount'
import type { MutableMailRepository } from './mailRepository'
import type { SecretName, SecretVault } from './secretVault'

type FailureStep = 'revoke' | 'credential' | 'account-state' | 'mail-data' | 'compaction'

class MemoryLifecycleRepository implements AccountLifecycleRepository {
  readonly operations = new Map<string, LifecycleOperationV1>()
  failSavePhase?: DisconnectPhase
  save(operation: LifecycleOperationV1): void {
    if (operation.operationType === 'disconnect-account' && operation.phase === this.failSavePhase) {
      this.failSavePhase = undefined
      throw new Error('journal save failed')
    }
    this.operations.set(operation.operationId, structuredClone(operation))
  }
  load(operationId: string): LifecycleOperationV1 | undefined {
    const value = this.operations.get(operationId)
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
  readonly actions: string[]
  private dataset: MailDataset

  constructor(actions: string[], failOnce?: FailureStep) {
    this.actions = actions
    this.failOnce = failOnce
    this.dataset = structuredClone(fixtures)
  }

  initialize(): void {}
  seedIfEmpty(): boolean { return false }
  loadDataset(): MailDataset {
    this.actions.push('load-mail')
    return structuredClone(this.dataset)
  }
  replaceDataset(dataset: MailDataset): void {
    this.actions.push('replace-mail')
    this.maybeFail('mail-data')
    this.dataset = structuredClone(dataset)
  }
  sanitizeStorage(): void {
    this.actions.push('sanitize')
    this.maybeFail('compaction')
  }
  deleteAllRecords(): void {}
  destroyEncryptionContext(): void {}
  close(): void {}

  private maybeFail(step: FailureStep): void {
    if (this.failOnce === step) {
      this.failOnce = undefined
      throw new Error(`${step} failed`)
    }
  }
}

class FakeVault implements SecretVault {
  failOnce?: FailureStep
  constructor(private readonly actions: string[], failOnce?: FailureStep) {
    this.failOnce = failOnce
  }
  async set(): Promise<void> {}
  async get(): Promise<string | undefined> { return undefined }
  async delete(_name: SecretName): Promise<boolean> {
    this.actions.push('delete-credential')
    if (this.failOnce === 'credential') {
      this.failOnce = undefined
      throw new Error('credential failed')
    }
    return true
  }
  async deleteGoogleRefreshTokens(): Promise<number> { return 0 }
}

class FakeAccountState implements AccountStateRepository {
  failOnce?: FailureStep
  constructor(private readonly actions: string[], failOnce?: FailureStep) {
    this.failOnce = failOnce
  }
  saveProviderAccount(_record: ProviderAccountRecordV1): void {}
  loadProviderAccount(): ProviderAccountRecordV1 | undefined { return undefined }
  saveSyncState(_state: ProviderSyncStateV1): void {}
  loadSyncState(): ProviderSyncStateV1 | undefined { return undefined }
  deleteAccountState(): boolean {
    this.actions.push('delete-account-state')
    if (this.failOnce === 'account-state') {
      this.failOnce = undefined
      throw new Error('account state failed')
    }
    return true
  }
  deleteAllAccountState(): boolean { return false }
}

const operation = (phase: DisconnectPhase): DisconnectAccountOperationV1 => ({
  version: 1,
  operationId: 'disconnect-work-1',
  operationType: 'disconnect-account',
  accountId: 'work',
  phase
})

const createHarness = (failure?: FailureStep) => {
  const actions: string[] = []
  const lifecycle = new MemoryLifecycleRepository()
  const mailRepository = new FakeMailRepository(actions, failure)
  const revoker: AccountAuthorizationRevoker = {
    revoke: async () => {
      actions.push('revoke')
      if (failure === 'revoke' && actions.filter((action) => action === 'revoke').length === 1) {
        throw new Error('revoke failed')
      }
    }
  }
  const service = new DisconnectAccountService(
    lifecycle,
    revoker,
    new FakeVault(actions, failure),
    new FakeAccountState(actions, failure),
    new AccountDataRemovalService(mailRepository),
    mailRepository
  )
  return { actions, lifecycle, mailRepository, service }
}

const request = { version: 1 as const, operationId: 'disconnect-work-1', accountId: 'work' }

describe('DisconnectAccountService', () => {
  it('completes every account disconnect phase in order', async () => {
    const harness = createHarness()

    await expect(harness.service.disconnect(request)).resolves.toEqual({
      version: 1,
      operationId: 'disconnect-work-1',
      accountId: 'work',
      status: 'completed'
    })
    expect(harness.actions).toEqual([
      'revoke',
      'delete-credential',
      'delete-account-state',
      'load-mail',
      'replace-mail',
      'sanitize'
    ])
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('completed'))
    expect(harness.mailRepository.loadDataset().accounts.map((account) => account.id))
      .not.toContain('work')
  })

  it.each([
    ['revocation-pending', 'revoke', 'REVOCATION_FAILED'],
    ['credential-delete-pending', 'credential', 'CREDENTIAL_DELETE_FAILED'],
    ['account-state-delete-pending', 'account-state', 'ACCOUNT_STATE_DELETE_FAILED'],
    ['mail-data-delete-pending', 'mail-data', 'MAIL_DATA_DELETE_FAILED'],
    ['compaction-pending', 'compaction', 'COMPACTION_FAILED']
  ] as const)('records and resumes a failure at %s', async (phase, failure, code) => {
    const harness = createHarness(failure)
    harness.lifecycle.save(operation(phase))
    if (phase === 'compaction-pending') {
      new AccountDataRemovalService(harness.mailRepository).run('work')
      harness.actions.length = 0
    }

    await expect(harness.service.disconnect(request)).rejects.toMatchObject({ code, retryable: true })
    expect(harness.lifecycle.load(request.operationId)).toEqual({
      ...operation(phase),
      lastErrorCode: code
    })

    await expect(harness.service.disconnect(request)).resolves.toMatchObject({ status: 'completed' })
    expect(harness.lifecycle.load(request.operationId)).toEqual(operation('completed'))
  })

  it.each([
    ['revocation-pending', 'credential-delete-pending', 'revoke'],
    ['credential-delete-pending', 'account-state-delete-pending', 'delete-credential'],
    ['account-state-delete-pending', 'mail-data-delete-pending', 'delete-account-state'],
    ['mail-data-delete-pending', 'compaction-pending', 'load-mail'],
    ['compaction-pending', 'completed', 'sanitize']
  ] as const)(
    'repeats an idempotent %s action when journal advancement crashes',
    async (phase, failedSavePhase, repeatedAction) => {
      const harness = createHarness()
      harness.lifecycle.save(operation(phase))
      if (phase === 'compaction-pending') {
        new AccountDataRemovalService(harness.mailRepository).run('work')
        harness.actions.length = 0
      }
      harness.lifecycle.failSavePhase = failedSavePhase

      await expect(harness.service.disconnect(request)).rejects.toMatchObject({
        code: 'LIFECYCLE_STORAGE_FAILED',
        retryable: true
      })
      expect(harness.lifecycle.load(request.operationId)).toEqual(operation(phase))

      await expect(harness.service.disconnect(request)).resolves.toMatchObject({ status: 'completed' })
      expect(harness.actions.filter((action) => action === repeatedAction)).toHaveLength(2)
    }
  )

  it('rejects reuse of an operation ID for another account', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('credential-delete-pending'))

    await expect(harness.service.disconnect({
      version: 1,
      operationId: 'disconnect-work-1',
      accountId: 'personal'
    })).rejects.toMatchObject({ code: 'DISCONNECT_OPERATION_CONFLICT', retryable: false })
  })

  it('shares the same in-flight promise and rejects a competing operation', async () => {
    let release = (): void => undefined
    const revocation = new Promise<void>((resolve) => { release = resolve })
    const harness = createHarness()
    const waitingService = new DisconnectAccountService(
      harness.lifecycle,
      { revoke: () => revocation },
      new FakeVault(harness.actions),
      new FakeAccountState(harness.actions),
      new AccountDataRemovalService(harness.mailRepository),
      harness.mailRepository
    )

    const first = waitingService.disconnect(request)
    const same = waitingService.disconnect(request)
    const competing = waitingService.disconnect({ ...request, operationId: 'disconnect-work-2' })

    expect(same).toBe(first)
    await expect(competing).rejects.toMatchObject({ code: 'DISCONNECT_IN_PROGRESS' })
    release()
    await expect(first).resolves.toMatchObject({ status: 'completed' })
  })

  it('rejects a new disconnect while full local-data deletion is pending', async () => {
    const harness = createHarness()
    harness.lifecycle.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'mail-data-delete-pending'
    })

    await expect(harness.service.disconnect(request)).rejects.toMatchObject({
      code: 'DISCONNECT_IN_PROGRESS', retryable: true
    })
    expect(harness.lifecycle.load(request.operationId)).toBeUndefined()
  })

  it('rejects a competing durable disconnect for the same account after restart', async () => {
    const harness = createHarness()
    harness.lifecycle.save(operation('credential-delete-pending'))

    await expect(harness.service.disconnect({
      ...request,
      operationId: 'disconnect-work-2'
    })).rejects.toMatchObject({ code: 'DISCONNECT_IN_PROGRESS', retryable: true })
  })

  it('rejects invalid identifiers before creating a journal entry', async () => {
    const harness = createHarness()

    await expect(harness.service.disconnect({
      version: 1,
      operationId: '../disconnect',
      accountId: 'work'
    })).rejects.toMatchObject({ code: 'INVALID_DISCONNECT_REQUEST', retryable: false })
    expect(harness.lifecycle.operations.size).toBe(0)
  })
})
