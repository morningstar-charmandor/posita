import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { SecretName, SecretVault } from '../../application/secretVault'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteDeleteLocalDataRecoveryActions } from './sqliteDeleteLocalDataRecoveryActions'

class MemoryVault implements SecretVault {
  readonly values = new Map<SecretName, string>()
  async set(name: SecretName, value: string): Promise<void> { this.values.set(name, value) }
  async get(name: SecretName): Promise<string | undefined> { return this.values.get(name) }
  async delete(name: SecretName): Promise<boolean> { return this.values.delete(name) }
  async deleteGoogleRefreshTokens(): Promise<number> {
    let deleted = 0
    for (const name of [...this.values.keys()]) {
      if (name.startsWith('oauth.google.') && name.endsWith('.refresh-token')) {
        if (this.values.delete(name)) deleted += 1
      }
    }
    return deleted
  }
}

const openDatabases: DatabaseSync[] = []

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('SqliteDeleteLocalDataRecoveryActions', () => {
  it('deletes and sanitizes private state without loading an encryption key', async () => {
    const database = openPositaDatabase(':memory:')
    openDatabases.push(database)
    applyMigrations(database)
    database.prepare(`
      INSERT INTO encrypted_account_records (
        record_type, account_scope, envelope_scheme, payload, created_at, updated_at
      ) VALUES ('provider-account', 'work', 'aes-256-gcm-v1', ?, datetime('now'), datetime('now'))
    `).run(Buffer.from('opaque-account'))
    database.prepare(`
      INSERT INTO encrypted_records (
        record_type, record_id, account_scope, position, envelope_scheme, payload,
        created_at, updated_at
      ) VALUES ('message', 'message-1', 'work', 0, 'aes-256-gcm-v1', ?,
        datetime('now'), datetime('now'))
    `).run(Buffer.from('opaque-mail'))
    const vault = new MemoryVault()
    vault.values.set('oauth.google.work.refresh-token', 'refresh')
    vault.values.set('cache.installation.data-key-v1', 'key')
    let keyDeleteCalls = 0
    const actions = new SqliteDeleteLocalDataRecoveryActions(database, vault, {
      delete: async () => {
        keyDeleteCalls += 1
        return vault.delete('cache.installation.data-key-v1')
      }
    })

    await actions.deleteRefreshCredentials()
    actions.deleteAccountState()
    actions.deleteMailRecords()
    actions.sanitizeStorage()
    await actions.eraseDataKey()

    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_account_records').get())
      .toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_records').get())
      .toEqual({ count: 0 })
    expect(database.prepare('SELECT status FROM encrypted_cache_state WHERE id = 1').get())
      .toEqual({ status: 'ready' })
    expect(vault.values.size).toBe(0)
    expect(keyDeleteCalls).toBe(1)
  })
})
