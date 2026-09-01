import type { DatabaseSync } from 'node:sqlite'
import {
  MailDataModeError,
  type MailDataModeRepository,
  type MailDataModeStateV1,
  type MailDataModeTransitionV1
} from '../../application/mailDataMode'
import { isEncryptedCacheSanitizationPending } from './sqliteSanitization'

interface ModeRow {
  version: unknown
  mode: unknown
}

const storageFailure = (message: string, cause?: unknown): MailDataModeError =>
  new MailDataModeError(
    'MAIL_DATA_MODE_STORAGE_FAILED',
    message,
    true,
    cause === undefined ? undefined : { cause }
  )

export class SqliteMailDataModeRepository implements MailDataModeRepository {
  constructor(private readonly database: DatabaseSync) {}

  load(): MailDataModeStateV1 {
    try {
      const row = this.database.prepare(`
        SELECT version, mode FROM mail_data_mode_state WHERE id = 1
      `).get() as ModeRow | undefined
      if (row?.version !== 1 || (row.mode !== 'sample' && row.mode !== 'live')) {
        throw storageFailure('The local mail mode is missing or invalid.')
      }
      return { version: 1, mode: row.mode }
    } catch (error) {
      if (error instanceof MailDataModeError) throw error
      throw storageFailure('Failed to load the local mail mode.', error)
    }
  }

  activateLive(): MailDataModeTransitionV1 {
    try {
      this.database.exec('BEGIN IMMEDIATE')
      try {
        const current = this.load()
        if (current.mode === 'sample') {
          this.database.exec('DELETE FROM encrypted_records')
          this.database.prepare(`
            UPDATE mail_data_mode_state
            SET mode = 'live', updated_at = datetime('now')
            WHERE id = 1 AND version = 1 AND mode = 'sample'
          `).run()
          this.database.prepare(`
            INSERT INTO encrypted_cache_state (id, status, updated_at)
            VALUES (1, 'sanitization-pending', datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              status = 'sanitization-pending', updated_at = datetime('now')
          `).run()
          this.database.exec('COMMIT')
          return { changed: true, sanitizationRequired: true }
        }
        const sanitizationRequired = isEncryptedCacheSanitizationPending(this.database)
        this.database.exec('COMMIT')
        return { changed: false, sanitizationRequired }
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof MailDataModeError) throw error
      throw storageFailure('Failed to activate the live local mail mode.', error)
    }
  }
}

export const deleteMailDataModeState = (database: DatabaseSync): boolean => {
  try {
    return Number(database.prepare('DELETE FROM mail_data_mode_state').run().changes) > 0
  } catch (error) {
    throw storageFailure('Failed to delete the local mail mode.', error)
  }
}
