import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { fixtures } from '../shared/fixtures'
import type { AccountStateRepository } from './application/accountState'
import type { AccountLifecycleRepository } from './application/accountLifecycle'
import { AccountDataRemovalService } from './application/accountDataRemoval'
import { DeleteLocalDataService } from './application/deleteLocalData'
import { LocalActionConfirmationService } from './application/localActionConfirmation'
import { StartupLifecycleRecoveryOwner } from './application/startupLifecycleRecovery'
import { RetentionMaintenanceService } from './application/retentionMaintenance'
import { MailApplicationService, systemClock } from './application/mailApplicationService'
import type { MailRepository } from './application/mailRepository'
import type { SecretVault } from './application/secretVault'
import { AesGcmCacheProtector } from './infrastructure/security/aesGcmCacheProtector'
import { CacheDataKeyManager } from './infrastructure/security/cacheDataKeyManager'
import { ElectronSafeStorageProtector } from './infrastructure/security/electronSafeStorageProtector'
import type { StringProtector } from './infrastructure/security/stringProtector'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import { EncryptedSqliteAccountStateRepository } from './infrastructure/sqlite/encryptedSqliteAccountStateRepository'
import { SqliteAccountLifecycleRepository } from './infrastructure/sqlite/sqliteAccountLifecycleRepository'
import { SqliteDeleteLocalDataRecoveryActions } from './infrastructure/sqlite/sqliteDeleteLocalDataRecoveryActions'
import { migrateLegacyPlaintextCache } from './infrastructure/sqlite/encryptedCacheMigration'
import {
  countEncryptedRecords,
  EncryptedSqliteMailRepository
} from './infrastructure/sqlite/encryptedSqliteMailRepository'
import { applyMigrations } from './infrastructure/sqlite/migrations'
import { SqliteSecretVault } from './infrastructure/sqlite/sqliteSecretVault'
import { SqliteLocalActionConfirmationRepository } from './infrastructure/sqlite/sqliteLocalActionConfirmationRepository'

interface LocalDataRuntimeBase {
  mode: 'ready' | 'local-data-deleted'
  repository: MailRepository
  service: MailApplicationService
  accountLifecycleRepository: AccountLifecycleRepository
}

export interface ReadyLocalDataRuntime extends LocalDataRuntimeBase {
  mode: 'ready'
  secretVault: SecretVault
  accountStateRepository: AccountStateRepository
  retentionService: RetentionMaintenanceService
  accountDataRemovalService: AccountDataRemovalService
}

export interface DeletedLocalDataRuntime extends LocalDataRuntimeBase {
  mode: 'local-data-deleted'
}

export type LocalDataRuntime = ReadyLocalDataRuntime | DeletedLocalDataRuntime

export interface LocalDataBootstrapDependencies {
  credentialProtector: StringProtector
  confirmationIdSource: () => string
  signal?: AbortSignal
}

const unavailableRepository = (
  close: () => void = () => undefined
): MailRepository => ({
  initialize: () => undefined,
  seedIfEmpty: () => false,
  loadDataset: () => { throw new Error('Local data is unavailable.') },
  close
})

const deletedRuntime = (
  database: DatabaseSync,
  lifecycle: AccountLifecycleRepository
): DeletedLocalDataRuntime => {
  const repository = unavailableRepository(() => {
    if (database.isOpen) database.close()
  })
  return {
    mode: 'local-data-deleted',
    repository,
    service: new MailApplicationService(repository, systemClock),
    accountLifecycleRepository: lifecycle
  }
}

export const bootstrapLocalDataWithDependencies = async (
  databasePath: string,
  dependencies: LocalDataBootstrapDependencies
): Promise<LocalDataRuntime> => {
  const database = openPositaDatabase(databasePath)
  let repository: EncryptedSqliteMailRepository | undefined
  try {
    applyMigrations(database)
    const secretVault = new SqliteSecretVault(database, dependencies.credentialProtector)
    const keyManager = new CacheDataKeyManager(secretVault)
    const accountLifecycleRepository = new SqliteAccountLifecycleRepository(database)
    const confirmation = new LocalActionConfirmationService(
      new SqliteLocalActionConfirmationRepository(database),
      systemClock,
      dependencies.confirmationIdSource
    )
    const deletionRecovery = new DeleteLocalDataService(
      accountLifecycleRepository,
      new SqliteDeleteLocalDataRecoveryActions(database, secretVault, keyManager),
      confirmation
    )
    const recovery = await new StartupLifecycleRecoveryOwner(
      accountLifecycleRepository,
      deletionRecovery
    ).recover(dependencies.signal)
    if (recovery.mode === 'local-data-deleted') {
      return deletedRuntime(database, accountLifecycleRepository)
    }
    const key = recovery.pendingDisconnects > 0
      ? await keyManager.loadExisting()
      : await keyManager.loadOrCreate(countEncryptedRecords(database) > 0)
    const protector = new AesGcmCacheProtector(key)
    key.fill(0)
    repository = new EncryptedSqliteMailRepository(database, protector)
    migrateLegacyPlaintextCache(database, protector)
    if (recovery.pendingDisconnects === 0) repository.seedIfEmpty(fixtures)
    return {
      mode: 'ready',
      repository,
      service: new MailApplicationService(repository, systemClock),
      secretVault,
      accountStateRepository: new EncryptedSqliteAccountStateRepository(database, protector),
      accountLifecycleRepository,
      retentionService: new RetentionMaintenanceService(repository),
      accountDataRemovalService: new AccountDataRemovalService(repository)
    }
  } catch (error) {
    if (repository) repository.close()
    else if (database.isOpen) database.close()
    throw error
  }
}

export const bootstrapLocalData = (
  databasePath: string,
  signal?: AbortSignal
): Promise<LocalDataRuntime> => bootstrapLocalDataWithDependencies(databasePath, {
  credentialProtector: new ElectronSafeStorageProtector(),
  confirmationIdSource: randomUUID,
  signal
})
