import { afterEach, describe, expect, it } from 'vitest'
import { fixtures } from '../../../shared/fixtures'
import { RepositoryError } from '../../application/mailRepository'
import { openPositaDatabase } from './database'
import { applyMigrations, CURRENT_SCHEMA_VERSION, getSchemaVersion } from './migrations'
import { SqliteMailRepository } from './sqliteMailRepository'

const openRepositories: SqliteMailRepository[] = []

const createRepository = (): SqliteMailRepository => {
  const repository = new SqliteMailRepository(openPositaDatabase(':memory:'))
  openRepositories.push(repository)
  return repository
}

afterEach(() => {
  for (const repository of openRepositories.splice(0)) repository.close()
})

describe('SQLite migrations', () => {
  it('applies the current schema once and remains idempotent', () => {
    const database = openPositaDatabase(':memory:')
    const repository = new SqliteMailRepository(database)
    openRepositories.push(repository)

    applyMigrations(database)
    applyMigrations(database)

    expect(getSchemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION)
    expect(database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
    `).all()).toEqual(expect.arrayContaining([
      { name: 'accounts' },
      { name: 'messages' },
      { name: 'derived_artifacts' },
      { name: 'audit_events' },
      { name: 'protected_secrets' }
    ]))
  })

  it('rejects a database created by a newer application version', () => {
    const database = openPositaDatabase(':memory:')
    const repository = new SqliteMailRepository(database)
    openRepositories.push(repository)
    applyMigrations(database)
    database.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, datetime('now'))
    `).run(CURRENT_SCHEMA_VERSION + 1, 'future_schema')

    expect(() => applyMigrations(database)).toThrowError(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'MIGRATION_UNSUPPORTED' })
    )
  })
})

describe('SqliteMailRepository', () => {
  it('seeds an empty database and reconstructs the complete domain dataset', () => {
    const repository = createRepository()
    repository.initialize()

    expect(repository.seedIfEmpty(fixtures)).toBe(true)
    expect(repository.loadDataset()).toEqual(fixtures)
  })

  it('does not duplicate seed data on subsequent starts', () => {
    const repository = createRepository()
    repository.initialize()

    expect(repository.seedIfEmpty(fixtures)).toBe(true)
    expect(repository.seedIfEmpty(fixtures)).toBe(false)
    expect(repository.loadDataset().messages).toHaveLength(fixtures.messages.length)
  })

  it('rolls back an invalid seed as one transaction', () => {
    const repository = createRepository()
    repository.initialize()
    const invalid = structuredClone(fixtures)
    invalid.messages[0]!.senderId = 'missing-person'

    expect(() => repository.seedIfEmpty(invalid)).toThrowError(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'DATABASE_OPERATION_FAILED' })
    )
    expect(repository.seedIfEmpty(fixtures)).toBe(true)
    expect(repository.loadDataset()).toEqual(fixtures)
  })

  it('maps closed-database reads to a repository error', () => {
    const repository = createRepository()
    repository.initialize()
    repository.close()

    expect(() => repository.loadDataset()).toThrowError(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'DATABASE_OPERATION_FAILED' })
    )
  })
})
