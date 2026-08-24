import type { DatabaseSync } from 'node:sqlite'
import { EncryptedCacheError, type CacheRecordProtector } from '../../application/encryptedCache'
import { SqliteMailRepository } from './sqliteMailRepository'
import {
  countEncryptedRecords,
  insertEncryptedRecords,
  prepareEncryptedDataset,
  sanitizeSqliteStorage
} from './encryptedSqliteMailRepository'

interface CountRow {
  count: number
}

interface StateRow {
  status: 'sanitization-pending' | 'ready'
}

const count = (database: DatabaseSync, table: string): number => {
  const allowed = new Set([
    'accounts',
    'sync_state',
    'derived_artifacts',
    'user_corrections',
    'audit_events'
  ])
  if (!allowed.has(table)) {
    throw new EncryptedCacheError('CACHE_MIGRATION_FAILED', 'Migration table is invalid.')
  }
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as unknown as CountRow
  return row.count
}

const state = (database: DatabaseSync): StateRow | undefined =>
  database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get() as
    StateRow | undefined

const completeSanitization = (database: DatabaseSync): void => {
  sanitizeSqliteStorage(database)
  database.prepare(`
    INSERT INTO encrypted_cache_state (id, status, updated_at)
    VALUES (1, 'ready', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET status = 'ready', updated_at = datetime('now')
  `).run()
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
}

const deleteLegacyRows = (database: DatabaseSync): void => {
  database.exec(`
    DELETE FROM brief_citations;
    DELETE FROM brief_items;
    DELETE FROM timeline_events;
    DELETE FROM topic_messages;
    DELETE FROM topic_participants;
    DELETE FROM topics;
    DELETE FROM messages;
    DELETE FROM people;
    DELETE FROM sync_state;
    DELETE FROM accounts;
  `)
}

export const migrateLegacyPlaintextCache = (
  database: DatabaseSync,
  protector: CacheRecordProtector
): boolean => {
  try {
    if (state(database)?.status === 'sanitization-pending') {
      completeSanitization(database)
    }

    const encryptedCount = countEncryptedRecords(database)
    const legacyAccountCount = count(database, 'accounts')
    if (encryptedCount > 0 && legacyAccountCount > 0) {
      throw new EncryptedCacheError(
        'CACHE_MIGRATION_FAILED',
        'Encrypted and legacy mail records coexist unexpectedly.'
      )
    }
    if (encryptedCount > 0 || legacyAccountCount === 0) return false

    for (const table of ['sync_state', 'derived_artifacts', 'user_corrections', 'audit_events']) {
      if (count(database, table) > 0) {
        throw new EncryptedCacheError(
          'CACHE_MIGRATION_FAILED',
          'Unexpected private data prevents automatic cache migration.'
        )
      }
    }

    const dataset = new SqliteMailRepository(database).loadDataset()
    const records = prepareEncryptedDataset(dataset, protector)

    database.exec('BEGIN IMMEDIATE')
    try {
      insertEncryptedRecords(database, records)
      deleteLegacyRows(database)
      database.prepare(`
        INSERT INTO encrypted_cache_state (id, status, updated_at)
        VALUES (1, 'sanitization-pending', datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          status = 'sanitization-pending', updated_at = datetime('now')
      `).run()
      database.exec('COMMIT')
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK')
      throw error
    }

    completeSanitization(database)
    return true
  } catch (error) {
    if (error instanceof EncryptedCacheError) throw error
    throw new EncryptedCacheError(
      'CACHE_MIGRATION_FAILED',
      'The legacy local mail cache could not be migrated safely.',
      { cause: error }
    )
  }
}
