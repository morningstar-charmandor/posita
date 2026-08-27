import type { DatabaseSync } from 'node:sqlite'
import type { StorageSanitizer } from '../../application/storageSanitizer.ts'
import { RepositoryError } from '../../application/mailRepository.ts'

const sanitizationFailure = (cause: unknown): RepositoryError =>
  new RepositoryError(
    'DATABASE_OPERATION_FAILED',
    'Failed to sanitize encrypted local mail storage.',
    { cause }
  )

export const sanitizeSqliteStorage = (database: DatabaseSync): void => {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  database.exec('VACUUM')
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
}

export const completeEncryptedCacheSanitization = (database: DatabaseSync): void => {
  try {
    sanitizeSqliteStorage(database)
    database.prepare(`
      UPDATE encrypted_cache_state
      SET status = 'ready', updated_at = datetime('now') WHERE id = 1
    `).run()
  } catch (error) {
    if (error instanceof RepositoryError) throw error
    throw sanitizationFailure(error)
  }
}

/** Bounded test and legacy-fixture adapter. File-backed production uses a worker. */
export class InlineSqliteStorageSanitizer implements StorageSanitizer {
  private readonly database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.database = database
  }

  async sanitize(): Promise<void> {
    completeEncryptedCacheSanitization(this.database)
  }
}
