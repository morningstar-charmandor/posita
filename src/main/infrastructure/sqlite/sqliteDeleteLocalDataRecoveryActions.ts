import type { DatabaseSync } from 'node:sqlite'
import type {
  CacheDataKeyEraser,
  DeleteLocalDataActions
} from '../../application/deleteLocalData'
import type { SecretVault } from '../../application/secretVault'
import { deleteAllEncryptedAccountState } from './encryptedSqliteAccountStateRepository'
import {
  completeEncryptedCacheSanitization,
  deleteAllEncryptedMailRecords
} from './encryptedSqliteMailRepository'

/**
 * Deletion-only startup adapter. It never loads, creates, decrypts, or replaces
 * the installation data key.
 */
export class SqliteDeleteLocalDataRecoveryActions implements DeleteLocalDataActions {
  constructor(
    private readonly database: DatabaseSync,
    private readonly vault: SecretVault,
    private readonly keyEraser: CacheDataKeyEraser
  ) {}

  async deleteRefreshCredentials(): Promise<void> {
    await this.vault.deleteGoogleRefreshTokens()
  }

  deleteAccountState(): void {
    deleteAllEncryptedAccountState(this.database)
  }

  deleteMailRecords(): void {
    deleteAllEncryptedMailRecords(this.database)
  }

  sanitizeStorage(): void {
    completeEncryptedCacheSanitization(this.database)
  }

  async eraseDataKey(): Promise<void> {
    await this.keyEraser.delete()
  }
}
