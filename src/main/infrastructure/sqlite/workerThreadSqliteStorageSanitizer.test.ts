import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageSanitizationError } from '../../application/storageSanitizer'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { WorkerThreadSqliteStorageSanitizer } from './workerThreadSqliteStorageSanitizer'

const temporaryDirectories: string[] = []
const openDatabases: DatabaseSync[] = []

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('WorkerThreadSqliteStorageSanitizer', () => {
  it('sanitizes a file-backed cache in one shared in-flight worker operation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-sanitizer-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'posita.sqlite')
    const database = openPositaDatabase(databasePath)
    openDatabases.push(database)
    applyMigrations(database)
    const deletedMarker = `deleted-private-marker-${'x'.repeat(512)}`
    database.prepare(`
      INSERT INTO encrypted_records (
        record_type, record_id, account_scope, position, envelope_scheme, payload,
        created_at, updated_at
      ) VALUES ('message', 'deleted-message', 'work', 0, 'aes-256-gcm-v1', ?,
        datetime('now'), datetime('now'))
    `).run(Buffer.from(deletedMarker))
    database.prepare('DELETE FROM encrypted_records').run()
    database.prepare(`
      INSERT INTO encrypted_cache_state (id, status, updated_at)
      VALUES (1, 'sanitization-pending', datetime('now'))
    `).run()

    const sanitizer = new WorkerThreadSqliteStorageSanitizer(databasePath)
    const first = sanitizer.sanitize()
    const second = sanitizer.sanitize()

    expect(second).toBe(first)
    await first
    expect(database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get())
      .toEqual({ status: 'ready' })
    database.close()
    expect((await readFile(databasePath)).includes(Buffer.from(deletedMarker))).toBe(false)
  })

  it('returns a stable safe error when the worker cannot open the cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-sanitizer-failure-'))
    temporaryDirectories.push(directory)
    const sanitizer = new WorkerThreadSqliteStorageSanitizer(
      join(directory, 'missing-parent', 'posita.sqlite')
    )

    await expect(sanitizer.sanitize()).rejects.toMatchObject({
      name: 'StorageSanitizationError',
      code: 'STORAGE_SANITIZATION_FAILED',
      message: 'Posita could not sanitize local storage.'
    })
  })

  it('rejects an in-memory database because workers require a file boundary', () => {
    expect(() => new WorkerThreadSqliteStorageSanitizer(':memory:'))
      .toThrow(StorageSanitizationError)
  })
})
