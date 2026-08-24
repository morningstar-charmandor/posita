import type { DatabaseSync } from 'node:sqlite'
import {
  AccountLifecycleError,
  isLifecycleOperationV1,
  isOperationId,
  type AccountLifecycleRepository,
  type LifecycleOperationV1
} from '../../application/accountLifecycle'

interface LifecycleRow {
  version: number
  operation_id: string
  operation_type: string
  account_scope: string | null
  phase: string
  last_error_code: string | null
}

const storageFailure = (message: string, cause: unknown): AccountLifecycleError =>
  new AccountLifecycleError('LIFECYCLE_STORAGE_FAILED', message, { cause })

const parseRow = (row: LifecycleRow): LifecycleOperationV1 => {
  const value: unknown = row.operation_type === 'disconnect-account'
    ? {
        version: row.version,
        operationId: row.operation_id,
        operationType: row.operation_type,
        accountId: row.account_scope,
        phase: row.phase,
        ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code })
      }
    : {
        version: row.version,
        operationId: row.operation_id,
        operationType: row.operation_type,
        phase: row.phase,
        ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code })
      }
  if (!isLifecycleOperationV1(value)) {
    throw new AccountLifecycleError(
      'INVALID_LIFECYCLE_STATE',
      'Stored account lifecycle state is invalid.'
    )
  }
  return value
}

export class SqliteAccountLifecycleRepository implements AccountLifecycleRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(operation: LifecycleOperationV1): void {
    if (!isLifecycleOperationV1(operation)) {
      throw new AccountLifecycleError('INVALID_LIFECYCLE_STATE', 'Lifecycle state is invalid.')
    }
    try {
      const accountScope = operation.operationType === 'disconnect-account'
        ? operation.accountId
        : null
      const result = this.database.prepare(`
        INSERT INTO account_lifecycle_operations (
          version, operation_id, operation_type, account_scope, phase,
          last_error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(operation_id) DO UPDATE SET
          phase = excluded.phase,
          last_error_code = excluded.last_error_code,
          updated_at = datetime('now')
        WHERE operation_type = excluded.operation_type
          AND account_scope IS excluded.account_scope
      `).run(
        operation.version,
        operation.operationId,
        operation.operationType,
        accountScope,
        operation.phase,
        operation.lastErrorCode ?? null
      )
      if (Number(result.changes) !== 1) {
        throw new AccountLifecycleError(
          'INVALID_LIFECYCLE_STATE',
          'A lifecycle operation cannot change its type or account scope.'
        )
      }
    } catch (error) {
      if (error instanceof AccountLifecycleError) throw error
      throw storageFailure('Failed to save account lifecycle state.', error)
    }
  }

  load(operationId: string): LifecycleOperationV1 | undefined {
    this.assertOperationId(operationId)
    try {
      const row = this.database.prepare(`
        SELECT version, operation_id, operation_type, account_scope, phase, last_error_code
        FROM account_lifecycle_operations WHERE operation_id = ?
      `).get(operationId) as unknown as LifecycleRow | undefined
      return row === undefined ? undefined : parseRow(row)
    } catch (error) {
      if (error instanceof AccountLifecycleError) throw error
      throw storageFailure('Failed to load account lifecycle state.', error)
    }
  }

  listPending(): LifecycleOperationV1[] {
    try {
      const rows = this.database.prepare(`
        SELECT version, operation_id, operation_type, account_scope, phase, last_error_code
        FROM account_lifecycle_operations
        WHERE phase != 'completed'
        ORDER BY created_at, operation_id
      `).all() as unknown as LifecycleRow[]
      return rows.map(parseRow)
    } catch (error) {
      if (error instanceof AccountLifecycleError) throw error
      throw storageFailure('Failed to list pending account lifecycle state.', error)
    }
  }

  deleteCompleted(operationId: string): boolean {
    this.assertOperationId(operationId)
    try {
      const result = this.database.prepare(`
        DELETE FROM account_lifecycle_operations
        WHERE operation_id = ? AND phase = 'completed'
      `).run(operationId)
      return Number(result.changes) > 0
    } catch (error) {
      if (error instanceof AccountLifecycleError) throw error
      throw storageFailure('Failed to delete completed account lifecycle state.', error)
    }
  }

  private assertOperationId(operationId: string): void {
    if (!isOperationId(operationId)) {
      throw new AccountLifecycleError(
        'INVALID_LIFECYCLE_STATE',
        'The lifecycle operation identifier is invalid.'
      )
    }
  }
}
