import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES, GOOGLE_CONNECT_CONSENT } from '../shared/contracts'
import { createPrepareGoogleAccountConnectionClient } from './googleAccountConnectionPreflightClient'

const request = { version: 1, action: 'prepare-google-account-connection' } as const
const result = {
  version: 1 as const,
  action: request.action,
  provider: 'google' as const,
  status: 'authorization-not-started' as const,
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes,
  notices: GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
  nextStep: 'explicit-google-authorization-required' as const
}

describe('preload Gmail connection preparation client', () => {
  it('validates the request and exact safe response', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: result }))
    await expect(createPrepareGoogleAccountConnectionClient(invoke)(request))
      .resolves.toEqual({ ok: true, value: result })
    expect(invoke).toHaveBeenCalledWith(request)
  })

  it('rejects malformed backend output', async () => {
    const client = createPrepareGoogleAccountConnectionClient(async () => ({
      ok: true,
      value: { ...result, authorizationUrl: 'https://accounts.google.com/' }
    }))
    await expect(client(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' }
    })
  })
})
