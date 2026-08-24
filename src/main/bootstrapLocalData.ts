import { fixtures } from '../shared/fixtures'
import { MailApplicationService, systemClock } from './application/mailApplicationService'
import type { MailRepository } from './application/mailRepository'
import type { SecretVault } from './application/secretVault'
import { AesGcmCacheProtector } from './infrastructure/security/aesGcmCacheProtector'
import { CacheDataKeyManager } from './infrastructure/security/cacheDataKeyManager'
import { ElectronSafeStorageProtector } from './infrastructure/security/electronSafeStorageProtector'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import { migrateLegacyPlaintextCache } from './infrastructure/sqlite/encryptedCacheMigration'
import {
  countEncryptedRecords,
  EncryptedSqliteMailRepository
} from './infrastructure/sqlite/encryptedSqliteMailRepository'
import { applyMigrations } from './infrastructure/sqlite/migrations'
import { SqliteSecretVault } from './infrastructure/sqlite/sqliteSecretVault'

export interface LocalDataRuntime {
  repository: MailRepository
  service: MailApplicationService
  secretVault: SecretVault
}

export const bootstrapLocalData = async (databasePath: string): Promise<LocalDataRuntime> => {
  const database = openPositaDatabase(databasePath)
  let repository: EncryptedSqliteMailRepository | undefined
  try {
    applyMigrations(database)
    const secretVault = new SqliteSecretVault(database, new ElectronSafeStorageProtector())
    const keyManager = new CacheDataKeyManager(secretVault)
    const key = await keyManager.loadOrCreate(countEncryptedRecords(database) > 0)
    const protector = new AesGcmCacheProtector(key)
    key.fill(0)
    repository = new EncryptedSqliteMailRepository(database, protector)
    migrateLegacyPlaintextCache(database, protector)
    repository.seedIfEmpty(fixtures)
    return {
      repository,
      service: new MailApplicationService(repository, systemClock),
      secretVault
    }
  } catch (error) {
    if (repository) repository.close()
    else if (database.isOpen) database.close()
    throw error
  }
}

export const createUnavailableLocalDataService = (): MailApplicationService => {
  const unavailableRepository: MailRepository = {
    initialize: () => undefined,
    seedIfEmpty: () => false,
    loadDataset: () => { throw new Error('Local data is unavailable.') },
    close: () => undefined
  }
  return new MailApplicationService(unavailableRepository, systemClock)
}
