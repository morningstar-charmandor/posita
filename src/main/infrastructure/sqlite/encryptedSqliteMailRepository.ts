import type { DatabaseSync } from 'node:sqlite'
import type {
  Account,
  BriefItem,
  MailDataset,
  Message,
  Person,
  Topic
} from '../../../shared/domain'
import { isMailDataset } from '../../../shared/validation'
import {
  EncryptedCacheError,
  type CacheRecordContext,
  type CacheRecordProtector
} from '../../application/encryptedCache'
import { RepositoryError, type MutableMailRepository } from '../../application/mailRepository'
import { applyMigrations } from './migrations'

export type EncryptedRecordType = 'account' | 'person' | 'message' | 'topic' | 'brief-item'

interface PreparedRecord {
  context: CacheRecordContext & { recordType: EncryptedRecordType }
  envelopeScheme: string
  payload: Uint8Array
}

interface EncryptedRecordRow {
  record_type: string
  record_id: string
  account_scope: string | null
  position: number
  envelope_scheme: string
  payload: Uint8Array
}

interface CountRow {
  count: number
}

const recordsFor = <T extends { id: string }>(
  recordType: EncryptedRecordType,
  values: readonly T[],
  accountScope: (value: T) => string | undefined,
  protector: CacheRecordProtector
): PreparedRecord[] => values.map((value, position) => {
  const context: PreparedRecord['context'] = {
    recordType,
    recordId: value.id,
    accountScope: accountScope(value),
    position
  }
  return {
    context,
    envelopeScheme: protector.scheme,
    payload: protector.protect(context, JSON.stringify(value))
  }
})

export const prepareEncryptedDataset = (
  dataset: MailDataset,
  protector: CacheRecordProtector
): PreparedRecord[] => [
  ...recordsFor('account', dataset.accounts, (account) => account.id, protector),
  ...recordsFor('person', dataset.people, () => undefined, protector),
  ...recordsFor('message', dataset.messages, (message) => message.accountId, protector),
  ...recordsFor('topic', dataset.topics, () => undefined, protector),
  ...recordsFor('brief-item', dataset.briefItems, (item) => item.accountId, protector)
]

export const insertEncryptedRecords = (
  database: DatabaseSync,
  records: readonly PreparedRecord[]
): void => {
  const insert = database.prepare(`
    INSERT INTO encrypted_records (
      record_type, record_id, account_scope, position, envelope_scheme, payload,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `)

  for (const record of records) {
    insert.run(
      record.context.recordType,
      record.context.recordId,
      record.context.accountScope ?? null,
      record.context.position,
      record.envelopeScheme,
      Buffer.from(record.payload)
    )
  }
}

export const countEncryptedRecords = (database: DatabaseSync): number => {
  const row = database.prepare('SELECT COUNT(*) AS count FROM encrypted_records')
    .get() as unknown as CountRow
  return row.count
}

const cacheFailure = (message: string, cause: unknown): RepositoryError =>
  new RepositoryError('DATABASE_OPERATION_FAILED', message, { cause })

const parsePayload = (
  row: EncryptedRecordRow,
  protector: CacheRecordProtector
): unknown => {
  if (!Number.isSafeInteger(row.position) || row.position < 0 ||
      (row.account_scope !== null && typeof row.account_scope !== 'string')) {
    throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'Cache record metadata is invalid.')
  }
  if (row.envelope_scheme !== protector.scheme) {
    throw new EncryptedCacheError('CACHE_ENVELOPE_INVALID', 'Cache envelope scheme is unsupported.')
  }
  const plaintext = protector.unprotect({
    recordType: row.record_type,
    recordId: row.record_id,
    accountScope: row.account_scope ?? undefined,
    position: row.position
  }, row.payload)
  try {
    return JSON.parse(plaintext) as unknown
  } catch (error) {
    throw new EncryptedCacheError(
      'CACHE_RECORD_INVALID',
      'Decrypted cache data is not valid JSON.',
      { cause: error }
    )
  }
}

export class EncryptedSqliteMailRepository implements MutableMailRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly protector: CacheRecordProtector
  ) {}

  initialize(): void {
    applyMigrations(this.database)
  }

  seedIfEmpty(dataset: MailDataset): boolean {
    try {
      if (countEncryptedRecords(this.database) > 0) return false
      const records = prepareEncryptedDataset(dataset, this.protector)

      this.database.exec('BEGIN IMMEDIATE')
      try {
        insertEncryptedRecords(this.database, records)
        this.database.prepare(`
          INSERT INTO encrypted_cache_state (id, status, updated_at)
          VALUES (1, 'ready', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET status = 'ready', updated_at = datetime('now')
        `).run()
        this.database.exec('COMMIT')
        return true
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw cacheFailure('Failed to seed the encrypted local mail cache.', error)
    }
  }

  loadDataset(): MailDataset {
    try {
      const rows = this.database.prepare(`
        SELECT record_type, record_id, account_scope, position, envelope_scheme, payload
        FROM encrypted_records ORDER BY record_type, position
      `).all() as unknown as EncryptedRecordRow[]

      const accounts: Account[] = []
      const people: Person[] = []
      const messages: Message[] = []
      const topics: Topic[] = []
      const briefItems: BriefItem[] = []

      for (const row of rows) {
        const value = parsePayload(row, this.protector)
        switch (row.record_type) {
          case 'account': accounts.push(value as Account); break
          case 'person': people.push(value as Person); break
          case 'message': messages.push(value as Message); break
          case 'topic': topics.push(value as Topic); break
          case 'brief-item': briefItems.push(value as BriefItem); break
          default:
            throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'Cache record type is invalid.')
        }
      }

      const dataset: MailDataset = { accounts, people, messages, topics, briefItems }
      if (!isMailDataset(dataset)) {
        throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'Cache data failed domain validation.')
      }
      return dataset
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw cacheFailure('Failed to load the encrypted local mail cache.', error)
    }
  }

  replaceDataset(dataset: MailDataset): void {
    try {
      if (!isMailDataset(dataset)) {
        throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'Replacement cache data is invalid.')
      }
      const records = prepareEncryptedDataset(dataset, this.protector)
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec('DELETE FROM encrypted_records')
        insertEncryptedRecords(this.database, records)
        this.database.prepare(`
          INSERT INTO encrypted_cache_state (id, status, updated_at)
          VALUES (1, 'sanitization-pending', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            status = 'sanitization-pending', updated_at = datetime('now')
        `).run()
        this.database.exec('COMMIT')
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
      sanitizeSqliteStorage(this.database)
      this.database.prepare(`
        UPDATE encrypted_cache_state
        SET status = 'ready', updated_at = datetime('now') WHERE id = 1
      `).run()
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw cacheFailure('Failed to replace the encrypted local mail cache.', error)
    }
  }

  deleteAll(): void {
    try {
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec('DELETE FROM encrypted_records')
        this.database.prepare(`
          INSERT INTO encrypted_cache_state (id, status, updated_at)
          VALUES (1, 'ready', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET status = 'ready', updated_at = datetime('now')
        `).run()
        this.database.exec('COMMIT')
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
      sanitizeSqliteStorage(this.database)
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw cacheFailure('Failed to delete the encrypted local mail cache.', error)
    }
  }

  close(): void {
    this.protector.destroy()
    if (this.database.isOpen) this.database.close()
  }
}

export const sanitizeSqliteStorage = (database: DatabaseSync): void => {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  database.exec('VACUUM')
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
}
