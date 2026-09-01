import { describe, expect, it } from 'vitest'
import { fixtures } from '../../../shared/fixtures'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector'
import { EncryptedSqliteMailRepository } from './encryptedSqliteMailRepository'
import { openPositaDatabase } from './database'
import { applyMigrations, CURRENT_SCHEMA_VERSION } from './migrations'
import { SqliteMailDataModeRepository } from './sqliteMailDataModeRepository'

const setup = () => {
  const database = openPositaDatabase(':memory:')
  applyMigrations(database)
  const mail = new EncryptedSqliteMailRepository(
    database,
    new AesGcmCacheProtector(Uint8Array.from({ length: 32 }, (_, index) => index + 1))
  )
  mail.seedIfEmpty(fixtures)
  return { database, mail, mode: new SqliteMailDataModeRepository(database) }
}

describe('SqliteMailDataModeRepository', () => {
  it('migrates installations into explicit sample mode', () => {
    const { database, mail, mode } = setup()

    expect(CURRENT_SCHEMA_VERSION).toBe(10)
    expect(mode.load()).toEqual({ version: 1, mode: 'sample' })
    mail.close()
  })

  it('atomically removes only sample records and activates durable live mode', () => {
    const { database, mail, mode } = setup()
    database.prepare(`
      INSERT INTO encrypted_provider_mail_records (
        record_type, record_id, account_scope, envelope_scheme, payload, created_at, updated_at
      ) VALUES ('provider-message', 'remote-1', 'work', 'test-only', ?, datetime('now'), datetime('now'))
    `).run(Buffer.from('opaque-test-ciphertext'))

    expect(mode.activateLive()).toEqual({ changed: true, sanitizationRequired: true })
    expect(mode.load()).toEqual({ version: 1, mode: 'live' })
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_records').get())
      .toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_provider_mail_records').get())
      .toEqual({ count: 1 })
    expect(database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get())
      .toEqual({ status: 'sanitization-pending' })
    mail.close()
  })

  it('never reverses live mode or repeats logical sample deletion', () => {
    const { mail, mode } = setup()
    mode.activateLive()

    expect(mode.activateLive()).toEqual({ changed: false, sanitizationRequired: true })
    expect(mode.load().mode).toBe('live')
    mail.close()
  })

  it('rolls sample deletion back when the mode commit fails', () => {
    const { database, mail, mode } = setup()
    database.exec(`
      CREATE TRIGGER test_fail_live_mode
      BEFORE UPDATE ON mail_data_mode_state
      BEGIN
        SELECT RAISE(ABORT, 'test-only mode write failure');
      END;
    `)

    expect(() => mode.activateLive()).toThrow()
    expect(mode.load()).toEqual({ version: 1, mode: 'sample' })
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_records').get())
      .toEqual({ count: 21 })
    mail.close()
  })
})
