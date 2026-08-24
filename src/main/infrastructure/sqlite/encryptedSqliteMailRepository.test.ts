import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtures } from '../../../shared/fixtures'
import { RepositoryError } from '../../application/mailRepository'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector'
import { openPositaDatabase } from './database'
import { migrateLegacyPlaintextCache } from './encryptedCacheMigration'
import {
  countEncryptedRecords,
  EncryptedSqliteMailRepository
} from './encryptedSqliteMailRepository'
import { SqliteMailRepository } from './sqliteMailRepository'

const testKey = Uint8Array.from({ length: 32 }, (_, index) => index * 3 + 1)
const openDatabases: DatabaseSync[] = []
const temporaryDirectories: string[] = []

const nonceSource = () => {
  let counter = 0
  return (size: number): Uint8Array => {
    counter += 1
    return Uint8Array.from({ length: size }, (_, index) => (counter * 17 + index) % 256)
  }
}

const createProtector = () => new AesGcmCacheProtector(testKey, nonceSource())

const createInMemoryRepository = () => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  const repository = new EncryptedSqliteMailRepository(database, createProtector())
  repository.initialize()
  return { database, repository }
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('EncryptedSqliteMailRepository', () => {
  it('seeds and reconstructs the dataset exclusively through encrypted records', () => {
    const { database, repository } = createInMemoryRepository()

    expect(repository.seedIfEmpty(fixtures)).toBe(true)
    expect(repository.seedIfEmpty(fixtures)).toBe(false)
    expect(repository.loadDataset()).toEqual(fixtures)

    const payloads = database.prepare('SELECT payload FROM encrypted_records').all() as
      { payload: Uint8Array }[]
    const rawPayload = Buffer.concat(payloads.map((row) => Buffer.from(row.payload)))
    for (const privateValue of [
      fixtures.accounts[0]!.address,
      fixtures.people[0]!.email,
      fixtures.messages[0]!.subject,
      fixtures.messages[0]!.body,
      fixtures.topics[0]!.summary
    ]) {
      expect(rawPayload.includes(Buffer.from(privateValue))).toBe(false)
    }
  })

  it('fails safely when ciphertext or bound metadata is modified', () => {
    const { database, repository } = createInMemoryRepository()
    repository.seedIfEmpty(fixtures)
    const row = database.prepare(`
      SELECT record_type, record_id, payload FROM encrypted_records
      WHERE record_type = 'message' ORDER BY position LIMIT 1
    `).get() as { record_type: string; record_id: string; payload: Uint8Array }
    const payload = Buffer.from(row.payload)
    payload[payload.length - 1] = payload[payload.length - 1]! ^ 0xff
    database.prepare(`
      UPDATE encrypted_records SET payload = ?
      WHERE record_type = ? AND record_id = ?
    `).run(payload, row.record_type, row.record_id)

    expect(() => repository.loadDataset()).toThrowError(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'DATABASE_OPERATION_FAILED' })
    )
  })

  it('authenticates queryable metadata as part of each envelope', () => {
    const { database, repository } = createInMemoryRepository()
    repository.seedIfEmpty(fixtures)
    database.prepare(`
      UPDATE encrypted_records SET account_scope = 'substituted-account'
      WHERE record_type = 'message' AND position = 0
    `).run()

    expect(() => repository.loadDataset()).toThrowError(
      expect.objectContaining<Partial<RepositoryError>>({ code: 'DATABASE_OPERATION_FAILED' })
    )
  })

  it('purges all encrypted records and remains an empty valid cache', () => {
    const { database, repository } = createInMemoryRepository()
    repository.seedIfEmpty(fixtures)

    repository.deleteAll()

    expect(countEncryptedRecords(database)).toBe(0)
    expect(repository.loadDataset()).toEqual({
      accounts: [], people: [], messages: [], topics: [], briefItems: []
    })
  })
})

describe('legacy plaintext cache migration', () => {
  it('encrypts existing fixtures transactionally and scrubs SQLite files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-encrypted-cache-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'posita.sqlite3')
    const database = openPositaDatabase(databasePath)
    openDatabases.push(database)
    const legacyRepository = new SqliteMailRepository(database)
    legacyRepository.initialize()
    legacyRepository.seedIfEmpty(fixtures)
    const protector = createProtector()

    expect(migrateLegacyPlaintextCache(database, protector)).toBe(true)
    const repository = new EncryptedSqliteMailRepository(database, protector)
    expect(repository.loadDataset()).toEqual(fixtures)
    expect(database.prepare('SELECT COUNT(*) AS count FROM accounts').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get())
      .toEqual({ status: 'ready' })

    repository.close()
    const index = openDatabases.indexOf(database)
    if (index >= 0) openDatabases.splice(index, 1)

    const storageFiles = (await readdir(directory))
      .filter((name) => name.startsWith('posita.sqlite3'))
    expect(storageFiles.length).toBeGreaterThan(0)
    const contents = Buffer.concat(await Promise.all(
      storageFiles.map((name) => readFile(join(directory, name)))
    ))
    for (const privateValue of [
      fixtures.accounts[0]!.address,
      fixtures.people[0]!.email,
      fixtures.messages[0]!.subject,
      fixtures.messages[0]!.body,
      fixtures.topics[0]!.summary
    ]) {
      expect(contents.includes(Buffer.from(privateValue))).toBe(false)
    }
  })

  it('refuses to discard unexpected forward-looking private data', () => {
    const database = openPositaDatabase(':memory:')
    openDatabases.push(database)
    const legacyRepository = new SqliteMailRepository(database)
    legacyRepository.initialize()
    legacyRepository.seedIfEmpty(fixtures)
    database.prepare(`
      INSERT INTO audit_events (
        id, command_type, target_id, confirmation_id, result_code, created_at
      ) VALUES ('audit-1', 'test', 'target-1', 'confirm-1', 'ok', datetime('now'))
    `).run()

    expect(() => migrateLegacyPlaintextCache(database, createProtector())).toThrowError(
      expect.objectContaining<Partial<Error>>({ name: 'EncryptedCacheError' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM accounts').get())
      .toEqual({ count: fixtures.accounts.length })
    expect(countEncryptedRecords(database)).toBe(0)
  })

  it('resumes an interrupted post-migration sanitization step', () => {
    const database = openPositaDatabase(':memory:')
    openDatabases.push(database)
    const repository = new EncryptedSqliteMailRepository(database, createProtector())
    repository.initialize()
    repository.seedIfEmpty(fixtures)
    database.prepare(`
      UPDATE encrypted_cache_state
      SET status = 'sanitization-pending', updated_at = datetime('now')
      WHERE id = 1
    `).run()

    expect(migrateLegacyPlaintextCache(database, createProtector())).toBe(false)
    expect(database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get())
      .toEqual({ status: 'ready' })
  })

  it('removes deleted ciphertext from compacted database and sidecar files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'posita-encrypted-delete-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'posita.sqlite3')
    const database = openPositaDatabase(databasePath)
    openDatabases.push(database)
    const repository = new EncryptedSqliteMailRepository(database, createProtector())
    repository.initialize()
    repository.seedIfEmpty(fixtures)
    const stored = database.prepare(`
      SELECT payload FROM encrypted_records
      WHERE record_type = 'message' AND position = 0
    `).get() as unknown as { payload: Uint8Array }
    const deletedCiphertext = Buffer.from(stored.payload)

    repository.deleteAll()
    repository.close()
    const index = openDatabases.indexOf(database)
    if (index >= 0) openDatabases.splice(index, 1)

    const storageFiles = (await readdir(directory))
      .filter((name) => name.startsWith('posita.sqlite3'))
    const contents = Buffer.concat(await Promise.all(
      storageFiles.map((name) => readFile(join(directory, name)))
    ))
    expect(contents.includes(deletedCiphertext)).toBe(false)
  })
})
