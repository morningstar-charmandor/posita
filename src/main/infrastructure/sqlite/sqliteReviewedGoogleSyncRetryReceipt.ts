import type { DatabaseSync } from 'node:sqlite'
import { isAccountId } from '../../application/accountState'

// One reviewed correction, one installation-wide dispatch. Never a random/replenished ID.
export const REVIEWED_GMAIL_READ_RECEIPT = 'gmail-read-review-7766702'

export class SqliteReviewedGoogleSyncRetryReceipt {
  constructor(private readonly database: DatabaseSync, private readonly now: () => Date) {}

  available(): boolean {
    return this.database.prepare('SELECT id FROM audit_events WHERE id = ?')
      .get(REVIEWED_GMAIL_READ_RECEIPT) === undefined
  }

  consume(accountId: string): boolean {
    if (!isAccountId(accountId)) return false
    const confirmedAt = this.now().toISOString()
    const result = this.database.prepare(`
      INSERT INTO audit_events (id, command_type, target_id, confirmation_id, result_code, created_at)
      VALUES (?, 'reviewed-google-sync-retry', ?, ?, 'consumed-before-dispatch', ?)
      ON CONFLICT(id) DO NOTHING
    `).run(REVIEWED_GMAIL_READ_RECEIPT, accountId, REVIEWED_GMAIL_READ_RECEIPT, confirmedAt)
    return Number(result.changes) === 1
  }
}
