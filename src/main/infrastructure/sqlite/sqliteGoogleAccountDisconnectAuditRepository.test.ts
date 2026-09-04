import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { applyMigrations } from './migrations'
import { SqliteGoogleAccountDisconnectAuditRepository } from './sqliteGoogleAccountDisconnectAuditRepository'

describe('SqliteGoogleAccountDisconnectAuditRepository', () => {
  it('stores only opaque confirmation evidence and is idempotent', () => {
    const database = new DatabaseSync(':memory:')
    applyMigrations(database)
    const repository = new SqliteGoogleAccountDisconnectAuditRepository(database)
    const record = {
      version: 1 as const,
      confirmationId: 'confirmation-1',
      operationId: 'operation-1',
      accountId: 'account-1',
      confirmedAt: '2026-09-03T12:00:00.000Z'
    }
    repository.save(record)
    repository.save(record)

    expect(database.prepare(`
      SELECT command_type, target_id, confirmation_id, result_code
      FROM audit_events
    `).all()).toEqual([{
      command_type: 'disconnect-account',
      target_id: 'account-1',
      confirmation_id: 'confirmation-1',
      result_code: 'confirmed'
    }])
    database.close()
  })
})
