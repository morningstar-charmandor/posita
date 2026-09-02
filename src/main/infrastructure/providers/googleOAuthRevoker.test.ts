import { describe, expect, it, vi } from 'vitest'
import type { SecretVault } from '../../application/secretVault'
import {
  GoogleOAuthRevoker,
  type GoogleOAuthFetch
} from './googleOAuthRevoker'

const vault = (token: string | undefined): Pick<SecretVault, 'get'> => ({
  get: vi.fn(async () => token)
})

const response = (status: number, body?: unknown): Response => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status }
)

describe('GoogleOAuthRevoker', () => {
  it('treats an absent local grant as an idempotent success without network access', async () => {
    const fetchRequest = vi.fn<GoogleOAuthFetch>()
    const secrets = vault(undefined)
    const revoker = new GoogleOAuthRevoker(secrets, fetchRequest)

    await expect(revoker.revoke('account-work-1')).resolves.toBeUndefined()
    expect(secrets.get).toHaveBeenCalledWith('oauth.google.account-work-1.refresh-token')
    expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('posts the protected token only in the fixed form body', async () => {
    const fetchRequest = vi.fn<GoogleOAuthFetch>(async () => response(200))
    const revoker = new GoogleOAuthRevoker(vault('refresh token/+'), fetchRequest)

    await expect(revoker.revoke('account-work-1')).resolves.toBeUndefined()
    expect(fetchRequest).toHaveBeenCalledOnce()
    const [url, init] = fetchRequest.mock.calls[0]!
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect(url).not.toContain('refresh')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=refresh+token%2F%2B',
      redirect: 'error'
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats Google invalid_token as already revoked', async () => {
    const fetchRequest = vi.fn<GoogleOAuthFetch>(async () => response(400, {
      error: 'invalid_token',
      error_description: 'already expired'
    }))
    const revoker = new GoogleOAuthRevoker(vault('test-refresh-token'), fetchRequest)

    await expect(revoker.revoke('account-work-1')).resolves.toBeUndefined()
  })

  it('returns only stable safe failures for storage, provider, and malformed errors', async () => {
    const unavailableVault: Pick<SecretVault, 'get'> = {
      get: async () => { throw new Error('private storage detail') }
    }
    await expect(new GoogleOAuthRevoker(unavailableVault).revoke('account-work-1'))
      .rejects.toMatchObject({
        code: 'REVOCATION_STORAGE_FAILED',
        message: 'The protected Google authorization could not be read.',
        retryable: true
      })

    const unavailable = new GoogleOAuthRevoker(
      vault('test-refresh-token'),
      async () => response(503, { error: 'private-provider-detail' })
    )
    await expect(unavailable.revoke('account-work-1')).rejects.toMatchObject({
      code: 'REVOCATION_PROVIDER_UNAVAILABLE',
      message: 'Google authorization revocation is unavailable.',
      retryable: true
    })

    const offline = new GoogleOAuthRevoker(
      vault('test-refresh-token'),
      async () => { throw new Error('private-network-detail') }
    )
    await expect(offline.revoke('account-work-1')).rejects.toMatchObject({
      code: 'REVOCATION_PROVIDER_UNAVAILABLE',
      message: 'Google authorization revocation is unavailable.',
      retryable: true
    })

    const malformed = new GoogleOAuthRevoker(
      vault('test-refresh-token'),
      async () => response(400, { error: 'invalid_request' })
    )
    await expect(malformed.revoke('account-work-1')).rejects.toMatchObject({
      code: 'REVOCATION_PROVIDER_UNAVAILABLE',
      message: 'Google authorization revocation is unavailable.',
      retryable: false
    })
  })

  it('rejects invalid account scope and oversized provider responses', async () => {
    const secrets = vault('test-refresh-token')
    await expect(new GoogleOAuthRevoker(secrets).revoke('../work')).rejects.toMatchObject({
      code: 'INVALID_REVOCATION_REQUEST',
      retryable: false
    })
    expect(secrets.get).not.toHaveBeenCalled()

    const oversized = new GoogleOAuthRevoker(
      vault('test-refresh-token'),
      async () => new Response('x'.repeat(4_097), { status: 400 })
    )
    await expect(oversized.revoke('account-work-1')).rejects.toMatchObject({
      code: 'REVOCATION_PROVIDER_UNAVAILABLE',
      retryable: false
    })
  })
})
