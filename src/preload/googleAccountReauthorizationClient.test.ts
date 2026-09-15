import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../shared/contracts'
import {
  createCancelGoogleAccountReauthorizationClient,
  createReauthorizeGoogleAccountClient
} from './googleAccountReauthorizationClient'

const request = {
  version: 1 as const,
  action: 'reauthorize-google-account' as const,
  accountId: 'account-1',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
}

describe('Google account reauthorization preload clients', () => {
  it('passes only the exact bounded renewal result', async () => {
    const client = createReauthorizeGoogleAccountClient(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-04T12:00:00.000Z',
        status: 'connected-and-synced'
      }
    }))
    await expect(client(request)).resolves.toMatchObject({ ok: true })

    const leaking = createReauthorizeGoogleAccountClient(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-04T12:00:00.000Z',
        status: 'connected-and-synced',
        refreshToken: 'forbidden'
      }
    }))
    await expect(leaking(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' }
    })
  })

  it('validates exact cancellation responses', async () => {
    const client = createCancelGoogleAccountReauthorizationClient(async () => ({
      ok: true,
      value: { version: 1, status: 'cancellation-requested' }
    }))
    await expect(client({ version: 1, action: 'cancel-google-account-reauthorization' }))
      .resolves.toMatchObject({ ok: true })
  })
})
