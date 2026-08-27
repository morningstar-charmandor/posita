import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LocalActionConfirmationError,
  type LocalActionConfirmationRecordV1
} from '../../application/localActionConfirmation'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteAccountLifecycleRepository } from './sqliteAccountLifecycleRepository'
import { SqliteLocalActionConfirmationRepository } from './sqliteLocalActionConfirmationRepository'

const openDatabases: DatabaseSync[] = []

const record = (): LocalActionConfirmationRecordV1 => ({
  version: 1,
  confirmationId: 'confirm-delete-1',
  operationId: 'delete-local-1',
  action: 'delete-local-data',
  confirmedAt: '2026-08-24T12:00:00.000Z',
  expiresAt: '2026-08-24T12:05:00.000Z'
})

const createRepository = () => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  applyMigrations(database)
  return {
    database,
    repository: new SqliteLocalActionConfirmationRepository(database)
  }
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('SqliteLocalActionConfirmationRepository', () => {
  it('persists only bounded non-sensitive confirmation metadata', () => {
    const { database, repository } = createRepository()

    repository.save(record())

    expect(repository.load('confirm-delete-1')).toEqual(record())
    expect(database.prepare('SELECT * FROM local_action_confirmations').get()).toEqual({
      version: 1,
      confirmation_id: 'confirm-delete-1',
      operation_id: 'delete-local-1',
      action_type: 'delete-local-data',
      confirmed_at: '2026-08-24T12:00:00.000Z',
      expires_at: '2026-08-24T12:05:00.000Z'
    })
  })

  it('saves the identical record idempotently and rejects rebinding', () => {
    const { repository } = createRepository()
    repository.save(record())
    repository.save(record())

    expect(() => repository.save({
      ...record(),
      operationId: 'delete-local-2'
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_STORAGE_FAILED'
    }))
    expect(() => repository.save({
      ...record(),
      confirmationId: 'confirm-delete-2'
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_STORAGE_FAILED'
    }))
  })

  it('rejects invalid records before persistence and corrupted rows on load', () => {
    const { database, repository } = createRepository()
    expect(() => repository.save({
      ...record(),
      expiresAt: '2026-08-24T11:59:00.000Z'
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_STORAGE_FAILED'
    }))

    database.prepare(`
      INSERT INTO local_action_confirmations (
        version, confirmation_id, operation_id, action_type, confirmed_at, expires_at
      ) VALUES (1, 'confirm-bad-1', 'delete-bad-1', 'delete-local-data', ?, ?)
    `).run('not-a-time', 'still-not-a-time')
    expect(() => repository.load('confirm-bad-1')).toThrowError(
      expect.objectContaining<Partial<LocalActionConfirmationError>>({
        code: 'CONFIRMATION_STORAGE_FAILED'
      })
    )
  })

  it('deletes only receipts strictly before the cleanup boundary', () => {
    const { repository } = createRepository()
    repository.save(record())

    expect(repository.deleteExpiredWithoutPendingOperation(
      '2026-08-24T12:05:00.000Z'
    )).toBe(0)
    expect(repository.load('confirm-delete-1')).toEqual(record())
    expect(repository.deleteExpiredWithoutPendingOperation(
      '2026-08-24T12:05:00.001Z'
    )).toBe(1)
    expect(repository.load('confirm-delete-1')).toBeUndefined()
    expect(repository.deleteExpiredWithoutPendingOperation(
      '2026-08-24T12:05:00.001Z'
    )).toBe(0)
  })

  it('preserves an expired receipt until its deletion operation completes', () => {
    const { database, repository } = createRepository()
    const lifecycle = new SqliteAccountLifecycleRepository(database)
    repository.save(record())
    lifecycle.save({
      version: 1,
      operationId: record().operationId,
      operationType: 'delete-local-data',
      phase: 'mail-data-delete-pending'
    })

    expect(repository.deleteExpiredWithoutPendingOperation(
      '2026-08-24T12:05:00.001Z'
    )).toBe(0)
    lifecycle.save({
      version: 1,
      operationId: record().operationId,
      operationType: 'delete-local-data',
      phase: 'completed'
    })
    expect(repository.deleteExpiredWithoutPendingOperation(
      '2026-08-24T12:05:00.001Z'
    )).toBe(1)
  })

  it('rejects a non-canonical cleanup boundary before deletion', () => {
    const { repository } = createRepository()
    repository.save(record())

    expect(() => repository.deleteExpiredWithoutPendingOperation('tomorrow')).toThrowError(
      expect.objectContaining<Partial<LocalActionConfirmationError>>({
        code: 'CONFIRMATION_STORAGE_FAILED'
      })
    )
    expect(repository.load('confirm-delete-1')).toEqual(record())
  })
})
