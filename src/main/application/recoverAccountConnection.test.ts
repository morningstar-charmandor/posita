import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import { AccountConnectionService } from './accountConnection'
import type {
  AccountStateRepository,
  ProviderAccountRecordV1,
  ProviderSyncStateV1
} from './accountState'
import type { AccountAuthorizationAdapter } from './accountAuthorization'
import {
  AccountConnectionRecoveryService,
  isRecoverAccountConnectionRequestV1,
  type AccountConnectionRecoveryConfirmationVerifier,
  type RecoverAccountConnectionRequestV1
} from './recoverAccountConnection'
import type { SecretName, SecretVault } from './secretVault'

const accountId = 'account-work-1'
const credentialName: SecretName = 'oauth.google.account-work-1.refresh-token'
const request: RecoverAccountConnectionRequestV1 = {
  version: 1,
  confirmationId: 'confirmation-1',
  operationId: 'recovery-operation-1',
  action: 'discard-orphaned-local-connection-state',
  accountId,
  expectedStatus: 'credential-only'
}

const unusedAuthorization: AccountAuthorizationAdapter = {
  begin: async () => { throw new Error('not used') },
  complete: async () => { throw new Error('not used') },
  cancel: async () => false
}

class MemoryVault implements SecretVault {
  readonly values = new Map<SecretName, string>()
  failDelete = false
  deleteResult?: boolean
  deleteCalls: SecretName[] = []

  async set(name: SecretName, value: string): Promise<void> { this.values.set(name, value) }
  async has(name: SecretName): Promise<boolean> { return this.values.has(name) }
  async get(name: SecretName): Promise<string | undefined> { return this.values.get(name) }
  async delete(name: SecretName): Promise<boolean> {
    this.deleteCalls.push(name)
    if (this.failDelete) throw new Error('unsafe test-only vault failure')
    if (this.deleteResult !== undefined) return this.deleteResult
    return this.values.delete(name)
  }
  async deleteGoogleRefreshTokens(): Promise<number> { return 0 }
}

class MemoryAccountState implements AccountStateRepository {
  readonly accounts = new Map<string, ProviderAccountRecordV1>()
  readonly sync = new Map<string, ProviderSyncStateV1>()
  failDelete = false
  deleteCalls: string[] = []

  saveProviderAccount(record: ProviderAccountRecordV1): void {
    this.accounts.set(record.accountId, record)
  }
  hasProviderAccount(value: string): boolean { return this.accounts.has(value) }
  loadProviderAccount(value: string): ProviderAccountRecordV1 | undefined {
    return this.accounts.get(value)
  }
  saveSyncState(state: ProviderSyncStateV1): void { this.sync.set(state.accountId, state) }
  loadSyncState(value: string): ProviderSyncStateV1 | undefined { return this.sync.get(value) }
  deleteAccountState(value: string): boolean {
    this.deleteCalls.push(value)
    if (this.failDelete) throw new Error('unsafe test-only state failure')
    const accountChanged = this.accounts.delete(value)
    const syncChanged = this.sync.delete(value)
    return accountChanged || syncChanged
  }
  deleteAllAccountState(): boolean { return false }
}

class ConfirmationVerifier implements AccountConnectionRecoveryConfirmationVerifier {
  valid = true
  fail = false
  retryableFail = false
  onValidate?: () => void
  calls: RecoverAccountConnectionRequestV1[] = []

  consume(value: RecoverAccountConnectionRequestV1): boolean {
    this.calls.push(value)
    if (this.retryableFail) {
      throw Object.assign(new Error('unsafe test-only retryable confirmation failure'), {
        retryable: true
      })
    }
    if (this.fail) throw new Error('unsafe test-only confirmation failure')
    this.onValidate?.()
    const result = this.valid
    if (result) this.valid = false
    return result
  }
}

const providerAccount = (): ProviderAccountRecordV1 => ({
  version: 1,
  accountId,
  provider: 'google',
  providerAccountId: 'provider-subject-fixture-1',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-08-28T07:00:00.000Z'
})

const createHarness = () => {
  const vault = new MemoryVault()
  const state = new MemoryAccountState()
  const confirmations = new ConfirmationVerifier()
  const connections = new AccountConnectionService(unusedAuthorization, vault, state)
  return {
    vault,
    state,
    confirmations,
    service: new AccountConnectionRecoveryService(connections, confirmations, vault, state)
  }
}

describe('AccountConnectionRecoveryService', () => {
  it('removes only an explicitly confirmed orphaned credential and requires reconnect', async () => {
    const { service, vault, state, confirmations } = createHarness()
    vault.values.set(credentialName, 'orphaned-test-credential')

    await expect(service.recover(request)).resolves.toEqual({
      version: 1,
      operationId: request.operationId,
      accountId,
      status: 'absent',
      removed: 'credential',
      reconnectRequired: true
    })
    expect(confirmations.calls).toEqual([request])
    expect(vault.deleteCalls).toEqual([credentialName])
    expect(state.deleteCalls).toEqual([])
  })

  it('removes only confirmed encrypted provider and sync state', async () => {
    const { service, vault, state } = createHarness()
    state.accounts.set(accountId, providerAccount())
    state.sync.set(accountId, {
      version: 1,
      accountId,
      provider: 'google',
      status: 'idle'
    })

    await expect(service.recover({
      ...request,
      expectedStatus: 'provider-state-only'
    })).resolves.toMatchObject({
      status: 'absent',
      removed: 'provider-state',
      reconnectRequired: true
    })
    expect(state.deleteCalls).toEqual([accountId])
    expect(state.accounts.size).toBe(0)
    expect(state.sync.size).toBe(0)
    expect(vault.deleteCalls).toEqual([])
  })

  it('refuses absent and complete accounts before asking for confirmation', async () => {
    const absent = createHarness()
    await expect(absent.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_NOT_NEEDED',
      retryable: false
    })
    expect(absent.confirmations.calls).toEqual([])

    const connected = createHarness()
    connected.vault.values.set(credentialName, 'complete-test-credential')
    connected.state.accounts.set(accountId, providerAccount())
    await expect(connected.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_REFUSED',
      retryable: false
    })
    expect(connected.confirmations.calls).toEqual([])
    expect(connected.vault.values.size).toBe(1)
    expect(connected.state.accounts.size).toBe(1)
  })

  it('rejects stale status and invalid confirmation without deleting either side', async () => {
    const stale = createHarness()
    stale.state.accounts.set(accountId, providerAccount())
    await expect(stale.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED'
    })
    expect(stale.confirmations.calls).toEqual([])
    expect(stale.state.deleteCalls).toEqual([])

    const unconfirmed = createHarness()
    unconfirmed.vault.values.set(credentialName, 'orphaned-test-credential')
    unconfirmed.confirmations.valid = false
    await expect(unconfirmed.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED'
    })
    expect(unconfirmed.vault.deleteCalls).toEqual([])
  })

  it('fails safely when confirmation verification or deletion fails', async () => {
    const verificationFailure = createHarness()
    verificationFailure.vault.values.set(credentialName, 'orphaned-test-credential')
    verificationFailure.confirmations.fail = true
    await expect(verificationFailure.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED',
      retryable: false
    })
    expect(verificationFailure.vault.deleteCalls).toEqual([])

    const retryableVerificationFailure = createHarness()
    retryableVerificationFailure.vault.values.set(
      credentialName,
      'orphaned-test-credential'
    )
    retryableVerificationFailure.confirmations.retryableFail = true
    await expect(retryableVerificationFailure.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_UNAVAILABLE',
      retryable: true
    })
    expect(retryableVerificationFailure.vault.deleteCalls).toEqual([])

    const deletionFailure = createHarness()
    deletionFailure.vault.values.set(credentialName, 'orphaned-test-credential')
    deletionFailure.vault.failDelete = true
    await expect(deletionFailure.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_DELETE_FAILED',
      retryable: true
    })
    expect(deletionFailure.vault.values.has(credentialName)).toBe(true)
    deletionFailure.vault.failDelete = false
    await expect(deletionFailure.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED',
      retryable: false
    })
    expect(deletionFailure.vault.deleteCalls).toEqual([credentialName])
  })

  it('detects a post-confirmation state change and an incomplete deletion', async () => {
    const changed = createHarness()
    changed.vault.values.set(credentialName, 'orphaned-test-credential')
    changed.confirmations.onValidate = () => changed.state.accounts.set(accountId, providerAccount())
    await expect(changed.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED',
      retryable: false
    })
    expect(changed.vault.deleteCalls).toEqual([])
    expect(changed.vault.values.size).toBe(1)
    expect(changed.state.accounts.size).toBe(1)

    const incomplete = createHarness()
    incomplete.vault.values.set(credentialName, 'orphaned-test-credential')
    incomplete.vault.deleteResult = false
    await expect(incomplete.service.recover(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_INCOMPLETE',
      retryable: false
    })
    expect(incomplete.vault.deleteCalls).toEqual([credentialName])
  })

  it('rejects malformed or over-broad requests before inspecting state', async () => {
    const { service, vault, state, confirmations } = createHarness()
    vault.values.set(credentialName, 'orphaned-test-credential')
    const invalid = { ...request, action: 'repair-automatically', secret: 'forbidden' }

    expect(isRecoverAccountConnectionRequestV1(request)).toBe(true)
    expect(isRecoverAccountConnectionRequestV1(invalid)).toBe(false)
    await expect(service.recover(invalid)).rejects.toMatchObject({
      code: 'INVALID_ACCOUNT_CONNECTION_RECOVERY_REQUEST'
    })
    expect(confirmations.calls).toEqual([])
    expect(vault.deleteCalls).toEqual([])
    expect(state.deleteCalls).toEqual([])
  })
})
