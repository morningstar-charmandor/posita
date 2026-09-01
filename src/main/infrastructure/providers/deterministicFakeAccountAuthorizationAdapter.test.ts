import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../../shared/contracts'
import {
  AccountAuthorizationError,
  GOOGLE_READONLY_SCOPES,
  isAccountAuthorizationLaunchV1,
  isAuthorizedAccountGrantV2,
  isCompleteAccountAuthorizationRequestV1,
  type BeginAccountAuthorizationRequestV1
} from '../../application/accountAuthorization'
import { DeterministicFakeAccountAuthorizationAdapter } from './deterministicFakeAccountAuthorizationAdapter'

const request: BeginAccountAuthorizationRequestV1 = {
  version: 1,
  accountId: 'account-work-1',
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_READONLY_SCOPES
}

const createHarness = () => {
  let now = new Date('2026-08-28T07:00:00.000Z')
  const adapter = new DeterministicFakeAccountAuthorizationAdapter(
    {
      authorizationUrl: 'https://accounts.example.invalid/authorize?fixture=readonly',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified',
      providerAccountId: 'provider-subject-fixture-1',
      mailboxAddress: 'owner.work@example.test',
      refreshToken: 'deterministic-test-refresh-credential',
      sessionLifetimeMs: 5 * 60 * 1000
    },
    { now: () => now },
    () => 'authorization-session-1'
  )
  return {
    adapter,
    advanceTo: (value: string): void => { now = new Date(value) }
  }
}

describe('DeterministicFakeAccountAuthorizationAdapter', () => {
  it('starts and completes one exact read-only authorization session', async () => {
    const { adapter } = createHarness()

    await expect(adapter.begin(request)).resolves.toEqual({
      version: 1,
      sessionId: 'authorization-session-1',
      accountId: request.accountId,
      provider: 'google',
      consentVersion: 'google-gmail-readonly-v1',
      authorizationUrl: 'https://accounts.example.invalid/authorize?fixture=readonly',
      expiresAt: '2026-08-28T07:05:00.000Z'
    })
    const grant = await adapter.complete({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
    })

    expect(isAuthorizedAccountGrantV2(grant)).toBe(true)
    expect(grant).toMatchObject({
      accountId: request.accountId,
      providerAccountId: 'provider-subject-fixture-1',
      mailboxAddress: 'owner.work@example.test',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
    })
    expect(isAuthorizedAccountGrantV2({
      ...grant,
      mailboxAddress: 'not-a-mailbox'
    })).toBe(false)
  })

  it('rejects scope widening and unknown request fields before creating a session', async () => {
    const { adapter } = createHarness()

    await expect(adapter.begin({
      ...request,
      requestedScopes: ['gmail.modify']
    } as unknown as BeginAccountAuthorizationRequestV1)).rejects.toMatchObject({
      code: 'INVALID_AUTHORIZATION_REQUEST',
      retryable: false
    })
    await expect(adapter.begin({
      ...request,
      redirectUrl: 'https://attacker.invalid'
    } as unknown as BeginAccountAuthorizationRequestV1)).rejects.toBeInstanceOf(
      AccountAuthorizationError
    )
  })

  it('rejects insecure launch targets and non-loopback callbacks', () => {
    expect(isAccountAuthorizationLaunchV1({
      version: 1,
      sessionId: 'authorization-session-1',
      accountId: request.accountId,
      provider: 'google',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      authorizationUrl: 'http://accounts.example.invalid/authorize',
      expiresAt: '2026-08-28T07:05:00.000Z'
    })).toBe(false)
    expect(isCompleteAccountAuthorizationRequestV1({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'https://callback.example.invalid/receive?code=fixture'
    })).toBe(false)
  })

  it('allows only one pending session and releases it after cancellation', async () => {
    const { adapter } = createHarness()
    await adapter.begin(request)

    await expect(adapter.begin(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_IN_PROGRESS'
    })
    await expect(adapter.cancel('authorization-session-1')).resolves.toBe(true)
    await expect(adapter.cancel('authorization-session-1')).resolves.toBe(false)
    await expect(adapter.begin(request)).resolves.toMatchObject({
      sessionId: 'authorization-session-1'
    })
  })

  it('rejects an unverified loopback callback without consuming the session', async () => {
    const { adapter } = createHarness()
    await adapter.begin(request)

    await expect(adapter.complete({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=wrong'
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_CALLBACK_REJECTED',
      retryable: false
    })
    await expect(adapter.complete({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
    })).resolves.toMatchObject({ accountId: request.accountId })
  })

  it('expires at the exact boundary and consumes the stale session', async () => {
    const { adapter, advanceTo } = createHarness()
    await adapter.begin(request)
    advanceTo('2026-08-28T07:05:00.000Z')

    await expect(adapter.complete({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_SESSION_EXPIRED',
      retryable: true
    })
    await expect(adapter.cancel('authorization-session-1')).resolves.toBe(false)
  })

  it('surfaces a safe retryable provider failure without losing the session', async () => {
    const { adapter } = createHarness()
    await adapter.begin(request)
    adapter.failNext('complete')

    await expect(adapter.complete({
      version: 1,
      sessionId: 'authorization-session-1',
      callbackUrl: 'http://127.0.0.1:49152/callback?code=fixture&state=verified'
    })).rejects.toEqual(expect.objectContaining({
      code: 'AUTHORIZATION_PROVIDER_UNAVAILABLE',
      retryable: true,
      message: 'The authorization provider is temporarily unavailable.'
    }))
    await expect(adapter.cancel('authorization-session-1')).resolves.toBe(true)
  })
})
