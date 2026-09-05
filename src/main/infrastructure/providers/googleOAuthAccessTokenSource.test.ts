import { describe, expect, it, vi } from 'vitest'
import type { SecretVault } from '../../application/secretVault'
import type { ProviderMailSyncStageEventV1 } from '../../application/providerMailSyncDiagnostics'
import {
  GoogleOAuthAccessTokenSource,
  type GoogleAccessTokenFetch
} from './googleOAuthAccessTokenSource'

const clientId = '123456789-posita.apps.googleusercontent.com'
const clientSecret = 'GOCSPX-deterministic-test-secret'
const configuration = { clientId, clientSecret }
const response = (status: number, body?: unknown): Response => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status }
)
const tokenResponse = (token = 'short-lived-access-token', expiresIn = 3_600): Response =>
  response(200, {
    access_token: token,
    expires_in: expiresIn,
    scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
    token_type: 'Bearer'
  })
const vault = (token: string | undefined): Pick<SecretVault, 'get'> => ({
  get: vi.fn(async () => token)
})
const signal = (): AbortSignal => new AbortController().signal

describe('GoogleOAuthAccessTokenSource', () => {
  it('returns absent when no protected refresh credential exists without network access', async () => {
    const secrets = vault(undefined)
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>()
    const source = new GoogleOAuthAccessTokenSource(secrets, configuration, fetchRequest)

    await expect(source.getAccessToken('account-work-1', signal())).resolves.toBeUndefined()
    expect(secrets.get).toHaveBeenCalledWith('oauth.google.account-work-1.refresh-token')
    expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('posts the protected refresh token only in the fixed form body and caches the access token', async () => {
    const secrets = vault('refresh token/+')
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>(async () => tokenResponse())
    const source = new GoogleOAuthAccessTokenSource(secrets, configuration, fetchRequest)

    await expect(source.getAccessToken('account-work-1', signal()))
      .resolves.toBe('short-lived-access-token')
    await expect(source.getAccessToken('account-work-1', signal()))
      .resolves.toBe('short-lived-access-token')

    expect(fetchRequest).toHaveBeenCalledOnce()
    const [url, init] = fetchRequest.mock.calls[0]!
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(url).not.toContain('refresh')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      },
      body: `client_id=${clientId}&client_secret=${clientSecret}` +
        '&refresh_token=refresh+token%2F%2B&grant_type=refresh_token',
      redirect: 'error'
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(secrets.get).toHaveBeenCalledOnce()
  })

  it('reports bounded refresh stages without provider payloads', async () => {
    const events: ProviderMailSyncStageEventV1[] = []
    const source = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'),
      configuration,
      async () => tokenResponse(),
      { now: () => new Date('2026-09-05T12:00:00.000Z') },
      15_000,
      { report: (event) => events.push(event) }
    )

    await expect(source.getAccessToken('account-work-1', signal()))
      .resolves.toBe('short-lived-access-token')
    expect(events.map(({ stage, phase }) => `${stage}:${phase}`)).toEqual([
      'credential-read:started',
      'credential-read:completed',
      'token-request:started',
      'token-request:completed',
      'token-response:started',
      'token-response:completed'
    ])
    expect(JSON.stringify(events)).not.toContain('test-refresh-token')
    expect(JSON.stringify(events)).not.toContain('short-lived-access-token')
  })

  it('accepts and discards the bounded OpenID ID token Google may return on refresh', async () => {
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>(async () => response(200, {
      access_token: 'short-lived-access-token',
      expires_in: 3_600,
      id_token: 'header.payload.signature',
      scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer'
    }))
    const source = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, fetchRequest
    )

    await expect(source.getAccessToken('account-work-1', signal()))
      .resolves.toBe('short-lived-access-token')
    await expect(source.getAccessToken('account-work-1', signal()))
      .resolves.toBe('short-lived-access-token')
    expect(fetchRequest).toHaveBeenCalledOnce()
  })

  it('refreshes inside the fixed expiry safety window', async () => {
    let now = new Date('2026-09-02T09:00:00.000Z')
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>()
      .mockResolvedValueOnce(tokenResponse('first-token', 120))
      .mockResolvedValueOnce(tokenResponse('second-token', 3_600))
    const source = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'),
      configuration,
      fetchRequest,
      { now: () => now }
    )

    await expect(source.getAccessToken('account-work-1', signal())).resolves.toBe('first-token')
    now = new Date('2026-09-02T09:01:00.000Z')
    await expect(source.getAccessToken('account-work-1', signal())).resolves.toBe('second-token')
    expect(fetchRequest).toHaveBeenCalledTimes(2)
  })

  it('shares one refresh per account while allowing one waiter to cancel independently', async () => {
    let finish: ((value: Response) => void) | undefined
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>(() => new Promise((resolve) => {
      finish = resolve
    }))
    const source = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, fetchRequest
    )
    const first = new AbortController()
    const second = new AbortController()
    const firstResult = source.getAccessToken('account-work-1', first.signal)
    const secondResult = source.getAccessToken('account-work-1', second.signal)

    first.abort()
    await expect(firstResult).rejects.toMatchObject({ name: 'AbortError' })
    finish?.(tokenResponse())
    await expect(secondResult).resolves.toBe('short-lived-access-token')
    expect(fetchRequest).toHaveBeenCalledOnce()
  })

  it('maps an invalid grant to reconnect-required authorization expiry', async () => {
    const source = new GoogleOAuthAccessTokenSource(
      vault('expired-refresh-token'),
      configuration,
      async () => response(400, { error: 'invalid_grant' })
    )

    await expect(source.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_AUTHORIZATION_EXPIRED',
      retryable: false,
      message: 'The Google authorization has expired.'
    })
  })

  it('returns stable failures for storage, transport, quota, and malformed success', async () => {
    const storage = new GoogleOAuthAccessTokenSource({
      get: async () => { throw new Error('private-storage-detail') }
    }, configuration)
    await expect(storage.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_STORAGE_FAILED',
      retryable: true
    })

    const offline = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration,
      async () => { throw new Error('private-network-detail') }
    )
    await expect(offline.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_PROVIDER_UNAVAILABLE',
      retryable: true
    })

    const quota = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, async () => response(429, { error: 'quota' })
    )
    await expect(quota.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_PROVIDER_UNAVAILABLE',
      retryable: true
    })

    const temporaryHtmlFailure = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration,
      async () => new Response('<html>temporary</html>', { status: 503 })
    )
    await expect(temporaryHtmlFailure.getAccessToken('account-work-1', signal()))
      .rejects.toMatchObject({
        code: 'ACCESS_TOKEN_PROVIDER_UNAVAILABLE',
        retryable: true
      })

    const malformed = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration,
      async () => response(200, { access_token: 'token', expires_in: '3600' })
    )
    await expect(malformed.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_RESPONSE_INVALID',
      retryable: false
    })
  })

  it('rejects scope widening and oversized responses', async () => {
    const widened = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, async () => response(200, {
        access_token: 'token',
        expires_in: 3_600,
        scope: 'https://www.googleapis.com/auth/gmail.modify',
        token_type: 'Bearer'
      })
    )
    await expect(widened.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_RESPONSE_INVALID',
      retryable: false
    })

    const oversized = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration,
      async () => new Response('x'.repeat(16 * 1024 + 1), { status: 200 })
    )
    await expect(oversized.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_RESPONSE_INVALID',
      retryable: false
    })

    const malformedIdToken = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, async () => response(200, {
        access_token: 'token',
        expires_in: 3_600,
        id_token: 'contains whitespace',
        token_type: 'Bearer'
      })
    )
    await expect(malformedIdToken.getAccessToken('account-work-1', signal()))
      .rejects.toMatchObject({
        code: 'ACCESS_TOKEN_RESPONSE_INVALID',
        retryable: false
      })

    const unknownField = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, async () => response(200, {
        access_token: 'token',
        expires_in: 3_600,
        unexpected: 'provider-detail',
        token_type: 'Bearer'
      })
    )
    await expect(unknownField.getAccessToken('account-work-1', signal()))
      .rejects.toMatchObject({
        code: 'ACCESS_TOKEN_RESPONSE_INVALID',
        retryable: false
      })
  })

  it('invalidates account cache and destroys all future use', async () => {
    const fetchRequest = vi.fn<GoogleAccessTokenFetch>()
      .mockResolvedValueOnce(tokenResponse('first-token'))
      .mockResolvedValueOnce(tokenResponse('second-token'))
    const source = new GoogleOAuthAccessTokenSource(
      vault('test-refresh-token'), configuration, fetchRequest
    )

    await expect(source.getAccessToken('account-work-1', signal())).resolves.toBe('first-token')
    source.invalidate('account-work-1')
    await expect(source.getAccessToken('account-work-1', signal())).resolves.toBe('second-token')
    source.destroy()
    source.destroy()
    await expect(source.getAccessToken('account-work-1', signal())).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN_REQUEST',
      retryable: false
    })
  })

  it('rejects invalid account and configuration boundaries before reading protected state', async () => {
    const secrets = vault('test-refresh-token')
    expect(() => new GoogleOAuthAccessTokenSource(secrets, {
      clientId: 'not-a-desktop-client-id',
      clientSecret
    })).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN_REQUEST' }))

    expect(() => new GoogleOAuthAccessTokenSource(secrets, {
      clientId,
      clientSecret: 'invalid secret'
    })).toThrow(expect.objectContaining({ code: 'INVALID_ACCESS_TOKEN_REQUEST' }))

    const source = new GoogleOAuthAccessTokenSource(secrets, configuration)
    await expect(source.getAccessToken('../work', signal())).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN_REQUEST'
    })
    expect(secrets.get).not.toHaveBeenCalled()
  })
})
