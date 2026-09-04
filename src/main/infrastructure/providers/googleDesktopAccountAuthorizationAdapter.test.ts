import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT, GOOGLE_CONNECT_SCOPES } from '../../../shared/contracts'
import {
  GOOGLE_AUTHORIZATION_SCOPES,
  type BeginAccountAuthorizationRequestV1
} from '../../application/accountAuthorization'
import {
  GoogleDesktopAccountAuthorizationAdapter,
  type GoogleAccountAuthorizationFetch
} from './googleDesktopAccountAuthorizationAdapter'
import type { GoogleOAuthRedirectUriSource } from './googleOAuthLoopbackRedirectServer'

const clientId = '123456789-posita.apps.googleusercontent.com'
const redirectUri = 'http://127.0.0.1:49152/oauth/google/callback'
const request: BeginAccountAuthorizationRequestV1 = {
  version: 1,
  accountId: 'account-work-1',
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_AUTHORIZATION_SCOPES
}
const response = (status: number, value?: unknown): Response => new Response(
  value === undefined ? null : JSON.stringify(value),
  { status }
)
const tokenGrant = (scope = GOOGLE_CONNECT_SCOPES.join(' ')): Response => response(200, {
  access_token: 'deterministic-access-token',
  expires_in: 3_600,
  refresh_token: 'deterministic-refresh-token',
  scope,
  token_type: 'Bearer',
  id_token: 'header.payload.signature'
})
const identity = (email = 'owner.work@example.test'): Response => response(200, {
  sub: 'google-subject-123',
  email,
  email_verified: true
})
const profile = (email = 'owner.work@example.test'): Response => response(200, {
  emailAddress: email,
  messagesTotal: 10,
  threadsTotal: 8,
  historyId: '100'
})

const createRedirects = (prepared = redirectUri): GoogleOAuthRedirectUriSource => ({
  prepare: vi.fn(async () => prepared),
  release: vi.fn(async () => undefined)
})

const createHarness = (
  responses: Response[] = [tokenGrant(), identity(), profile()],
  prepared = redirectUri
) => {
  let now = new Date('2026-09-02T12:00:00.000Z')
  let randomCall = 0
  const calls: Array<[string, Parameters<GoogleAccountAuthorizationFetch>[1]]> = []
  const fetchRequest: GoogleAccountAuthorizationFetch = vi.fn(async (url, init) => {
    calls.push([url, init])
    const next = responses.shift()
    if (next === undefined) throw new Error('Unexpected deterministic HTTP request')
    return next
  })
  const redirects = createRedirects(prepared)
  const adapter = new GoogleDesktopAccountAuthorizationAdapter(
    clientId,
    redirects,
    fetchRequest,
    { now: () => now },
    { bytes: (length) => new Uint8Array(length).fill(++randomCall) }
  )
  return {
    adapter,
    redirects,
    calls,
    advanceTo: (value: string): void => { now = new Date(value) }
  }
}

const callbackFor = (authorizationUrl: string, code = 'authorization-code'): string => {
  const state = new URL(authorizationUrl).searchParams.get('state')
  if (state === null) throw new Error('Missing deterministic state')
  return `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
}

describe('GoogleDesktopAccountAuthorizationAdapter', () => {
  it('builds one exact desktop authorization request with S256 PKCE and reviewed scopes', async () => {
    const { adapter, redirects } = createHarness()
    const launch = await adapter.begin(request)
    const url = new URL(launch.authorizationUrl)

    expect(launch).toMatchObject({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      consentVersion: 'google-gmail-readonly-identity-v2',
      expiresAt: '2026-09-02T12:05:00.000Z'
    })
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CONNECT_SCOPES.join(' '),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent'
    })
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.search).not.toContain('verifier')
    expect(redirects.prepare).toHaveBeenCalledWith(
      launch.sessionId,
      url.searchParams.get('state')
    )
  })

  it('exchanges a verified callback and returns only the trusted grant', async () => {
    const { adapter, redirects, calls } = createHarness([
      tokenGrant('email https://www.googleapis.com/auth/gmail.readonly openid'),
      identity(),
      profile()
    ])
    const launch = await adapter.begin(request)
    const grant = await adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl, 'code-/+')
    })

    expect(grant).toEqual({
      version: 2,
      sessionId: launch.sessionId,
      accountId: 'account-work-1',
      provider: 'google',
      providerAccountId: 'google-subject-123',
      mailboxAddress: 'owner.work@example.test',
      consentVersion: 'google-gmail-readonly-identity-v2',
      connectedAt: '2026-09-02T12:00:00.000Z',
      refreshToken: 'deterministic-refresh-token'
    })
    expect(calls.map(([url]) => url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://openidconnect.googleapis.com/v1/userinfo',
      'https://gmail.googleapis.com/gmail/v1/users/me/profile'
    ])
    expect(calls[0]?.[1].body).toContain('code=code-%2F%2B')
    expect(calls[0]?.[1].body).toContain('code_verifier=')
    expect(calls[0]?.[1].body).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`)
    expect(calls[0]?.[0]).not.toContain('code')
    expect(calls[1]?.[1].headers).toEqual({
      authorization: 'Bearer deterministic-access-token',
      accept: 'application/json'
    })
    expect(redirects.release).toHaveBeenCalledWith(launch.sessionId)
  })

  it('accepts bounded Google callback metadata without trusting it as the grant', async () => {
    const { adapter, calls } = createHarness([
      tokenGrant(
        'email https://www.googleapis.com/auth/userinfo.email openid ' +
        'https://www.googleapis.com/auth/gmail.readonly'
      ),
      identity(),
      profile()
    ])
    const launch = await adapter.begin(request)
    const callback = new URL(callbackFor(launch.authorizationUrl))
    callback.searchParams.set('iss', 'https://accounts.google.com')
    callback.searchParams.set(
      'scope',
      'email https://www.googleapis.com/auth/userinfo.email openid ' +
      'https://www.googleapis.com/auth/gmail.readonly'
    )
    callback.searchParams.set('authuser', '0')
    callback.searchParams.set('hd', 'example.test')
    callback.searchParams.set('prompt', 'consent')

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callback.toString()
    })).resolves.toMatchObject({
      providerAccountId: 'google-subject-123',
      mailboxAddress: 'owner.work@example.test'
    })
    expect(calls).toHaveLength(3)
  })

  it('accepts a standards-compliant token response with omitted scope and bounded refresh expiry', async () => {
    const { adapter } = createHarness([
      response(200, {
        access_token: 'deterministic-access-token',
        expires_in: 3_600,
        refresh_token: 'deterministic-refresh-token',
        refresh_token_expires_in: 604_800,
        token_type: 'Bearer',
        id_token: 'header.payload.signature'
      }),
      identity(),
      profile()
    ])
    const launch = await adapter.begin(request)

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    })).resolves.toMatchObject({ providerAccountId: 'google-subject-123' })
  })

  it('rejects unknown, duplicated, or widened Google callback metadata', async () => {
    const { adapter, calls } = createHarness()
    const launch = await adapter.begin(request)
    const base = callbackFor(launch.authorizationUrl)

    for (const query of [
      '&unexpected=value',
      '&iss=https%3A%2F%2Faccounts.google.com&iss=https%3A%2F%2Faccounts.google.com',
      '&scope=openid%20email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify'
    ]) {
      await expect(adapter.complete({
        version: 1,
        sessionId: launch.sessionId,
        callbackUrl: `${base}${query}`
      })).rejects.toMatchObject({ code: 'AUTHORIZATION_CALLBACK_REJECTED' })
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects a wrong state or callback origin without consuming the valid session', async () => {
    const { adapter, calls } = createHarness()
    const launch = await adapter.begin(request)

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: `${redirectUri}?code=code&state=wrong`
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_CALLBACK_REJECTED' })
    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl).replace('127.0.0.1', 'localhost')
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_CALLBACK_REJECTED' })
    expect(calls).toHaveLength(0)

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    })).resolves.toMatchObject({ providerAccountId: 'google-subject-123' })
  })

  it('consumes a verified user denial and releases the redirect boundary', async () => {
    const { adapter, redirects, calls } = createHarness()
    const launch = await adapter.begin(request)
    const state = new URL(launch.authorizationUrl).searchParams.get('state')!

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: `${redirectUri}?error=access_denied&state=${state}`
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_DECLINED',
      retryable: false
    })
    expect(calls).toHaveLength(0)
    expect(redirects.release).toHaveBeenCalledWith(launch.sessionId)
    await expect(adapter.cancel(launch.sessionId)).resolves.toBe(false)
  })

  it('expires at the exact boundary before any token exchange', async () => {
    const { adapter, redirects, calls, advanceTo } = createHarness()
    const launch = await adapter.begin(request)
    advanceTo('2026-09-02T12:05:00.000Z')

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_SESSION_EXPIRED', retryable: true })
    expect(calls).toHaveLength(0)
    expect(redirects.release).toHaveBeenCalledWith(launch.sessionId)
  })

  it('fails closed on widened scopes and mismatched verified mailbox identity', async () => {
    const widened = createHarness([
      tokenGrant('openid email https://www.googleapis.com/auth/gmail.modify')
    ])
    const widenedLaunch = await widened.adapter.begin(request)
    await expect(widened.adapter.complete({
      version: 1,
      sessionId: widenedLaunch.sessionId,
      callbackUrl: callbackFor(widenedLaunch.authorizationUrl)
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_RESTART_REQUIRED', retryable: false })

    const mismatch = createHarness([tokenGrant(), identity('first@example.test'),
      profile('second@example.test')])
    const mismatchLaunch = await mismatch.adapter.begin(request)
    await expect(mismatch.adapter.complete({
      version: 1,
      sessionId: mismatchLaunch.sessionId,
      callbackUrl: callbackFor(mismatchLaunch.authorizationUrl)
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_RESTART_REQUIRED', retryable: false })
  })

  it('classifies a temporary token-service failure without provider detail', async () => {
    const { adapter } = createHarness([response(503, 'private-provider-detail')])
    const launch = await adapter.begin(request)
    const completion = {
      version: 1 as const,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    }

    await expect(adapter.complete(completion)).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: true,
      message: 'Google\'s token service is temporarily unavailable. Start again.'
    })
    await expect(adapter.complete(completion)).rejects.toMatchObject({
      code: 'AUTHORIZATION_SESSION_NOT_FOUND'
    })
  })

  it('surfaces only an allow-listed token-exchange failure kind', async () => {
    const { adapter } = createHarness([response(400, {
      error: 'invalid_grant',
      error_description: 'private-provider-detail-must-not-surface'
    })])
    const launch = await adapter.begin(request)

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: false,
      message: 'Google rejected the one-time authorization grant. Start again.'
    })
  })

  it('maps a recognized invalid-request parameter to fixed non-reflective copy', async () => {
    const { adapter } = createHarness([response(400, {
      error: 'invalid_request',
      error_description: 'Missing required parameter: client_secret; private suffix'
    })])
    const launch = await adapter.begin(request)

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl: callbackFor(launch.authorizationUrl)
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: false,
      message: 'Google reports that Posita\'s client-secret configuration is incomplete.'
    })
  })

  it('classifies identity and Gmail profile verification failures without provider detail', async () => {
    const invalidIdentity = createHarness([
      tokenGrant(),
      response(200, { private_provider_detail: 'must-not-surface' })
    ])
    const identityLaunch = await invalidIdentity.adapter.begin(request)
    await expect(invalidIdentity.adapter.complete({
      version: 1,
      sessionId: identityLaunch.sessionId,
      callbackUrl: callbackFor(identityLaunch.authorizationUrl)
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: false,
      message: 'The Google identity response could not be verified. Start again.'
    })

    const invalidProfile = createHarness([
      tokenGrant(),
      identity(),
      response(200, { private_provider_detail: 'must-not-surface' })
    ])
    const profileLaunch = await invalidProfile.adapter.begin(request)
    await expect(invalidProfile.adapter.complete({
      version: 1,
      sessionId: profileLaunch.sessionId,
      callbackUrl: callbackFor(profileLaunch.authorizationUrl)
    })).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: false,
      message: 'The Gmail profile response could not be verified. Start again.'
    })
  })

  it('cancels one pending session and refuses malformed redirect or request boundaries', async () => {
    const { adapter, redirects } = createHarness()
    const launch = await adapter.begin(request)
    await expect(adapter.cancel(launch.sessionId)).resolves.toBe(true)
    await expect(adapter.cancel(launch.sessionId)).resolves.toBe(false)
    expect(redirects.release).toHaveBeenCalledWith(launch.sessionId)

    expect(() => new GoogleDesktopAccountAuthorizationAdapter(
      'invalid-client', createRedirects()
    )).toThrow(expect.objectContaining({ code: 'INVALID_AUTHORIZATION_REQUEST' }))

    const invalidRedirect = createHarness([], 'http://localhost:49152/oauth/google/callback')
    await expect(invalidRedirect.adapter.begin(request)).rejects.toMatchObject({
      code: 'INVALID_AUTHORIZATION_REQUEST'
    })
    expect(invalidRedirect.redirects.release).toHaveBeenCalledOnce()

    const fresh = createHarness()
    await expect(fresh.adapter.begin({
      ...request,
      requestedScopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify']
    } as unknown as BeginAccountAuthorizationRequestV1)).rejects.toMatchObject({
      code: 'INVALID_AUTHORIZATION_REQUEST'
    })
    expect(fresh.redirects.prepare).not.toHaveBeenCalled()
  })

  it('bounds provider response data and rejects unverified identity', async () => {
    const oversized = createHarness([
      new Response('x'.repeat(32 * 1024 + 1), { status: 200 })
    ])
    const oversizedLaunch = await oversized.adapter.begin(request)
    await expect(oversized.adapter.complete({
      version: 1,
      sessionId: oversizedLaunch.sessionId,
      callbackUrl: callbackFor(oversizedLaunch.authorizationUrl)
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_RESTART_REQUIRED', retryable: false })

    const unverified = createHarness([tokenGrant(), response(200, {
      sub: 'google-subject-123',
      email: 'owner.work@example.test',
      email_verified: false
    })])
    const unverifiedLaunch = await unverified.adapter.begin(request)
    await expect(unverified.adapter.complete({
      version: 1,
      sessionId: unverifiedLaunch.sessionId,
      callbackUrl: callbackFor(unverifiedLaunch.authorizationUrl)
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_RESTART_REQUIRED', retryable: false })
  })
})
