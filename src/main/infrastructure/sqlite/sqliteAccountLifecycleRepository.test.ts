import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AccountLifecycleError,
  type DisconnectAccountOperationV1,
  type LifecycleOperationV1
} from '../../application/accountLifecycle'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteAccountLifecycleRepository } from './sqliteAccountLifecycleRepository'

const openDatabases: DatabaseSync[] = []

const createRepository = () => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  applyMigrations(database)
  return { database, repository: new SqliteAccountLifecycleRepository(database) }
}

const disconnectOperation = (): DisconnectAccountOperationV1 => ({
  version: 1,
  operationId: 'disconnect-work-1',
  operationType: 'disconnect-account',
  accountId: 'work',
  phase: 'revocation-pending'
})

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('SqliteAccountLifecycleRepository', () => {
  it('persists only an opaque resumable disconnect marker', () => {
    const { database, repository } = createRepository()
    const operation = disconnectOperation()

    repository.save(operation)

    expect(repository.load(operation.operationId)).toEqual(operation)
    expect(database.prepare(`
      SELECT operation_id, operation_type, account_scope, phase, last_error_code
      FROM account_lifecycle_operations
    `).get()).toEqual({
      operation_id: 'disconnect-work-1',
      operation_type: 'disconnect-account',
      account_scope: 'work',
      phase: 'revocation-pending',
      last_error_code: null
    })
  })

  it('updates the current phase and safe retry error idempotently', () => {
    const { repository } = createRepository()
    repository.save(disconnectOperation())
    repository.save({
      ...disconnectOperation(),
      phase: 'credential-delete-pending',
      lastErrorCode: 'CREDENTIAL_DELETE_FAILED'
    })

    expect(repository.load('disconnect-work-1')).toEqual({
      ...disconnectOperation(),
      phase: 'credential-delete-pending',
      lastErrorCode: 'CREDENTIAL_DELETE_FAILED'
    })

    repository.save({ ...disconnectOperation(), phase: 'account-state-delete-pending' })
    expect(repository.load('disconnect-work-1')).toEqual({
      ...disconnectOperation(),
      phase: 'account-state-delete-pending'
    })
  })

  it('lists only incomplete account and installation operations', () => {
    const { repository } = createRepository()
    repository.save(disconnectOperation())
    repository.save({
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'data-key-delete-pending'
    })
    repository.save({
      version: 1,
      operationId: 'disconnect-personal-1',
      operationType: 'disconnect-account',
      accountId: 'personal',
      phase: 'completed'
    })

    expect(repository.listPending()).toEqual([
      {
        version: 1,
        operationId: 'delete-local-1',
        operationType: 'delete-local-data',
        phase: 'data-key-delete-pending'
      },
      disconnectOperation()
    ])
  })

  it('refuses to change the identity or account scope of an operation', () => {
    const { repository } = createRepository()
    repository.save(disconnectOperation())

    expect(() => repository.save({
      ...disconnectOperation(),
      accountId: 'personal'
    })).toThrowError(expect.objectContaining<Partial<AccountLifecycleError>>({
      code: 'INVALID_LIFECYCLE_STATE'
    }))
    expect(repository.load('disconnect-work-1')).toEqual(disconnectOperation())
  })

  it('deletes journal entries only after completion', () => {
    const { repository } = createRepository()
    repository.save(disconnectOperation())
    expect(repository.deleteCompleted('disconnect-work-1')).toBe(false)

    repository.save({ ...disconnectOperation(), phase: 'completed' })
    expect(repository.deleteCompleted('disconnect-work-1')).toBe(true)
    expect(repository.deleteCompleted('disconnect-work-1')).toBe(false)
  })

  it('rejects an operation-specific invalid phase before persistence', () => {
    const { database, repository } = createRepository()
    const invalid = {
      ...disconnectOperation(),
      phase: 'data-key-delete-pending'
    } as unknown as LifecycleOperationV1

    expect(() => repository.save(invalid)).toThrowError(
      expect.objectContaining<Partial<AccountLifecycleError>>({
        code: 'INVALID_LIFECYCLE_STATE'
      })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM account_lifecycle_operations').get())
      .toEqual({ count: 0 })
  })
})
