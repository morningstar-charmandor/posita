import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  type ExecuteAccountConnectionRecoveryRequestV1
} from '../shared/contracts'
import {
  createExecuteAccountConnectionRecoveryClient,
  createPrepareAccountConnectionRecoveryClient
} from './accountConnectionRecoveryClient'

const accountId = 'account-work-1'
const prepareRequest = {
  version: 1 as const,
  action: 'discard-orphaned-local-connection-state' as const,
  accountId
}
const executeRequest: ExecuteAccountConnectionRecoveryRequestV1 = {
  version: 1,
  confirmationId: 'confirmation-recovery-1',
  operationId: 'operation-recovery-1',
  action: prepareRequest.action,
  accountId,
  expectedStatus: 'credential-only',
  enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
}

describe('preload account-connection recovery client', () => {
  it('validates the account-bound prepare request before invoking main', async () => {
    const response = {
      ok: true as const,
      value: {
        version: 1 as const,
        confirmationId: executeRequest.confirmationId,
        operationId: executeRequest.operationId,
        action: executeRequest.action,
        accountId,
        expectedStatus: executeRequest.expectedStatus,
        requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
        expiresAt: '2026-08-30T12:05:00.000Z',
        consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
      }
    }
    const invoke = vi.fn().mockResolvedValue(response)

    await expect(createPrepareAccountConnectionRecoveryClient(invoke)(prepareRequest))
      .resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledExactlyOnceWith(prepareRequest)
  })

  it('rejects malformed execute input before invoking main', async () => {
    const invoke = vi.fn()
    const execute = createExecuteAccountConnectionRecoveryClient(invoke)

    await expect(execute({ ...executeRequest, accountId: 'email@example.com' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed prepare and execute responses', async () => {
    await expect(createPrepareAccountConnectionRecoveryClient(async () => ({
      ok: true,
      value: { refreshToken: 'must-not-cross-preload' }
    }))(prepareRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' }
    })

    await expect(createExecuteAccountConnectionRecoveryClient(async () => ({
      ok: true,
      value: { version: 1, status: 'connected' }
    }))(executeRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_ERROR' }
    })
  })
})
