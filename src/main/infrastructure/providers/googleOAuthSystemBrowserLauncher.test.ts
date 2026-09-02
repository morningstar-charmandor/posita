import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_SCOPES } from '../../../shared/contracts'
import {
  GoogleOAuthBrowserLaunchError,
  GoogleOAuthSystemBrowserLauncher
} from './googleOAuthSystemBrowserLauncher'

const clientId = '123456789-posita.apps.googleusercontent.com'
const redirectUri = 'http://127.0.0.1:49152/oauth/google/callback'

const authorizationUrl = (): string => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CONNECT_SCOPES.join(' '),
    state: 'a'.repeat(43),
    code_challenge: 'b'.repeat(43),
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent'
  }).toString()
  return url.toString()
}

describe('GoogleOAuthSystemBrowserLauncher', () => {
  it('delegates only the exact reviewed Google authorization URL', async () => {
    const openExternal = vi.fn(async () => undefined)
    const launcher = new GoogleOAuthSystemBrowserLauncher(clientId, openExternal)
    const url = authorizationUrl()

    await expect(launcher.open(url)).resolves.toBeUndefined()
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url, { activate: true })
  })

  it.each([
    ['untrusted origin', (url: URL) => { url.hostname = 'evil.example' }],
    ['unexpected HTTPS port', (url: URL) => { url.port = '444' }],
    ['widened scope', (url: URL) => { url.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/gmail.modify') }],
    ['localhost redirect alias', (url: URL) => { url.searchParams.set('redirect_uri', redirectUri.replace('127.0.0.1', 'localhost')) }],
    ['extra parameter', (url: URL) => { url.searchParams.set('continue', 'file:///private/path') }],
    ['duplicate state', (url: URL) => { url.searchParams.append('state', 'c'.repeat(43)) }],
    ['missing PKCE', (url: URL) => { url.searchParams.delete('code_challenge') }]
  ])('refuses %s before invoking the system boundary', async (_label, mutate) => {
    const openExternal = vi.fn(async () => undefined)
    const launcher = new GoogleOAuthSystemBrowserLauncher(clientId, openExternal)
    const candidate = new URL(authorizationUrl())
    mutate(candidate)

    await expect(launcher.open(candidate.toString())).rejects.toMatchObject({
      code: 'INVALID_AUTHORIZATION_URL',
      retryable: false
    })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('maps a desktop handoff failure to one stable redacted error', async () => {
    const launcher = new GoogleOAuthSystemBrowserLauncher(
      clientId,
      vi.fn(async () => { throw new Error('/private/browser-detail') })
    )

    await expect(launcher.open(authorizationUrl())).rejects.toEqual(expect.objectContaining({
      name: 'GoogleOAuthBrowserLaunchError',
      code: 'BROWSER_LAUNCH_FAILED',
      message: 'Posita could not ask the system browser to open Google authorization.',
      retryable: true
    }))
    await expect(launcher.open('file:///private/path')).rejects.toBeInstanceOf(
      GoogleOAuthBrowserLaunchError
    )
  })
})
