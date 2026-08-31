import { describe, expect, it } from 'vitest'
import { fixtures } from './fixtures'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  GOOGLE_CONNECT_CONSENT,
  LOCAL_DATA_DELETION_CONSEQUENCES
} from './contracts'
import {
  isExecuteAccountConnectionRecoveryRequest,
  isExecuteAccountConnectionRecoveryResponse,
  isAppSnapshot,
  isExecuteLocalDataDeletionRequest,
  isExecuteLocalDataDeletionResponse,
  isGoogleConnectConsent,
  isLoadApplicationStateRequest,
  isLoadApplicationStateResponse,
  isLoadSnapshotResponse,
  isMailDataset,
  isPrepareLocalDataDeletionRequest,
  isPrepareLocalDataDeletionResponse,
  isPrepareAccountConnectionRecoveryRequest,
  isPrepareAccountConnectionRecoveryResponse
} from './validation'

describe('shared contract validation', () => {
  it('accepts the complete fixture dataset and a valid snapshot', () => {
    expect(isMailDataset(fixtures)).toBe(true)
    expect(isAppSnapshot({
      version: 1,
      dataMode: 'fixture-seeded',
      loadedAt: '2026-08-24T05:30:00.000Z',
      dataset: fixtures
    })).toBe(true)
  })

  it('requires an exact versioned request shape', () => {
    expect(isLoadApplicationStateRequest({ version: 1 })).toBe(true)
    expect(isLoadApplicationStateRequest({ version: 2 })).toBe(false)
    expect(isLoadApplicationStateRequest({ version: 1, channel: 'arbitrary' })).toBe(false)
  })

  it('accepts only coherent application and lifecycle states', () => {
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted' }
    })).toBe(true)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: {
          version: 1,
          dataMode: 'fixture-seeded',
          loadedAt: '2026-08-24T05:30:00.000Z',
          dataset: fixtures
        },
        lifecycle: {
          version: 1,
          state: 'pending',
          operations: [{
            version: 1,
            operationId: 'disconnect-work-1',
            operationType: 'disconnect-account',
            accountId: 'work',
            status: 'pending',
            stage: 'removing-mail-data',
            completedSteps: 3,
            totalSteps: 5,
            message: 'Account disconnection is pending.'
          }]
        },
        connectConsent: GOOGLE_CONNECT_CONSENT
      }
    })).toBe(true)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: { version: 1 },
        lifecycle: { version: 1, state: 'idle', operations: [{ status: 'pending' }] },
        connectConsent: GOOGLE_CONNECT_CONSENT
      }
    })).toBe(false)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted', retryOperationId: 'hidden-command' }
    })).toBe(false)
  })

  it('accepts only the reviewed Gmail consent version and exact disclosures', () => {
    expect(isGoogleConnectConsent(GOOGLE_CONNECT_CONSENT)).toBe(true)
    expect(isGoogleConnectConsent({
      ...GOOGLE_CONNECT_CONSENT,
      requestedScope: 'gmail.modify'
    })).toBe(false)
    expect(isGoogleConnectConsent({
      ...GOOGLE_CONNECT_CONSENT,
      disclosures: GOOGLE_CONNECT_CONSENT.disclosures.slice(1)
    })).toBe(false)
  })

  it('rejects malformed success and error responses', () => {
    expect(isLoadSnapshotResponse({ ok: true, value: { version: 1 } })).toBe(false)
    expect(isLoadSnapshotResponse({
      ok: false,
      error: {
        version: 1,
        code: 'RAW_SQL_ERROR',
        message: 'leaked',
        retryable: true
      }
    })).toBe(false)
  })

  it('rejects derived claims that reference a missing source message', () => {
    const invalid = structuredClone(fixtures)
    invalid.topics[0]!.events[0]!.citationMessageId = 'missing-message'

    expect(isMailDataset(invalid)).toBe(false)
  })

  it('rejects undeclared fields anywhere in the renderer payload', () => {
    const invalid = structuredClone(fixtures) as typeof fixtures & { providerPayload?: unknown }
    invalid.providerPayload = { raw: 'must not cross the bridge' }

    expect(isMailDataset(invalid)).toBe(false)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'recovery-required', databasePath: '/private/path' }
    })).toBe(false)
  })

  it('rejects a display label in the absolute source timestamp field', () => {
    const invalid = structuredClone(fixtures)
    invalid.messages[0]!.receivedAtIso = 'Today · 10:42 AM'

    expect(isMailDataset(invalid)).toBe(false)
  })

  it('validates exact local-data deletion requests and bounded responses', () => {
    expect(isPrepareLocalDataDeletionRequest({ version: 1, action: 'delete-local-data' }))
      .toBe(true)
    expect(isPrepareLocalDataDeletionRequest({
      version: 1,
      action: 'delete-local-data',
      startImmediately: true
    })).toBe(false)

    const request = {
      version: 1,
      confirmationId: 'confirm-delete-1',
      operationId: 'delete-local-1',
      action: 'delete-local-data',
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    }
    expect(isExecuteLocalDataDeletionRequest(request)).toBe(true)
    expect(isExecuteLocalDataDeletionRequest({ ...request, operationId: request.confirmationId }))
      .toBe(false)
    expect(isExecuteLocalDataDeletionRequest({ ...request, enteredText: 'x'.repeat(65) }))
      .toBe(false)

    expect(isPrepareLocalDataDeletionResponse({
      ok: true,
      value: {
        version: 1,
        confirmationId: request.confirmationId,
        operationId: request.operationId,
        action: request.action,
        requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
        expiresAt: '2026-08-24T12:05:00.000Z',
        consequences: LOCAL_DATA_DELETION_CONSEQUENCES
      }
    })).toBe(true)
    expect(isExecuteLocalDataDeletionResponse({
      ok: true,
      value: { version: 1, operationId: request.operationId, status: 'local-data-deleted' }
    })).toBe(true)
    expect(isPrepareLocalDataDeletionResponse({
      ok: true,
      value: {
        version: 1,
        confirmationId: request.confirmationId,
        operationId: request.operationId,
        action: request.action,
        requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
        expiresAt: '2026-08-24T12:05:00.000Z',
        consequences: ['Deletes Gmail mail.', ...LOCAL_DATA_DELETION_CONSEQUENCES.slice(1)]
      }
    })).toBe(false)
  })

  it('validates exact account-bound recovery requests and safe responses', () => {
    const prepare = {
      version: 1,
      action: 'discard-orphaned-local-connection-state',
      accountId: 'account-work-1'
    }
    expect(isPrepareAccountConnectionRecoveryRequest(prepare)).toBe(true)
    expect(isPrepareAccountConnectionRecoveryRequest({
      ...prepare,
      expectedStatus: 'credential-only'
    })).toBe(false)

    const execute = {
      version: 1,
      confirmationId: 'confirmation-recovery-1',
      operationId: 'operation-recovery-1',
      action: prepare.action,
      accountId: prepare.accountId,
      expectedStatus: 'credential-only',
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    }
    expect(isExecuteAccountConnectionRecoveryRequest(execute)).toBe(true)
    expect(isExecuteAccountConnectionRecoveryRequest({
      ...execute,
      expectedStatus: 'connected'
    })).toBe(false)
    expect(isExecuteAccountConnectionRecoveryRequest({
      ...execute,
      refreshToken: 'must-not-cross-ipc'
    })).toBe(false)

    expect(isPrepareAccountConnectionRecoveryResponse({
      ok: true,
      value: {
        version: 1,
        confirmationId: execute.confirmationId,
        operationId: execute.operationId,
        action: execute.action,
        accountId: execute.accountId,
        expectedStatus: execute.expectedStatus,
        requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
        expiresAt: '2026-08-30T12:05:00.000Z',
        consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
      }
    })).toBe(true)
    expect(isExecuteAccountConnectionRecoveryResponse({
      ok: true,
      value: {
        version: 1,
        operationId: execute.operationId,
        accountId: execute.accountId,
        status: 'absent',
        removed: 'credential',
        reconnectRequired: true
      }
    })).toBe(true)
  })
})
