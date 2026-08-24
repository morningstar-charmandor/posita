import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CACHE_DATA_KEY_NAME,
  googleRefreshTokenName,
  MAX_SECRET_LENGTH,
  SecretVaultError
} from '../../application/secretVault'
import { DeterministicFakeStringProtector } from '../security/deterministicFakeStringProtector'
import type { StringProtector } from '../security/stringProtector'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { SqliteSecretVault } from './sqliteSecretVault'

const openDatabases: DatabaseSync[] = []

const createVault = (protector: StringProtector = new DeterministicFakeStringProtector()) => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  applyMigrations(database)
  return { database, vault: new SqliteSecretVault(database, protector) }
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('SqliteSecretVault', () => {
  it('round-trips, replaces, and deletes a protected credential', async () => {
    const { vault } = createVault()
    const name = googleRefreshTokenName('personal')

    expect(await vault.get(name)).toBeUndefined()
    await vault.set(name, 'first-refresh-token')
    expect(await vault.get(name)).toBe('first-refresh-token')
    await vault.set(name, 'replacement-refresh-token')
    expect(await vault.get(name)).toBe('replacement-refresh-token')
    expect(await vault.delete(name)).toBe(true)
    expect(await vault.delete(name)).toBe(false)
    expect(await vault.get(name)).toBeUndefined()
  })

  it('never persists the credential value as plaintext', async () => {
    const { database, vault } = createVault()
    const name = googleRefreshTokenName('work')
    const secret = 'google-refresh-token-sensitive-value'

    await vault.set(name, secret)
    const row = database.prepare(`
      SELECT protection_scheme, ciphertext FROM protected_secrets WHERE name = ?
    `).get(name) as { protection_scheme: string; ciphertext: Uint8Array }

    expect(row.protection_scheme).toBe('deterministic-fake-v1')
    expect(Buffer.from(row.ciphertext).includes(Buffer.from(secret))).toBe(false)
  })

  it('deletes every Google refresh credential without deleting the cache key', async () => {
    const { vault } = createVault()
    const personal = googleRefreshTokenName('personal')
    const work = googleRefreshTokenName('work')
    await vault.set(personal, 'personal-token')
    await vault.set(work, 'work-token')
    await vault.set(CACHE_DATA_KEY_NAME, 'installation-key')

    expect(await vault.deleteGoogleRefreshTokens()).toBe(2)
    expect(await vault.deleteGoogleRefreshTokens()).toBe(0)
    expect(await vault.get(personal)).toBeUndefined()
    expect(await vault.get(work)).toBeUndefined()
    expect(await vault.get(CACHE_DATA_KEY_NAME)).toBe('installation-key')
  })

  it('does not write when the protector fails closed', async () => {
    const unavailableProtector: StringProtector = {
      scheme: 'unavailable-v1',
      protect: async () => {
        throw new SecretVaultError('PROTECTION_UNAVAILABLE', 'Unavailable for test.')
      },
      unprotect: async () => {
        throw new SecretVaultError('PROTECTION_UNAVAILABLE', 'Unavailable for test.')
      }
    }
    const { database, vault } = createVault(unavailableProtector)

    await expect(vault.set(googleRefreshTokenName('work'), 'must-not-persist')).rejects.toEqual(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'PROTECTION_UNAVAILABLE' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM protected_secrets').get())
      .toEqual({ count: 0 })
  })

  it('rejects empty and unbounded credential values before protection', async () => {
    const { database, vault } = createVault()
    const name = googleRefreshTokenName('work')

    await expect(vault.set(name, '')).rejects.toEqual(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'SECRET_STORAGE_FAILED' })
    )
    await expect(vault.set(name, 'x'.repeat(MAX_SECRET_LENGTH + 1))).rejects.toEqual(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'SECRET_STORAGE_FAILED' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM protected_secrets').get())
      .toEqual({ count: 0 })
  })

  it('rejects unsupported schemes before attempting decryption', async () => {
    const { database, vault } = createVault()
    const name = googleRefreshTokenName('work')
    database.prepare(`
      INSERT INTO protected_secrets (
        name, protection_scheme, ciphertext, created_at, updated_at
      ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(name, 'future-scheme-v9', Buffer.from('opaque'))

    await expect(vault.get(name)).rejects.toEqual(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'SECRET_CORRUPTED' })
    )
  })
})
