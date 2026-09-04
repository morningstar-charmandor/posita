import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from './contracts'
import {
  isCancelGoogleAccountConnectionRequest,
  isConnectGoogleAccountRequest,
  isConnectGoogleAccountResponse,
  isPrepareGoogleAccountDisconnectRequest,
  isPrepareGoogleAccountDisconnectResponse
} from './validation'

describe('Google account connection command validation', () => {
  it('accepts the exact fixed-consent request and safe result', () => {
    expect(isConnectGoogleAccountRequest({
      version: 1,
      action: 'connect-google-account',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
    })).toBe(true)
    expect(isConnectGoogleAccountResponse({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-03T12:00:00.000Z',
        status: 'connected-and-synced'
      }
    })).toBe(true)
    expect(isCancelGoogleAccountConnectionRequest({
      version: 1,
      action: 'cancel-google-account-connection'
    })).toBe(true)
  })

  it('rejects renderer-selected identity and privileged output', () => {
    expect(isConnectGoogleAccountRequest({
      version: 1,
      action: 'connect-google-account',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      accountId: 'chosen'
    })).toBe(false)
    expect(isConnectGoogleAccountResponse({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-03T12:00:00.000Z',
        status: 'connected-and-synced',
        authorizationUrl: 'https://accounts.google.com/'
      }
    })).toBe(false)
  })

  it('validates exact confirmed disconnect preparation without widening', () => {
    expect(isPrepareGoogleAccountDisconnectRequest({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })).toBe(true)
    expect(isPrepareGoogleAccountDisconnectResponse({
      ok: true,
      value: {
        version: 1,
        confirmationId: 'confirmation-1',
        operationId: 'operation-1',
        action: 'disconnect-google-account',
        accountId: 'account-1',
        requiredText: 'DISCONNECT GMAIL',
        expiresAt: '2026-09-03T12:05:00.000Z',
        consequences: [
          'Revokes Posita’s Google authorization for this account.',
          'Removes its credential, encrypted account state, cursor, and cached mail from Posita.',
          'Does not delete or change messages in Gmail.'
        ]
      }
    })).toBe(true)
  })
})
