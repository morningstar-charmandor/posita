import { describe, expect, it, vi } from 'vitest'
import {
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  LOCAL_DATA_DELETION_CONSEQUENCES
} from '../shared/contracts'
import {
  createExecuteLocalDataDeletionClient,
  createPrepareLocalDataDeletionClient
} from './localDataDeletionClient'

const request = {
  version: 1 as const,
  confirmationId: 'confirm-delete-1',
  operationId: 'delete-local-1',
  action: 'delete-local-data' as const,
  enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
}

describe('preload local-data deletion client', () => {
  it('prepares only the fixed versioned capability request', async () => {
    const response = {
      ok: true as const,
      value: {
        version: 1 as const,
        confirmationId: request.confirmationId,
        operationId: request.operationId,
        action: request.action,
        requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
        expiresAt: '2026-08-24T12:05:00.000Z',
        consequences: LOCAL_DATA_DELETION_CONSEQUENCES
      }
    }
    const invoke = vi.fn().mockResolvedValue(response)

    await expect(createPrepareLocalDataDeletionClient(invoke)()).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ version: 1, action: 'delete-local-data' })
  })

  it('validates execute input before invoking main', async () => {
    const invoke = vi.fn()
    const execute = createExecuteLocalDataDeletionClient(invoke)

    await expect(execute({ ...request, operationId: request.confirmationId }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed prepare and execute responses', async () => {
    await expect(createPrepareLocalDataDeletionClient(async () => ({
      ok: true,
      value: { databasePath: '/private/posita.sqlite3' }
    }))()).resolves.toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } })

    await expect(createExecuteLocalDataDeletionClient(async () => ({
      ok: true,
      value: { version: 1, status: 'deleted-gmail' }
    }))(request)).resolves.toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } })
  })
})
