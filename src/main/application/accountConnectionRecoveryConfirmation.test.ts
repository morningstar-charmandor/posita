import { describe, expect, it } from 'vitest'
import { ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES } from '../../shared/contracts'
import type { AccountAuthorizationAdapter } from './accountAuthorization'
import { AccountConnectionService } from './accountConnection'
import type { AccountStateRepository, ProviderAccountRecordV1, ProviderSyncStateV1 } from './accountState'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  AccountConnectionRecoveryConfirmationService,
  type AccountConnectionRecoveryConfirmationRecordV1,
  type AccountConnectionRecoveryConfirmationRepository
} from './accountConnectionRecoveryConfirmation'
import type { SecretName, SecretVault } from './secretVault'
import type { RecoverAccountConnectionRequestV1 } from './recoverAccountConnection'

const accountId = 'account-work-1'
const credentialName: SecretName = 'oauth.google.account-work-1.refresh-token'

class MemoryRepository implements AccountConnectionRecoveryConfirmationRepository {
  readonly records = new Map<string, AccountConnectionRecoveryConfirmationRecordV1>()
  fail = false
  save(record: AccountConnectionRecoveryConfirmationRecordV1): void {
    if (this.fail) throw new Error('test-only storage failure')
    this.records.set(record.confirmationId, record)
  }
  load(id: string): AccountConnectionRecoveryConfirmationRecordV1 | undefined {
    if (this.fail) throw new Error('test-only storage failure')
    return this.records.get(id)
  }
  consume(request: RecoverAccountConnectionRequestV1, consumedAt: string): boolean {
    if (this.fail) throw new Error('test-only storage failure')
    const record = this.records.get(request.confirmationId)
    if (record === undefined || record.consumedAt !== undefined ||
        record.operationId !== request.operationId || record.action !== request.action ||
        record.accountId !== request.accountId ||
        record.expectedStatus !== request.expectedStatus || record.expiresAt < consumedAt) {
      return false
    }
    this.records.set(request.confirmationId, { ...record, consumedAt })
    return true
  }
  deleteExpired(before: string): number {
    let count = 0
    for (const [id, record] of this.records) {
      if (record.expiresAt < before) { this.records.delete(id); count += 1 }
    }
    return count
  }
}

class MemoryVault implements SecretVault {
  readonly values = new Map<SecretName, string>()
  failHas = false
  async set(name: SecretName, value: string): Promise<void> { this.values.set(name, value) }
  async has(name: SecretName): Promise<boolean> {
    if (this.failHas) throw new Error('test-only inspection failure')
    return this.values.has(name)
  }
  async get(name: SecretName): Promise<string | undefined> { return this.values.get(name) }
  async delete(name: SecretName): Promise<boolean> { return this.values.delete(name) }
  async deleteGoogleRefreshTokens(): Promise<number> { return 0 }
}

class MemoryState implements AccountStateRepository {
  provider = false
  saveProviderAccount(): void { this.provider = true }
  hasProviderAccount(): boolean { return this.provider }
  loadProviderAccount(): ProviderAccountRecordV1 | undefined { return undefined }
  saveSyncState(): void {}
  loadSyncState(): ProviderSyncStateV1 | undefined { return undefined }
  deleteAccountState(): boolean { const changed = this.provider; this.provider = false; return changed }
  deleteAllAccountState(): boolean { return false }
}

const authorization: AccountAuthorizationAdapter = {
  begin: async () => { throw new Error('not used') },
  complete: async () => { throw new Error('not used') },
  cancel: async () => false
}

const createHarness = () => {
  const repository = new MemoryRepository()
  const vault = new MemoryVault()
  const state = new MemoryState()
  const clock = { current: new Date('2026-08-28T12:00:00.000Z'), now() { return this.current } }
  const ids = ['confirmation-recovery-1', 'operation-recovery-1']
  const service = new AccountConnectionRecoveryConfirmationService(
    new AccountConnectionService(authorization, vault, state), repository, clock,
    () => ids.shift() ?? 'unused-id'
  )
  return { service, repository, vault, state, clock }
}

const prepareRequest = {
  version: 1 as const,
  action: 'discard-orphaned-local-connection-state' as const,
  accountId
}

describe('AccountConnectionRecoveryConfirmationService', () => {
  it('preflights orphan status and persists an account-and-status-bound receipt', async () => {
    const { service, repository, vault } = createHarness()
    vault.values.set(credentialName, 'test-only-orphan')
    const challenge = await service.prepare(prepareRequest)
    expect(challenge).toMatchObject({
      confirmationId: 'confirmation-recovery-1',
      operationId: 'operation-recovery-1',
      requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
      consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
      accountId,
      expectedStatus: 'credential-only'
    })
    const record = service.confirm({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      accountId: challenge.accountId,
      expectedStatus: challenge.expectedStatus,
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })
    expect(record).toEqual(repository.records.get(challenge.confirmationId))
    const recoveryRequest: RecoverAccountConnectionRequestV1 = {
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      accountId,
      expectedStatus: 'credential-only'
    }
    expect(service.consume(recoveryRequest)).toBe(true)
    expect(service.consume(recoveryRequest)).toBe(false)
    expect(repository.records.get(challenge.confirmationId)?.consumedAt)
      .toBe('2026-08-28T12:00:00.000Z')
    expect(() => service.confirm({
      ...recoveryRequest,
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_USED'
    }))
  })

  it('refuses absent and connected state while deriving either orphan status in main', async () => {
    const absent = createHarness()
    await expect(absent.service.prepare(prepareRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STATE_CHANGED'
    })
    const connected = createHarness()
    connected.vault.values.set(credentialName, 'test-only-credential')
    connected.state.provider = true
    await expect(connected.service.prepare(prepareRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STATE_CHANGED'
    })
    const otherSide = createHarness()
    otherSide.state.provider = true
    await expect(otherSide.service.prepare(prepareRequest)).resolves.toMatchObject({
      accountId,
      expectedStatus: 'provider-state-only'
    })
  })

  it('maps consistency inspection failure to its safe confirmation error', async () => {
    const failed = createHarness()
    failed.vault.failHas = true
    await expect(failed.service.prepare(prepareRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED',
      retryable: true
    })
  })

  it('rejects wrong text, rebinding, expiry, malformed input, and storage failure', async () => {
    const wrong = createHarness()
    wrong.vault.values.set(credentialName, 'test-only-orphan')
    const challenge = await wrong.service.prepare(prepareRequest)
    const base = {
      version: 1 as const,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      accountId,
      expectedStatus: 'credential-only' as const
    }
    expect(() => wrong.service.confirm({ ...base, enteredText: 'DISCARD' })).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT_MISMATCH' })
    )
    expect(() => wrong.service.confirm({
      ...base, accountId: 'account-other-1', enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_NOT_FOUND'
    }))
    wrong.clock.current = new Date('2026-08-28T12:05:00.001Z')
    expect(() => wrong.service.confirm({
      ...base, enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_EXPIRED'
    }))
    await expect(wrong.service.prepare({ ...prepareRequest, extra: true })).rejects.toMatchObject({
      code: 'INVALID_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUEST'
    })

    const failed = createHarness()
    failed.vault.values.set(credentialName, 'test-only-orphan')
    const failedChallenge = await failed.service.prepare(prepareRequest)
    failed.repository.fail = true
    expect(() => failed.service.confirm({
      version: 1,
      confirmationId: failedChallenge.confirmationId,
      operationId: failedChallenge.operationId,
      action: failedChallenge.action,
      accountId,
      expectedStatus: 'credential-only',
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED', retryable: true
    }))

    const consumeFailure = createHarness()
    consumeFailure.vault.values.set(credentialName, 'test-only-orphan')
    const consumeChallenge = await consumeFailure.service.prepare(prepareRequest)
    const consumeRequest: RecoverAccountConnectionRequestV1 = {
      version: 1,
      confirmationId: consumeChallenge.confirmationId,
      operationId: consumeChallenge.operationId,
      action: consumeChallenge.action,
      accountId,
      expectedStatus: 'credential-only'
    }
    consumeFailure.service.confirm({
      ...consumeRequest,
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })
    consumeFailure.repository.fail = true
    expect(() => consumeFailure.service.consume(consumeRequest)).toThrowError(
      expect.objectContaining({
        code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED',
        retryable: true
      })
    )
  })
})
