import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountConnectionRecoveryConfirmationRecordV1 } from '../../application/accountConnectionRecoveryConfirmation'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteAccountConnectionRecoveryConfirmationRepository } from './sqliteAccountConnectionRecoveryConfirmationRepository'

const databases: DatabaseSync[] = []
const record: AccountConnectionRecoveryConfirmationRecordV1 = {
  version: 1,
  confirmationId: 'confirmation-recovery-1',
  operationId: 'operation-recovery-1',
  action: 'discard-orphaned-local-connection-state',
  accountId: 'account-work-1',
  expectedStatus: 'credential-only',
  confirmedAt: '2026-08-28T12:00:00.000Z',
  expiresAt: '2026-08-28T12:05:00.000Z'
}

const createRepository = () => {
  const database = openPositaDatabase(':memory:')
  databases.push(database)
  applyMigrations(database)
  return { database, repository: new SqliteAccountConnectionRecoveryConfirmationRepository(database) }
}

afterEach(() => {
  for (const database of databases.splice(0)) if (database.isOpen) database.close()
})

describe('SqliteAccountConnectionRecoveryConfirmationRepository', () => {
  it('persists only bounded account recovery metadata and is idempotent', () => {
    const { database, repository } = createRepository()
    repository.save(record)
    repository.save(record)
    expect(repository.load(record.confirmationId)).toEqual(record)
    expect(database.prepare('SELECT * FROM account_connection_recovery_confirmations').get())
      .toEqual({
        version: 1,
        confirmation_id: record.confirmationId,
        operation_id: record.operationId,
        action_type: record.action,
        account_scope: record.accountId,
        expected_status: record.expectedStatus,
        confirmed_at: record.confirmedAt,
        expires_at: record.expiresAt
      })
  })

  it('rejects identifier rebinding and invalid records', () => {
    const { repository } = createRepository()
    repository.save(record)
    expect(() => repository.save({ ...record, accountId: 'account-other-1' })).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED' })
    )
    expect(() => repository.save({ ...record, expiresAt: 'not-a-time' })).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED' })
    )
  })

  it('deletes only receipts strictly before the canonical boundary', () => {
    const { repository } = createRepository()
    repository.save(record)
    expect(repository.deleteExpired(record.expiresAt)).toBe(0)
    expect(repository.deleteExpired('2026-08-28T12:05:00.001Z')).toBe(1)
    expect(repository.load(record.confirmationId)).toBeUndefined()
    expect(() => repository.deleteExpired('tomorrow')).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED' })
    )
  })
})
