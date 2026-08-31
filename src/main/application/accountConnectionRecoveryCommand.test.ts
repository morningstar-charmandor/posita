import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  type AccountConnectionRecoveryChallengeV1,
  type ExecuteAccountConnectionRecoveryRequestV1
} from '../../shared/contracts'
import type { AccountConnectionConsistencyInspector } from './accountConnection'
import { AccountConnectionRecoveryCommandService } from './accountConnectionRecoveryCommand'
import {
  AccountConnectionRecoveryConfirmationError,
  type AccountConnectionRecoveryConfirmationService
} from './accountConnectionRecoveryConfirmation'
import type { AccountConnectionRecoveryService } from './recoverAccountConnection'

const accountId = 'account-work-1'
const challenge: AccountConnectionRecoveryChallengeV1 = {
  version: 1,
  confirmationId: 'confirmation-recovery-1',
  operationId: 'operation-recovery-1',
  action: 'discard-orphaned-local-connection-state',
  accountId,
  expectedStatus: 'credential-only',
  requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  expiresAt: '2026-08-30T12:05:00.000Z',
  consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
}
const prepareRequest = {
  version: 1 as const,
  action: 'discard-orphaned-local-connection-state' as const,
  accountId
}
const executeRequest: ExecuteAccountConnectionRecoveryRequestV1 = {
  version: 1,
  confirmationId: challenge.confirmationId,
  operationId: challenge.operationId,
  action: challenge.action,
  accountId,
  expectedStatus: challenge.expectedStatus,
  enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
}

const createHarness = (status: 'absent' | 'connected' | 'credential-only' | 'provider-state-only') => {
  const inspect = vi.fn().mockResolvedValue({ version: 1 as const, accountId, status })
  const prepare = vi.fn().mockResolvedValue({ ...challenge, expectedStatus: status === 'provider-state-only'
    ? 'provider-state-only' as const
    : 'credential-only' as const })
  const confirm = vi.fn().mockReturnValue({
    version: 1 as const,
    confirmationId: challenge.confirmationId,
    operationId: challenge.operationId,
    action: challenge.action,
    accountId,
    expectedStatus: challenge.expectedStatus,
    confirmedAt: '2026-08-30T12:00:00.000Z',
    expiresAt: challenge.expiresAt
  })
  const recover = vi.fn().mockResolvedValue({
    version: 1 as const,
    operationId: challenge.operationId,
    accountId,
    status: 'absent' as const,
    removed: 'credential' as const,
    reconnectRequired: true as const
  })
  const service = new AccountConnectionRecoveryCommandService(
    { inspect } satisfies AccountConnectionConsistencyInspector,
    { prepare, confirm } satisfies Pick<
      AccountConnectionRecoveryConfirmationService,
      'prepare' | 'confirm'
    >,
    { recover } satisfies Pick<AccountConnectionRecoveryService, 'recover'>
  )
  return { service, inspect, prepare, confirm, recover }
}

describe('AccountConnectionRecoveryCommandService', () => {
  it('is unavailable without active ready-mode composition and rejects malformed requests', async () => {
    await expect(new AccountConnectionRecoveryCommandService().prepare(prepareRequest))
      .resolves.toMatchObject({ ok: false, error: { code: 'RECOVERY_UNAVAILABLE' } })
    await expect(createHarness('credential-only').service.prepare({
      ...prepareRequest,
      expectedStatus: 'credential-only'
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('refuses absent and complete connections before creating confirmation state', async () => {
    const absent = createHarness('absent')
    await expect(absent.service.prepare(prepareRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'RECOVERY_NOT_NEEDED', retryable: false }
    })
    expect(absent.prepare).not.toHaveBeenCalled()

    const connected = createHarness('connected')
    await expect(connected.service.prepare(prepareRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'RECOVERY_REFUSED', retryable: false }
    })
    expect(connected.prepare).not.toHaveBeenCalled()
  })

  it('lets main derive the orphan type and returns a bounded challenge', async () => {
    const harness = createHarness('provider-state-only')

    await expect(harness.service.prepare(prepareRequest)).resolves.toMatchObject({
      ok: true,
      value: { accountId, expectedStatus: 'provider-state-only' }
    })
    expect(harness.prepare).toHaveBeenCalledExactlyOnceWith(prepareRequest)
  })

  it('confirms first, omits typed text from recovery, and returns reconnect-required success', async () => {
    const harness = createHarness('credential-only')

    await expect(harness.service.execute(executeRequest)).resolves.toEqual({
      ok: true,
      value: {
        version: 1,
        operationId: challenge.operationId,
        accountId,
        status: 'absent',
        removed: 'credential',
        reconnectRequired: true
      }
    })
    expect(harness.confirm).toHaveBeenCalledExactlyOnceWith(executeRequest)
    expect(harness.recover).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      accountId,
      expectedStatus: 'credential-only'
    })
  })

  it('maps confirmation storage failures to a stable safe response', async () => {
    const harness = createHarness('credential-only')
    harness.confirm.mockImplementation(() => {
      throw new AccountConnectionRecoveryConfirmationError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED',
        'Safe test message.',
        true
      )
    })

    await expect(harness.service.execute(executeRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', retryable: true }
    })
    expect(harness.recover).not.toHaveBeenCalled()
  })
})
