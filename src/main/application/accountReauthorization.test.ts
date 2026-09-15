import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import { DeterministicFakeAccountAuthorizationAdapter } from '../infrastructure/providers/deterministicFakeAccountAuthorizationAdapter'
import { GOOGLE_AUTHORIZATION_SCOPES, type BeginAccountAuthorizationRequestV1 } from './accountAuthorization'
import { AccountReauthorizationService } from './accountReauthorization'
import type { AccountStateRepository, ProviderAccountRecordV2, ProviderSyncState } from './accountState'
import type { SecretName, SecretVault } from './secretVault'

const account: ProviderAccountRecordV2 = {
  version: 2,
  accountId: 'account-work-1',
  provider: 'google',
  providerAccountId: 'provider-subject-fixture-1',
  displayIdentity: { mailboxAddress: 'owner.work@example.test', displayLabel: 'Work' },
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-09-04T07:00:00.000Z'
}
const expired: ProviderSyncState = {
  version: 1,
  accountId: account.accountId,
  provider: 'google',
  status: 'error',
  cursor: 'encrypted-cursor-is-preserved-by-repository',
  lastErrorCode: 'AUTHENTICATION_EXPIRED'
}
const request: BeginAccountAuthorizationRequestV1 = {
  version: 1,
  accountId: account.accountId,
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_AUTHORIZATION_SCOPES
}
const completeRequest = {
  version: 1 as const,
  sessionId: 'authorization-session-1',
  callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
}

class MemoryVault implements SecretVault {
  values = new Map<SecretName, string>([[
    'oauth.google.account-work-1.refresh-token', 'expired-test-credential'
  ]])
  async set(name: SecretName, value: string): Promise<void> { this.values.set(name, value) }
  async get(name: SecretName): Promise<string | undefined> { return this.values.get(name) }
  async has(name: SecretName): Promise<boolean> { return this.values.has(name) }
  async delete(name: SecretName): Promise<boolean> { return this.values.delete(name) }
  async deleteGoogleRefreshTokens(): Promise<number> { return 0 }
}

class MemoryState implements AccountStateRepository {
  account: ProviderAccountRecordV2 | undefined = structuredClone(account)
  sync: ProviderSyncState | undefined = structuredClone(expired)
  saveProviderAccount(record: ProviderAccountRecordV2): void { this.account = structuredClone(record) }
  hasProviderAccount(accountId: string): boolean { return this.account?.accountId === accountId }
  loadProviderAccount(accountId: string): ProviderAccountRecordV2 | undefined {
    return this.account?.accountId === accountId ? structuredClone(this.account) : undefined
  }
  saveSyncState(state: ProviderSyncState): void { this.sync = structuredClone(state) }
  loadSyncState(accountId: string): ProviderSyncState | undefined {
    return this.sync?.accountId === accountId ? structuredClone(this.sync) : undefined
  }
  deleteAccountState(accountId: string): boolean {
    if (this.account?.accountId !== accountId) return false
    this.account = undefined
    this.sync = undefined
    return true
  }
  deleteAllAccountState(): boolean { this.account = undefined; this.sync = undefined; return true }
}

const authorization = (
  mailboxAddress = account.displayIdentity.mailboxAddress,
  providerAccountId = account.providerAccountId
) =>
  new DeterministicFakeAccountAuthorizationAdapter({
    authorizationUrl: 'https://accounts.example.invalid/authorize?fixture=readonly',
    callbackUrl: completeRequest.callbackUrl,
    providerAccountId,
    mailboxAddress,
    refreshToken: 'renewed-test-credential',
    sessionLifetimeMs: 300_000
  }, { now: () => new Date('2026-09-15T07:00:00.000Z') }, () => completeRequest.sessionId)

describe('AccountReauthorizationService', () => {
  it('atomically replaces only the credential and preserves account, cursor, and retained state', async () => {
    const vault = new MemoryVault()
    const state = new MemoryState()
    const invalidate = vi.fn()
    const service = new AccountReauthorizationService(
      authorization(), vault, state, { invalidate }
    )

    await service.begin(request)
    await expect(service.complete(completeRequest)).resolves.toEqual(account)
    expect(vault.values.get('oauth.google.account-work-1.refresh-token'))
      .toBe('renewed-test-credential')
    expect(state.account).toEqual(account)
    expect(state.sync).toEqual(expired)
    expect(invalidate).toHaveBeenCalledExactlyOnceWith(account.accountId)
  })

  it('rejects a different Google identity before replacing the existing credential', async () => {
    const vault = new MemoryVault()
    const state = new MemoryState()
    const invalidate = vi.fn()
    const service = new AccountReauthorizationService(
      authorization('different@example.test'), vault, state, { invalidate }
    )

    await service.begin(request)
    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_REAUTHORIZATION_IDENTITY_MISMATCH',
      retryable: false
    })
    expect(vault.values.get('oauth.google.account-work-1.refresh-token'))
      .toBe('expired-test-credential')
    expect(state.sync).toEqual(expired)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('rejects a different stable Google subject even when the mailbox address matches', async () => {
    const vault = new MemoryVault()
    const state = new MemoryState()
    const invalidate = vi.fn()
    const service = new AccountReauthorizationService(
      authorization(account.displayIdentity.mailboxAddress, 'different-provider-subject'),
      vault,
      state,
      { invalidate }
    )

    await service.begin(request)
    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_REAUTHORIZATION_IDENTITY_MISMATCH',
      retryable: false
    })
    expect(vault.values.get('oauth.google.account-work-1.refresh-token'))
      .toBe('expired-test-credential')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refuses credential replacement when encrypted account state changes during authorization', async () => {
    const vault = new MemoryVault()
    const state = new MemoryState()
    const invalidate = vi.fn()
    const service = new AccountReauthorizationService(
      authorization(), vault, state, { invalidate }
    )

    await service.begin(request)
    state.sync = { ...expired, cursor: 'newer-encrypted-cursor' }
    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_REAUTHORIZATION_STATE_CHANGED',
      retryable: true
    })
    expect(vault.values.get('oauth.google.account-work-1.refresh-token'))
      .toBe('expired-test-credential')
    expect(state.sync.cursor).toBe('newer-encrypted-cursor')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refuses renewal unless the complete connection explicitly requires it', async () => {
    const vault = new MemoryVault()
    const state = new MemoryState()
    state.sync = { ...expired, status: 'idle', lastErrorCode: undefined }
    const auth = authorization()
    const begin = vi.spyOn(auth, 'begin')
    const service = new AccountReauthorizationService(
      auth, vault, state, { invalidate: vi.fn() }
    )

    await expect(service.begin(request)).rejects.toMatchObject({
      code: 'ACCOUNT_REAUTHORIZATION_NOT_REQUIRED'
    })
    expect(begin).not.toHaveBeenCalled()
  })
})
