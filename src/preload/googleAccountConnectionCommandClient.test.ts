import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../shared/contracts'
import {
  createCancelGoogleAccountConnectionClient,
  createConnectGoogleAccountClient
} from './googleAccountConnectionCommandClient'

const connectRequest = {
  version: 1 as const,
  action: 'connect-google-account' as const,
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
}

describe('Google account connection preload clients', () => {
  it('passes an exact safe connection result', async () => {
    const client = createConnectGoogleAccountClient(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-03T12:00:00.000Z',
        status: 'connected-and-synced'
      }
    }))
    await expect(client(connectRequest)).resolves.toMatchObject({
      ok: true,
      value: { mailboxAddress: 'owner@example.test' }
    })
  })

  it('rejects privileged output and validates cancellation', async () => {
    const client = createConnectGoogleAccountClient(async () => ({
      ok: true,
      value: {
        version: 1,
        accountId: 'account-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-03T12:00:00.000Z',
        status: 'connected-and-synced',
        refreshToken: 'forbidden'
      }
    }))
    await expect(client(connectRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' }
    })

    const cancel = createCancelGoogleAccountConnectionClient(async () => ({
      ok: true,
      value: { version: 1, status: 'cancellation-requested' }
    }))
    await expect(cancel({ version: 1, action: 'cancel-google-account-connection' }))
      .resolves.toMatchObject({ ok: true })
  })
})
