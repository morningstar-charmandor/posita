import { describe, expect, it } from 'vitest'
import {
  GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
  GOOGLE_CONNECT_CONSENT
} from './contracts'
import {
  isPrepareGoogleAccountConnectionRequest,
  isPrepareGoogleAccountConnectionResponse
} from './validation'

const result = {
  version: 1,
  action: 'prepare-google-account-connection',
  provider: 'google',
  status: 'authorization-not-started',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes,
  notices: GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
  nextStep: 'explicit-google-authorization-required'
} as const

describe('Gmail connection preflight validation', () => {
  it('accepts only the exact request and safe response', () => {
    expect(isPrepareGoogleAccountConnectionRequest({
      version: 1,
      action: 'prepare-google-account-connection'
    })).toBe(true)
    expect(isPrepareGoogleAccountConnectionRequest({
      version: 1,
      action: 'prepare-google-account-connection',
      accountId: 'renderer-selected'
    })).toBe(false)
    expect(isPrepareGoogleAccountConnectionResponse({ ok: true, value: result })).toBe(true)
  })

  it('refuses privileged or widened output', () => {
    expect(isPrepareGoogleAccountConnectionResponse({
      ok: true,
      value: { ...result, authorizationUrl: 'https://accounts.google.com/' }
    })).toBe(false)
    expect(isPrepareGoogleAccountConnectionResponse({
      ok: true,
      value: { ...result, requestedScopes: [...result.requestedScopes, 'gmail.modify'] }
    })).toBe(false)
  })
})
