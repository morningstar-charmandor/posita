import type { DatabaseSync } from 'node:sqlite'
import { isOperationId } from '../../application/accountLifecycle'
import { isAccountId } from '../../application/accountState'
import type {
  GoogleAccountDisconnectAuditRecordV1,
  GoogleAccountDisconnectAuditRepository
} from '../../application/googleAccountDisconnectCommand'

const isTimestamp = (value: string): boolean => {
  const milliseconds = Date.parse(value)
  return value.length <= 64 && Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
}

export class SqliteGoogleAccountDisconnectAuditRepository
implements GoogleAccountDisconnectAuditRepository {
  constructor(private readonly database: DatabaseSync) {}

  save(record: GoogleAccountDisconnectAuditRecordV1): void {
    if (record.version !== 1 || !isOperationId(record.confirmationId) ||
        !isOperationId(record.operationId) || !isAccountId(record.accountId) ||
        record.confirmationId === record.operationId ||
        !isTimestamp(record.confirmedAt)) throw new Error('Invalid disconnect audit record.')
    const result = this.database.prepare(`
      INSERT INTO audit_events (
        id, command_type, target_id, confirmation_id, result_code, created_at
      ) VALUES (?, 'disconnect-account', ?, ?, 'confirmed', ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      record.operationId,
      record.accountId,
      record.confirmationId,
      record.confirmedAt
    )
    if (Number(result.changes) === 0) {
      const existing = this.database.prepare(`
        SELECT command_type, target_id, confirmation_id, result_code, created_at
        FROM audit_events WHERE id = ?
      `).get(record.operationId) as Record<string, unknown> | undefined
      if (existing?.command_type !== 'disconnect-account' ||
          existing.target_id !== record.accountId ||
          existing.confirmation_id !== record.confirmationId ||
          existing.result_code !== 'confirmed' ||
          existing.created_at !== record.confirmedAt) {
        throw new Error('Disconnect audit identifier cannot be rebound.')
      }
    }
  }
}
