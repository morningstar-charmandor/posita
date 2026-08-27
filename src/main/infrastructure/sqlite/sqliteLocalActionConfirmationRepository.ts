import type { DatabaseSync } from 'node:sqlite'
import {
  isLocalActionConfirmationRecordV1,
  LocalActionConfirmationError,
  type LocalActionConfirmationRecordV1,
  type LocalActionConfirmationRepository
} from '../../application/localActionConfirmation'
import { isOperationId } from '../../application/accountLifecycle'

interface ConfirmationRow {
  version: number
  confirmation_id: string
  operation_id: string
  action_type: string
  confirmed_at: string
  expires_at: string
}

const storageFailure = (message: string, cause: unknown): LocalActionConfirmationError =>
  new LocalActionConfirmationError('CONFIRMATION_STORAGE_FAILED', message, true, { cause })

const parseRow = (row: ConfirmationRow): LocalActionConfirmationRecordV1 => {
  const value: unknown = {
    version: row.version,
    confirmationId: row.confirmation_id,
    operationId: row.operation_id,
    action: row.action_type,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at
  }
  if (!isLocalActionConfirmationRecordV1(value)) {
    throw storageFailure('Stored local-action confirmation is invalid.', undefined)
  }
  return value
}

export class SqliteLocalActionConfirmationRepository
implements LocalActionConfirmationRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(record: LocalActionConfirmationRecordV1): void {
    if (!isLocalActionConfirmationRecordV1(record)) {
      throw storageFailure('The local-action confirmation is invalid.', undefined)
    }
    try {
      const result = this.database.prepare(`
        INSERT INTO local_action_confirmations (
          version, confirmation_id, operation_id, action_type, confirmed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(confirmation_id) DO NOTHING
      `).run(
        record.version,
        record.confirmationId,
        record.operationId,
        record.action,
        record.confirmedAt,
        record.expiresAt
      )
      if (Number(result.changes) === 0) {
        const stored = this.load(record.confirmationId)
        if (JSON.stringify(stored) !== JSON.stringify(record)) {
          throw storageFailure(
            'A confirmation identifier cannot be rebound to another operation.',
            undefined
          )
        }
      }
    } catch (error) {
      if (error instanceof LocalActionConfirmationError) throw error
      throw storageFailure('Failed to save local-action confirmation.', error)
    }
  }

  load(confirmationId: string): LocalActionConfirmationRecordV1 | undefined {
    if (!isOperationId(confirmationId)) {
      throw storageFailure('The confirmation identifier is invalid.', undefined)
    }
    try {
      const row = this.database.prepare(`
        SELECT version, confirmation_id, operation_id, action_type, confirmed_at, expires_at
        FROM local_action_confirmations WHERE confirmation_id = ?
      `).get(confirmationId) as unknown as ConfirmationRow | undefined
      return row === undefined ? undefined : parseRow(row)
    } catch (error) {
      if (error instanceof LocalActionConfirmationError) throw error
      throw storageFailure('Failed to load local-action confirmation.', error)
    }
  }

  deleteExpiredWithoutPendingOperation(expiresBefore: string): number {
    const beforeMs = Date.parse(expiresBefore)
    if (!Number.isFinite(beforeMs) || new Date(beforeMs).toISOString() !== expiresBefore) {
      throw storageFailure('The confirmation cleanup boundary is invalid.', undefined)
    }
    try {
      const result = this.database.prepare(`
        DELETE FROM local_action_confirmations
        WHERE expires_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM account_lifecycle_operations
            WHERE operation_id = local_action_confirmations.operation_id
              AND operation_type = 'delete-local-data'
              AND phase != 'completed'
          )
      `).run(expiresBefore)
      return Number(result.changes)
    } catch (error) {
      if (error instanceof LocalActionConfirmationError) throw error
      throw storageFailure('Failed to clean up local-action confirmations.', error)
    }
  }
}
