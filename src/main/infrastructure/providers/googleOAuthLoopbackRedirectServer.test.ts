import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT, GOOGLE_CONNECT_SCOPES } from '../../../shared/contracts'
import { GOOGLE_AUTHORIZATION_SCOPES } from '../../application/accountAuthorization'
import { GoogleDesktopAccountAuthorizationAdapter } from './googleDesktopAccountAuthorizationAdapter'
import {
  GoogleOAuthLoopbackError,
  GoogleOAuthLoopbackRedirectServer
} from './googleOAuthLoopbackRedirectServer'

const sessionId = 'loopback_session_1'
const state = 'a'.repeat(43)
const servers: GoogleOAuthLoopbackRedirectServer[] = []

const createServer = (lifetimeMs?: number): GoogleOAuthLoopbackRedirectServer => {
  const server = new GoogleOAuthLoopbackRedirectServer(lifetimeMs)
  servers.push(server)
  return server
}

const requestStatusWithHost = (url: string, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: { host } }, (response) => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.once('error', reject)
    request.end()
  })

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.release(sessionId)))
})

describe('GoogleOAuthLoopbackRedirectServer', () => {
  it('binds an ephemeral IPv4 loopback port and delivers one exact state-bound callback', async () => {
    const server = createServer()
    const redirectUri = await server.prepare(sessionId, state)
    const waiting = server.nextCallback(sessionId)
    const callback = `${redirectUri}?code=authorization-code&state=${state}`
    const response = await fetch(callback, { redirect: 'error' })

    expect(new URL(redirectUri)).toMatchObject({
      protocol: 'http:',
      hostname: '127.0.0.1',
      pathname: '/oauth/google/callback'
    })
    expect(new URL(redirectUri).port).not.toBe('')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await response.text()).not.toContain('authorization-code')
    await expect(waiting).resolves.toBe(callback)
  })

  it('rejects wrong path, state, method, and host without consuming the valid callback', async () => {
    const server = createServer()
    const redirectUri = await server.prepare(sessionId, state)
    const waiting = server.nextCallback(sessionId)

    await expect(fetch(`${new URL(redirectUri).origin}/wrong?code=x&state=${state}`))
      .resolves.toMatchObject({ status: 400 })
    await expect(fetch(`${redirectUri}?code=x&state=${'b'.repeat(43)}`))
      .resolves.toMatchObject({ status: 400 })
    await expect(fetch(`${redirectUri}?code=x&state=${state}`, { method: 'POST' }))
      .resolves.toMatchObject({ status: 405 })
    await expect(requestStatusWithHost(
      `${redirectUri}?code=x&state=${state}`,
      'evil.example'
    )).resolves.toBe(400)

    const callback = `${redirectUri}?code=valid&state=${state}`
    await expect(fetch(callback)).resolves.toMatchObject({ status: 200 })
    await expect(waiting).resolves.toBe(callback)
  })

  it('queues one early callback and bounds additional unsolicited responses', async () => {
    const server = createServer()
    const redirectUri = await server.prepare(sessionId, state)
    const first = `${redirectUri}?code=first&state=${state}`
    const second = `${redirectUri}?code=second&state=${state}`

    await expect(fetch(first)).resolves.toMatchObject({ status: 200 })
    await expect(fetch(second)).resolves.toMatchObject({ status: 429 })
    await expect(server.nextCallback(sessionId)).resolves.toBe(first)
  })

  it('supports one cancellable waiter and idempotent session release', async () => {
    const server = createServer()
    await server.prepare(sessionId, state)
    const controller = new AbortController()
    const waiting = server.nextCallback(sessionId, controller.signal)
    controller.abort()

    await expect(waiting).rejects.toMatchObject({
      code: 'LOOPBACK_CALLBACK_CANCELLED',
      retryable: false
    })
    const releasedWait = server.nextCallback(sessionId)
    await server.release(sessionId)
    await expect(releasedWait).rejects.toMatchObject({ code: 'LOOPBACK_CALLBACK_CANCELLED' })
    await expect(server.release(sessionId)).resolves.toBeUndefined()
    await expect(server.nextCallback(sessionId)).rejects.toBeInstanceOf(GoogleOAuthLoopbackError)
  })

  it('expires the bounded listener and rejects a pending callback wait safely', async () => {
    vi.useFakeTimers()
    try {
      const server = createServer(1_000)
      await server.prepare(sessionId, state)
      const waiting = server.nextCallback(sessionId)
      const expiryExpectation = expect(waiting).rejects.toMatchObject({
        code: 'LOOPBACK_CALLBACK_EXPIRED',
        retryable: true
      })
      await vi.advanceTimersByTimeAsync(1_000)

      await expiryExpectation
      await expect(server.nextCallback(sessionId)).rejects.toMatchObject({
        code: 'LOOPBACK_SESSION_NOT_FOUND'
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('serializes listener ownership and refuses malformed session boundaries', async () => {
    const server = createServer()
    await server.prepare(sessionId, state)

    await expect(server.prepare('other_session', state)).rejects.toMatchObject({
      code: 'LOOPBACK_IN_PROGRESS'
    })
    await expect(server.release('other_session')).rejects.toMatchObject({
      code: 'LOOPBACK_SESSION_NOT_FOUND'
    })
    await expect(server.prepare('bad session', state)).rejects.toMatchObject({
      code: 'INVALID_LOOPBACK_REQUEST'
    })
  })

  it('integrates with the real protocol adapter without a browser, credential, or provider network', async () => {
    const listener = createServer()
    const responses = [
      new Response(JSON.stringify({
        access_token: 'deterministic-access-token',
        expires_in: 3_600,
        refresh_token: 'deterministic-refresh-token',
        scope: GOOGLE_CONNECT_SCOPES.join(' '),
        token_type: 'Bearer'
      }), { status: 200 }),
      new Response(JSON.stringify({
        sub: 'google-subject-123',
        email: 'owner@example.test',
        email_verified: true
      }), { status: 200 }),
      new Response(JSON.stringify({
        emailAddress: 'owner@example.test',
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: '100'
      }), { status: 200 })
    ]
    const fetchRequest = vi.fn(async () => responses.shift()!)
    const adapter = new GoogleDesktopAccountAuthorizationAdapter(
      '123456789-posita.apps.googleusercontent.com',
      listener,
      fetchRequest,
      { now: () => new Date('2026-09-02T12:00:00.000Z') },
      { bytes: (length) => new Uint8Array(length).fill(1) }
    )
    const launch = await adapter.begin({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      requestedScopes: GOOGLE_AUTHORIZATION_SCOPES
    })
    const callbackWait = listener.nextCallback(launch.sessionId)
    const launchState = new URL(launch.authorizationUrl).searchParams.get('state')!
    await fetch(`${new URL(launch.authorizationUrl).searchParams.get('redirect_uri')}?code=code&state=${launchState}`)
    const callbackUrl = await callbackWait

    await expect(adapter.complete({
      version: 1,
      sessionId: launch.sessionId,
      callbackUrl
    })).resolves.toMatchObject({
      providerAccountId: 'google-subject-123',
      mailboxAddress: 'owner@example.test'
    })
    expect(fetchRequest).toHaveBeenCalledTimes(3)
    await expect(listener.nextCallback(launch.sessionId)).rejects.toMatchObject({
      code: 'LOOPBACK_SESSION_NOT_FOUND'
    })
  })
})
