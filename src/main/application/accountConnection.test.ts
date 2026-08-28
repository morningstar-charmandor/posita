import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import {
  GOOGLE_READONLY_SCOPES,
  type AccountAuthorizationAdapter,
  type AuthorizedAccountGrantV1,
  type BeginAccountAuthorizationRequestV1
} from './accountAuthorization'
import {
  AccountConnectionError,
  AccountConnectionService,
  isAccountConnectionConsistencyV1
} from './accountConnection'
import type {
  AccountStateRepository,
  ProviderAccountRecordV1,
  ProviderSyncStateV1
} from './accountState'
import type { SecretName, SecretVault } from './secretVault'
import { DeterministicFakeAccountAuthorizationAdapter } from '../infrastructure/providers/deterministicFakeAccountAuthorizationAdapter'

const request: BeginAccountAuthorizationRequestV1 = {
  version: 1,
  accountId: 'account-work-1',
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_READONLY_SCOPES
}

class MemoryVault implements SecretVault {
  readonly values = new Map<SecretName, string>()
  failSet = false
  failDelete = false

  constructor(readonly events: string[] = []) {}

  async set(name: SecretName, value: string): Promise<void> {
    this.events.push('vault:set')
    if (this.failSet) throw new Error('unsafe test-only set failure')
    this.values.set(name, value)
  }

  async get(name: SecretName): Promise<string | undefined> {
    this.events.push('vault:get')
    return this.values.get(name)
  }

  async has(name: SecretName): Promise<boolean> {
    this.events.push('vault:has')
    return this.values.has(name)
  }

  async delete(name: SecretName): Promise<boolean> {
    this.events.push('vault:delete')
    if (this.failDelete) throw new Error('unsafe test-only delete failure')
    return this.values.delete(name)
  }

  async deleteGoogleRefreshTokens(): Promise<number> {
    return 0
  }
}

class MemoryAccountState implements AccountStateRepository {
  readonly accounts = new Map<string, ProviderAccountRecordV1>()
  failSaveAfterWrite = false

  constructor(readonly events: string[] = []) {}

  saveProviderAccount(record: ProviderAccountRecordV1): void {
    this.events.push('state:save')
    this.accounts.set(record.accountId, record)
    if (this.failSaveAfterWrite) throw new Error('unsafe test-only state failure')
  }

  hasProviderAccount(accountId: string): boolean {
    this.events.push('state:has')
    return this.accounts.has(accountId)
  }

  loadProviderAccount(accountId: string): ProviderAccountRecordV1 | undefined {
    this.events.push('state:load')
    return this.accounts.get(accountId)
  }

  saveSyncState(_state: ProviderSyncStateV1): void {}
  loadSyncState(_accountId: string): ProviderSyncStateV1 | undefined { return undefined }

  deleteAccountState(accountId: string): boolean {
    this.events.push('state:delete')
    return this.accounts.delete(accountId)
  }

  deleteAllAccountState(): boolean {
    const changed = this.accounts.size > 0
    this.accounts.clear()
    return changed
  }
}

const createAuthorization = (): DeterministicFakeAccountAuthorizationAdapter =>
  new DeterministicFakeAccountAuthorizationAdapter(
    {
      authorizationUrl: 'https://accounts.example.invalid/authorize?fixture=readonly',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified',
      providerAccountId: 'provider-subject-fixture-1',
      refreshToken: 'deterministic-test-refresh-credential',
      sessionLifetimeMs: 5 * 60 * 1000
    },
    { now: () => new Date('2026-08-28T07:00:00.000Z') },
    () => 'authorization-session-1'
  )

const createHarness = () => {
  const authorization = createAuthorization()
  const events: string[] = []
  const vault = new MemoryVault(events)
  const state = new MemoryAccountState(events)
  return {
    authorization,
    vault,
    state,
    service: new AccountConnectionService(authorization, vault, state)
  }
}

const completeRequest = {
  version: 1 as const,
  sessionId: 'authorization-session-1',
  callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
}

describe('AccountConnectionService', () => {
  it('diagnoses every account-connection consistency state without mutation', async () => {
    const absent = createHarness()
    await expect(absent.service.inspect(request.accountId)).resolves.toEqual({
      version: 1,
      accountId: request.accountId,
      status: 'absent'
    })

    const credentialOnly = createHarness()
    credentialOnly.vault.values.set(
      'oauth.google.account-work-1.refresh-token',
      'orphaned-test-credential'
    )
    await expect(credentialOnly.service.inspect(request.accountId)).resolves.toMatchObject({
      status: 'credential-only'
    })

    const providerStateOnly = createHarness()
    providerStateOnly.state.accounts.set(request.accountId, {
      version: 1,
      accountId: request.accountId,
      provider: 'google',
      providerAccountId: 'provider-subject-fixture-1',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-28T07:00:00.000Z'
    })
    await expect(providerStateOnly.service.inspect(request.accountId)).resolves.toMatchObject({
      status: 'provider-state-only'
    })

    providerStateOnly.vault.values.set(
      'oauth.google.account-work-1.refresh-token',
      'deterministic-test-refresh-credential'
    )
    const connected = await providerStateOnly.service.inspect(request.accountId)
    expect(connected).toEqual({
      version: 1,
      accountId: request.accountId,
      status: 'connected'
    })
    expect(isAccountConnectionConsistencyV1(connected)).toBe(true)
    expect(providerStateOnly.vault.values.size).toBe(1)
    expect(providerStateOnly.state.accounts.size).toBe(1)
  })

  it('rejects malformed consistency queries before reading either store', async () => {
    const { service, vault, state } = createHarness()

    await expect(service.inspect('../not-an-account')).rejects.toMatchObject({
      code: 'INVALID_ACCOUNT_CONNECTION_REQUEST',
      retryable: false
    })
    expect(vault.events).toEqual([])
    expect(state.events).toEqual([])
  })

  it('validates consistency results as exact bounded objects', () => {
    expect(isAccountConnectionConsistencyV1({
      version: 1,
      accountId: request.accountId,
      status: 'credential-only'
    })).toBe(true)
    expect(isAccountConnectionConsistencyV1({
      version: 1,
      accountId: request.accountId,
      status: 'credential-only',
      credential: 'must-not-be-exposed'
    })).toBe(false)
  })

  it('stores the refresh credential before encrypted provider-account state', async () => {
    const { service, vault, state } = createHarness()
    await service.begin(request)

    await expect(service.complete(completeRequest)).resolves.toEqual({
      version: 1,
      accountId: request.accountId,
      provider: 'google',
      providerAccountId: 'provider-subject-fixture-1',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-28T07:00:00.000Z'
    })

    expect(vault.values.get('oauth.google.account-work-1.refresh-token'))
      .toBe('deterministic-test-refresh-credential')
    expect(state.accounts.get(request.accountId)?.providerAccountId)
      .toBe('provider-subject-fixture-1')
    expect(vault.events.indexOf('vault:set')).toBeLessThan(state.events.indexOf('state:save'))
  })

  it('refuses an already connected or inconsistent account before authorization', async () => {
    const connected = createHarness()
    connected.state.accounts.set(request.accountId, {
      version: 1,
      accountId: request.accountId,
      provider: 'google',
      providerAccountId: 'existing-provider-subject',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-27T07:00:00.000Z'
    })
    connected.vault.values.set(
      'oauth.google.account-work-1.refresh-token',
      'existing-test-credential'
    )
    await expect(connected.service.begin(request)).rejects.toMatchObject({
      code: 'ACCOUNT_ALREADY_CONNECTED'
    })

    const inconsistent = createHarness()
    inconsistent.vault.values.set(
      'oauth.google.account-work-1.refresh-token',
      'orphaned-test-credential'
    )
    await expect(inconsistent.service.begin(request)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_RECOVERY_REQUIRED'
    })
  })

  it('rejects invalid connection input before reading credential or account state', async () => {
    const { service, vault, state } = createHarness()

    await expect(service.begin({
      ...request,
      requestedScopes: ['gmail.modify']
    } as unknown as BeginAccountAuthorizationRequestV1)).rejects.toMatchObject({
      code: 'INVALID_AUTHORIZATION_REQUEST'
    })
    expect(vault.events).toEqual([])
    expect(state.events).toEqual([])
  })

  it('leaves no provider state when credential persistence fails', async () => {
    const { service, vault, state } = createHarness()
    await service.begin(request)
    vault.failSet = true

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'CREDENTIAL_STORAGE_FAILED',
      retryable: true
    })
    expect(state.accounts.size).toBe(0)
    expect(vault.values.size).toBe(0)
  })

  it('rolls back an ambiguous provider-state write and its credential', async () => {
    const { service, vault, state } = createHarness()
    await service.begin(request)
    state.failSaveAfterWrite = true

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_STATE_STORAGE_FAILED',
      retryable: true
    })
    expect(state.accounts.size).toBe(0)
    expect(vault.values.size).toBe(0)
    expect(state.events).toContain('state:delete')
    expect(vault.events).toContain('vault:delete')
  })

  it('reports recovery when rollback cannot remove the stored credential', async () => {
    const { service, vault, state } = createHarness()
    await service.begin(request)
    state.failSaveAfterWrite = true
    vault.failDelete = true

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'ACCOUNT_CONNECTION_ROLLBACK_FAILED',
      retryable: false
    })
    expect(state.accounts.size).toBe(0)
    expect(vault.values.size).toBe(1)
  })

  it('keeps a retryable provider failure pending and then completes safely', async () => {
    const { service, authorization } = createHarness()
    await service.begin(request)
    authorization.failNext('complete')

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'AUTHORIZATION_PROVIDER_UNAVAILABLE',
      retryable: true
    })
    await expect(service.complete(completeRequest)).resolves.toMatchObject({
      accountId: request.accountId
    })
  })

  it('rejects a mismatched provider grant without storing it', async () => {
    const real = createAuthorization()
    const authorization: AccountAuthorizationAdapter = {
      begin: (value) => real.begin(value),
      cancel: (sessionId) => real.cancel(sessionId),
      complete: async (value): Promise<AuthorizedAccountGrantV1> => ({
        ...await real.complete(value),
        accountId: 'account-attacker-1'
      })
    }
    const vault = new MemoryVault()
    const state = new MemoryAccountState()
    const service = new AccountConnectionService(authorization, vault, state)
    await service.begin(request)

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESULT_INVALID'
    })
    expect(vault.values.size).toBe(0)
    expect(state.accounts.size).toBe(0)
  })

  it('maps an untyped provider failure to a stable safe result error', async () => {
    const real = createAuthorization()
    const authorization: AccountAuthorizationAdapter = {
      begin: (value) => real.begin(value),
      cancel: (sessionId) => real.cancel(sessionId),
      complete: async () => { throw new Error('unsafe provider response detail') }
    }
    const service = new AccountConnectionService(
      authorization,
      new MemoryVault(),
      new MemoryAccountState()
    )
    await service.begin(request)

    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESULT_INVALID',
      message: 'The authorization provider returned an invalid result.',
      retryable: false
    })
    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'AUTHORIZATION_SESSION_NOT_FOUND'
    })
  })

  it('cancels only through the authorization owner and releases local session state', async () => {
    const { service } = createHarness()
    const launch = await service.begin(request)

    await expect(service.cancel(launch.sessionId)).resolves.toBe(true)
    await expect(service.complete(completeRequest)).rejects.toMatchObject({
      code: 'AUTHORIZATION_SESSION_NOT_FOUND'
    })
  })

  it('returns only stable safe connection errors', () => {
    const error = new AccountConnectionError(
      'ACCOUNT_CONNECTION_RECOVERY_REQUIRED',
      'Incomplete account connection state requires recovery.',
      false
    )
    expect(error).toMatchObject({
      name: 'AccountConnectionError',
      code: 'ACCOUNT_CONNECTION_RECOVERY_REQUIRED',
      retryable: false
    })
  })
})
