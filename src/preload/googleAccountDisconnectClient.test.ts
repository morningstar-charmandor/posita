import { describe, expect, it } from 'vitest'
import {
  GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES,
  GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
} from '../shared/contracts'
import {
  createExecuteGoogleAccountDisconnectClient,
  createPrepareGoogleAccountDisconnectClient
} from './googleAccountDisconnectClient'

describe('Google account disconnect preload clients', () => {
  it('validates preparation and execution responses', async () => {
    const prepare = createPrepareGoogleAccountDisconnectClient(async () => ({
      ok: true,
      value: {
        version: 1,
        confirmationId: 'confirmation-1',
        operationId: 'operation-1',
        action: 'disconnect-google-account',
        accountId: 'account-1',
        requiredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT,
        expiresAt: '2026-09-03T12:05:00.000Z',
        consequences: GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES
      }
    }))
    await expect(prepare({
      version: 1,
      action: 'disconnect-google-account',
      accountId: 'account-1'
    })).resolves.toMatchObject({ ok: true })

    const execute = createExecuteGoogleAccountDisconnectClient(async () => ({
      ok: true,
      value: { version: 1, operationId: 'operation-1', accountId: 'account-1', status: 'disconnected' }
    }))
    await expect(execute({
      version: 1,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      action: 'disconnect-google-account',
      accountId: 'account-1',
      enteredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
    })).resolves.toMatchObject({ ok: true })
  })
})
