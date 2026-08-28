import type { DatabaseSync } from 'node:sqlite'
import {
  AccountConnectionRecoveryConfirmationError,
  isAccountConnectionRecoveryConfirmationRecordV1,
  type AccountConnectionRecoveryConfirmationRecordV1,
  type AccountConnectionRecoveryConfirmationRepository
} from '../../application/accountConnectionRecoveryConfirmation'
import { isOperationId } from '../../application/accountLifecycle'
import {
  isRecoverAccountConnectionRequestV1,
  type RecoverAccountConnectionRequestV1
} from '../../application/recoverAccountConnection'

interface ConfirmationRow {
  version: number
  confirmation_id: string
  operation_id: string
  action_type: string
  account_scope: string
  expected_status: string
  confirmed_at: string
  expires_at: string
  consumed_at: string | null
}

const storageFailure = (message: string, cause?: unknown) =>
  new AccountConnectionRecoveryConfirmationError(
    'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED', message, true, { cause }
  )

const parseRow = (row: ConfirmationRow): AccountConnectionRecoveryConfirmationRecordV1 => {
  const record: Record<string, unknown> = {
    version: row.version,
    confirmationId: row.confirmation_id,
    operationId: row.operation_id,
    action: row.action_type,
    accountId: row.account_scope,
    expectedStatus: row.expected_status,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at
  }
  if (row.consumed_at !== null) record.consumedAt = row.consumed_at
  if (!isAccountConnectionRecoveryConfirmationRecordV1(record)) {
    throw storageFailure('Stored account recovery confirmation is invalid.')
  }
  return record
}

const recordsEqual = (
  left: AccountConnectionRecoveryConfirmationRecordV1 | undefined,
  right: AccountConnectionRecoveryConfirmationRecordV1
): boolean => left !== undefined && left.version === right.version &&
  left.confirmationId === right.confirmationId && left.operationId === right.operationId &&
  left.action === right.action && left.accountId === right.accountId &&
  left.expectedStatus === right.expectedStatus && left.confirmedAt === right.confirmedAt &&
  left.expiresAt === right.expiresAt && left.consumedAt === right.consumedAt

const isTimestamp = (value: string): boolean => {
  const milliseconds = Date.parse(value)
  return value.length <= 64 && Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
}

export class SqliteAccountConnectionRecoveryConfirmationRepository
implements AccountConnectionRecoveryConfirmationRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(record: AccountConnectionRecoveryConfirmationRecordV1): void {
    if (!isAccountConnectionRecoveryConfirmationRecordV1(record)) {
      throw storageFailure('The account recovery confirmation is invalid.')
    }
    try {
      const result = this.database.prepare(`
        INSERT INTO account_connection_recovery_confirmations (
          version, confirmation_id, operation_id, action_type, account_scope,
          expected_status, confirmed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(confirmation_id) DO NOTHING
      `).run(
        record.version, record.confirmationId, record.operationId, record.action,
        record.accountId, record.expectedStatus, record.confirmedAt, record.expiresAt
      )
      if (Number(result.changes) === 0 &&
          !recordsEqual(this.load(record.confirmationId), record)) {
        throw storageFailure('A confirmation identifier cannot be rebound.')
      }
    } catch (error) {
      if (error instanceof AccountConnectionRecoveryConfirmationError) throw error
      throw storageFailure('Failed to save account recovery confirmation.', error)
    }
  }

  load(confirmationId: string): AccountConnectionRecoveryConfirmationRecordV1 | undefined {
    if (!isOperationId(confirmationId)) throw storageFailure('The confirmation identifier is invalid.')
    try {
      const row = this.database.prepare(`
        SELECT version, confirmation_id, operation_id, action_type, account_scope,
          expected_status, confirmed_at, expires_at, consumed_at
        FROM account_connection_recovery_confirmations WHERE confirmation_id = ?
      `).get(confirmationId) as unknown as ConfirmationRow | undefined
      return row === undefined ? undefined : parseRow(row)
    } catch (error) {
      if (error instanceof AccountConnectionRecoveryConfirmationError) throw error
      throw storageFailure('Failed to load account recovery confirmation.', error)
    }
  }

  consume(request: RecoverAccountConnectionRequestV1, consumedAt: string): boolean {
    if (!isRecoverAccountConnectionRequestV1(request) || !isTimestamp(consumedAt)) {
      throw storageFailure('The confirmation consumption request is invalid.')
    }
    try {
      return Number(this.database.prepare(`
        UPDATE account_connection_recovery_confirmations
        SET consumed_at = ?
        WHERE confirmation_id = ? AND operation_id = ? AND action_type = ?
          AND account_scope = ? AND expected_status = ? AND consumed_at IS NULL
          AND confirmed_at <= ? AND expires_at >= ?
      `).run(
        consumedAt, request.confirmationId, request.operationId, request.action,
        request.accountId, request.expectedStatus, consumedAt, consumedAt
      ).changes) === 1
    } catch (error) {
      throw storageFailure('Failed to consume account recovery confirmation.', error)
    }
  }

  deleteExpired(expiresBefore: string): number {
    if (!isTimestamp(expiresBefore)) {
      throw storageFailure('The confirmation cleanup boundary is invalid.')
    }
    try {
      return Number(this.database.prepare(`
        DELETE FROM account_connection_recovery_confirmations WHERE expires_at < ?
      `).run(expiresBefore).changes)
    } catch (error) {
      throw storageFailure('Failed to clean up account recovery confirmations.', error)
    }
  }
}
