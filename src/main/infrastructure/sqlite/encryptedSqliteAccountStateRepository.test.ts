import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AccountStateError,
  type ProviderAccountRecordV2,
  type ProviderSyncStateV1
} from '../../application/accountState'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector'
import { openPositaDatabase } from './database'
import { EncryptedSqliteAccountStateRepository } from './encryptedSqliteAccountStateRepository'
import { applyMigrations } from './migrations'

const testKey = Uint8Array.from({ length: 32 }, (_, index) => index * 5 + 1)
const openDatabases: DatabaseSync[] = []

const nonceSource = () => {
  let counter = 0
  return (size: number): Uint8Array => {
    counter += 1
    return Uint8Array.from({ length: size }, (_, index) => (counter * 19 + index) % 256)
  }
}

const providerAccount = (accountId: string): ProviderAccountRecordV2 => ({
  version: 2,
  accountId,
  provider: 'google',
  providerAccountId: `google-sub-${accountId}`,
  displayIdentity: {
    mailboxAddress: `${accountId}@example.test`,
    displayLabel: accountId === 'work' ? 'Work' : 'Personal'
  },
  consentVersion: 'google-gmail-readonly-v1',
  connectedAt: '2026-08-24T10:00:00.000Z'
})

const syncState = (accountId: string): ProviderSyncStateV1 => ({
  version: 1,
  accountId,
  provider: 'google',
  status: 'idle',
  cursor: `cursor-${accountId}`,
  lastSuccessAt: '2026-08-24T10:30:00.000Z'
})

const createRepository = () => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  applyMigrations(database)
  const protector = new AesGcmCacheProtector(testKey, nonceSource())
  return {
    database,
    repository: new EncryptedSqliteAccountStateRepository(database, protector)
  }
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('EncryptedSqliteAccountStateRepository', () => {
  it('round-trips provider and sync state without plaintext payloads', () => {
    const { database, repository } = createRepository()
    const account = providerAccount('work')
    const state = syncState('work')

    repository.saveProviderAccount(account)
    repository.saveSyncState(state)

    expect(repository.loadProviderAccount('work')).toEqual(account)
    expect(repository.loadSyncState('work')).toEqual(state)
    const payloads = database.prepare(`
      SELECT payload FROM encrypted_account_records ORDER BY record_type
    `).all() as unknown as { payload: Uint8Array }[]
    const ciphertext = Buffer.concat(payloads.map((row) => Buffer.from(row.payload)))
    expect(ciphertext.includes(Buffer.from(account.providerAccountId))).toBe(false)
    expect(ciphertext.includes(Buffer.from(account.displayIdentity.mailboxAddress))).toBe(false)
    expect(ciphertext.includes(Buffer.from(account.displayIdentity.displayLabel!))).toBe(false)
    expect(ciphertext.includes(Buffer.from(state.cursor!))).toBe(false)
  })

  it('replaces sync state idempotently for one account', () => {
    const { database, repository } = createRepository()
    repository.saveSyncState(syncState('work'))
    const replacement: ProviderSyncStateV1 = {
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'error',
      cursor: 'cursor-work',
      lastSuccessAt: '2026-08-24T10:30:00.000Z',
      lastErrorCode: 'OFFLINE'
    }

    repository.saveSyncState(replacement)

    expect(repository.loadSyncState('work')).toEqual(replacement)
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_account_records
      WHERE record_type = 'sync-state' AND account_scope = 'work'
    `).get()).toEqual({ count: 1 })
  })

  it('checks provider-account presence without decrypting its payload', () => {
    const { database, repository } = createRepository()
    repository.saveProviderAccount(providerAccount('work'))
    database.prepare(`
      UPDATE encrypted_account_records SET payload = ?
      WHERE record_type = 'provider-account' AND account_scope = 'work'
    `).run(Buffer.from('intentionally-invalid-test-envelope'))

    expect(repository.hasProviderAccount('work')).toBe(true)
    expect(repository.hasProviderAccount('personal')).toBe(false)
    expect(() => repository.loadProviderAccount('work')).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({
        code: 'ACCOUNT_STATE_STORAGE_FAILED'
      })
    )
  })

  it('deletes only the selected account state', () => {
    const { repository } = createRepository()
    repository.saveProviderAccount(providerAccount('work'))
    repository.saveSyncState(syncState('work'))
    repository.saveProviderAccount(providerAccount('personal'))
    repository.saveSyncState(syncState('personal'))

    expect(repository.deleteAccountState('work')).toBe(true)
    expect(repository.deleteAccountState('work')).toBe(false)
    expect(repository.loadProviderAccount('work')).toBeUndefined()
    expect(repository.loadSyncState('work')).toBeUndefined()
    expect(repository.loadProviderAccount('personal')).toEqual(providerAccount('personal'))
    expect(repository.loadSyncState('personal')).toEqual(syncState('personal'))
  })

  it('deletes all account state idempotently', () => {
    const { repository } = createRepository()
    repository.saveProviderAccount(providerAccount('work'))
    repository.saveSyncState(syncState('work'))
    repository.saveProviderAccount(providerAccount('personal'))

    expect(repository.deleteAllAccountState()).toBe(true)
    expect(repository.deleteAllAccountState()).toBe(false)
    expect(repository.loadProviderAccount('work')).toBeUndefined()
    expect(repository.loadSyncState('work')).toBeUndefined()
    expect(repository.loadProviderAccount('personal')).toBeUndefined()
  })

  it('fails safely when account scope metadata is substituted', () => {
    const { database, repository } = createRepository()
    repository.saveProviderAccount(providerAccount('work'))
    database.prepare(`
      UPDATE encrypted_account_records SET account_scope = 'personal'
      WHERE record_type = 'provider-account' AND account_scope = 'work'
    `).run()

    expect(() => repository.loadProviderAccount('personal')).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({
        code: 'ACCOUNT_STATE_STORAGE_FAILED'
      })
    )
  })

  it('rejects invalid state before persistence', () => {
    const { database, repository } = createRepository()
    const invalidState: ProviderSyncStateV1 = {
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'error'
    }

    expect(() => repository.saveSyncState(invalidState)).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({ code: 'INVALID_ACCOUNT_STATE' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_account_records').get())
      .toEqual({ count: 0 })
  })

  it('rejects the obsolete numeric consent identity before persistence', () => {
    const { database, repository } = createRepository()
    const invalidAccount = {
      ...providerAccount('work'),
      consentVersion: 1
    } as unknown as ProviderAccountRecordV2

    expect(() => repository.saveProviderAccount(invalidAccount)).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({ code: 'INVALID_ACCOUNT_STATE' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_account_records').get())
      .toEqual({ count: 0 })
  })

  it('rejects legacy and malformed display identities before persistence', () => {
    const { database, repository } = createRepository()
    const legacy = {
      version: 1,
      accountId: 'work',
      provider: 'google',
      providerAccountId: 'google-sub-work',
      consentVersion: 'google-gmail-readonly-v1',
      connectedAt: '2026-08-24T10:00:00.000Z'
    } as unknown as ProviderAccountRecordV2
    const paddedLabel = {
      ...providerAccount('work'),
      displayIdentity: {
        mailboxAddress: 'work@example.test',
        displayLabel: ' Work '
      }
    }

    expect(() => repository.saveProviderAccount(legacy)).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({ code: 'INVALID_ACCOUNT_STATE' })
    )
    expect(() => repository.saveProviderAccount(paddedLabel)).toThrowError(
      expect.objectContaining<Partial<AccountStateError>>({ code: 'INVALID_ACCOUNT_STATE' })
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM encrypted_account_records').get())
      .toEqual({ count: 0 })
  })
})
