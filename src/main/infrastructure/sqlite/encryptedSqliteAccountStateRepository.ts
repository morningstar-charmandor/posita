import type { DatabaseSync } from 'node:sqlite'
import {
  AccountStateError,
  isAccountId,
  isProviderAccountRecordV2,
  isProviderSyncStateV1,
  type AccountStateRepository,
  type ProviderAccountRecordV2,
  type ProviderSyncStateV1
} from '../../application/accountState.ts'
import { MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS } from '../../application/providerMailLimits.ts'
import {
  EncryptedCacheError,
  type CacheRecordContext,
  type CacheRecordProtector
} from '../../application/encryptedCache.ts'

type AccountRecordType = 'provider-account' | 'sync-state'

interface AccountRecordRow {
  record_type: string
  account_scope: string
  envelope_scheme: string
  payload: Uint8Array
}

const contextFor = (recordType: AccountRecordType, accountId: string): CacheRecordContext => ({
  recordType,
  recordId: accountId,
  accountScope: accountId,
  position: 0
})

const storageFailure = (message: string, cause: unknown): AccountStateError =>
  new AccountStateError('ACCOUNT_STATE_STORAGE_FAILED', message, { cause })

export const saveEncryptedProviderSyncState = (
  database: DatabaseSync,
  protector: CacheRecordProtector,
  state: ProviderSyncStateV1
): void => {
  if (!isProviderSyncStateV1(state)) {
    throw new AccountStateError('INVALID_ACCOUNT_STATE', 'Provider sync state is invalid.')
  }
  const context = contextFor('sync-state', state.accountId)
  try {
    const payload = protector.protect(context, JSON.stringify(state))
    database.prepare(`
      INSERT INTO encrypted_account_records (
        record_type, account_scope, envelope_scheme, payload, created_at, updated_at
      ) VALUES ('sync-state', ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(record_type, account_scope) DO UPDATE SET
        envelope_scheme = excluded.envelope_scheme,
        payload = excluded.payload,
        updated_at = datetime('now')
    `).run(state.accountId, protector.scheme, Buffer.from(payload))
  } catch (error) {
    if (error instanceof AccountStateError) throw error
    throw storageFailure('Failed to save encrypted account state.', error)
  }
}

export const deleteAllEncryptedAccountState = (database: DatabaseSync): boolean => {
  try {
    return Number(database.prepare('DELETE FROM encrypted_account_records').run().changes) > 0
  } catch (error) {
    throw storageFailure('Failed to delete all encrypted account state.', error)
  }
}

export class EncryptedSqliteAccountStateRepository implements AccountStateRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly protector: CacheRecordProtector
  ) {}

  saveProviderAccount(record: ProviderAccountRecordV2): void {
    if (!isProviderAccountRecordV2(record)) {
      throw new AccountStateError('INVALID_ACCOUNT_STATE', 'Provider account state is invalid.')
    }
    this.save('provider-account', record.accountId, record)
  }

  listProviderAccountIds(): string[] {
    try {
      const rows = this.database.prepare(`
        SELECT account_scope FROM encrypted_account_records
        WHERE record_type = 'provider-account'
        ORDER BY account_scope ASC
        LIMIT ?
      `).all(MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS + 1) as Array<{ account_scope: unknown }>
      if (!rows.every((row) => typeof row.account_scope === 'string' &&
          isAccountId(row.account_scope))) {
        throw new AccountStateError('INVALID_ACCOUNT_STATE', 'Provider account state is invalid.')
      }
      return rows.map((row) => row.account_scope as string)
    } catch (error) {
      if (error instanceof AccountStateError) throw error
      throw storageFailure('Failed to list encrypted provider-account state.', error)
    }
  }

  hasProviderAccount(accountId: string): boolean {
    this.assertAccountId(accountId)
    try {
      return this.database.prepare(`
        SELECT 1 FROM encrypted_account_records
        WHERE record_type = 'provider-account' AND account_scope = ?
      `).get(accountId) !== undefined
    } catch (error) {
      throw storageFailure('Failed to check encrypted provider-account state.', error)
    }
  }

  loadProviderAccount(accountId: string): ProviderAccountRecordV2 | undefined {
    const value = this.load('provider-account', accountId)
    if (value === undefined) return undefined
    if (!isProviderAccountRecordV2(value) || value.accountId !== accountId) {
      throw new AccountStateError('INVALID_ACCOUNT_STATE', 'Provider account state is invalid.')
    }
    return value
  }

  saveSyncState(state: ProviderSyncStateV1): void {
    saveEncryptedProviderSyncState(this.database, this.protector, state)
  }

  loadSyncState(accountId: string): ProviderSyncStateV1 | undefined {
    const value = this.load('sync-state', accountId)
    if (value === undefined) return undefined
    if (!isProviderSyncStateV1(value) || value.accountId !== accountId) {
      throw new AccountStateError('INVALID_ACCOUNT_STATE', 'Provider sync state is invalid.')
    }
    return value
  }

  deleteAccountState(accountId: string): boolean {
    this.assertAccountId(accountId)
    try {
      const result = this.database.prepare(`
        DELETE FROM encrypted_account_records WHERE account_scope = ?
      `).run(accountId)
      return Number(result.changes) > 0
    } catch (error) {
      if (error instanceof AccountStateError) throw error
      throw storageFailure('Failed to delete encrypted account state.', error)
    }
  }

  deleteAllAccountState(): boolean {
    return deleteAllEncryptedAccountState(this.database)
  }

  private save(recordType: AccountRecordType, accountId: string, value: unknown): void {
    const context = contextFor(recordType, accountId)
    try {
      const payload = this.protector.protect(context, JSON.stringify(value))
      this.database.prepare(`
        INSERT INTO encrypted_account_records (
          record_type, account_scope, envelope_scheme, payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(record_type, account_scope) DO UPDATE SET
          envelope_scheme = excluded.envelope_scheme,
          payload = excluded.payload,
          updated_at = datetime('now')
      `).run(recordType, accountId, this.protector.scheme, Buffer.from(payload))
    } catch (error) {
      if (error instanceof AccountStateError) throw error
      throw storageFailure('Failed to save encrypted account state.', error)
    }
  }

  private load(recordType: AccountRecordType, accountId: string): unknown | undefined {
    this.assertAccountId(accountId)
    try {
      const row = this.database.prepare(`
        SELECT record_type, account_scope, envelope_scheme, payload
        FROM encrypted_account_records
        WHERE record_type = ? AND account_scope = ?
      `).get(recordType, accountId) as unknown as AccountRecordRow | undefined
      if (row === undefined) return undefined
      if (row.record_type !== recordType || row.account_scope !== accountId ||
          row.envelope_scheme !== this.protector.scheme) {
        throw new EncryptedCacheError(
          'CACHE_RECORD_INVALID',
          'Encrypted account record metadata is invalid.'
        )
      }
      const plaintext = this.protector.unprotect(contextFor(recordType, accountId), row.payload)
      try {
        return JSON.parse(plaintext) as unknown
      } catch (error) {
        throw new EncryptedCacheError(
          'CACHE_RECORD_INVALID',
          'Decrypted account state is not valid JSON.',
          { cause: error }
        )
      }
    } catch (error) {
      if (error instanceof AccountStateError) throw error
      throw storageFailure('Failed to load encrypted account state.', error)
    }
  }

  private assertAccountId(accountId: string): void {
    if (!isAccountId(accountId)) {
      throw new AccountStateError('INVALID_ACCOUNT_STATE', 'The account identifier is invalid.')
    }
  }
}
