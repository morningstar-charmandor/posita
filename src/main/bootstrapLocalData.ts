import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { fixtures } from '../shared/fixtures'
import type { AccountStateRepository } from './application/accountState'
import type { AccountLifecycleRepository } from './application/accountLifecycle'
import { AccountDataRemovalService } from './application/accountDataRemoval'
import {
  inspectAccountConnectionConsistency,
  type AccountConnectionConsistencyInspector
} from './application/accountConnection'
import { AccountConnectionRecoveryCommandService } from './application/accountConnectionRecoveryCommand'
import { AccountConnectionRecoveryConfirmationService } from './application/accountConnectionRecoveryConfirmation'
import {
  ComposedDeleteLocalDataActions,
  DeleteLocalDataService,
  type EncryptionContextDestroyer
} from './application/deleteLocalData'
import { LocalActionConfirmationService } from './application/localActionConfirmation'
import { AccountConnectionRecoveryService } from './application/recoverAccountConnection'
import { StartupLifecycleRecoveryOwner } from './application/startupLifecycleRecovery'
import { RetentionMaintenanceService } from './application/retentionMaintenance'
import type { RetentionMaintenanceRunner } from './application/retentionMaintenanceOwner'
import { MailApplicationService, systemClock } from './application/mailApplicationService'
import {
  ProviderMailReadModelService,
  ModeAwareMailStateService,
  type ApplicationMailStateLoader,
  type ProviderMailReadModelSource
} from './application/providerMailReadModel'
import type { MailRepository } from './application/mailRepository'
import type { ProviderMailSourceDetailSource } from './application/providerMailSourceDetail'
import type { ProviderMailOriginalSourceLocatorSource } from './application/providerMailOriginalSource'
import type { StorageSanitizer } from './application/storageSanitizer'
import {
  ProviderMailStartupInventoryService,
  type ProviderMailStartupInventoryV1
} from './application/providerMailStartupInventory'
import { ProviderMailSyncStatusService } from './application/providerMailSyncStatus'
import { MailDataModeService } from './application/mailDataMode'
import type { SecretVault } from './application/secretVault'
import { AesGcmCacheProtector } from './infrastructure/security/aesGcmCacheProtector'
import { CacheDataKeyManager } from './infrastructure/security/cacheDataKeyManager'
import { ElectronSafeStorageProtector } from './infrastructure/security/electronSafeStorageProtector'
import type { StringProtector } from './infrastructure/security/stringProtector'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import { EncryptedSqliteAccountStateRepository } from './infrastructure/sqlite/encryptedSqliteAccountStateRepository'
import { SqliteAccountLifecycleRepository } from './infrastructure/sqlite/sqliteAccountLifecycleRepository'
import { SqliteAccountConnectionRecoveryConfirmationRepository } from './infrastructure/sqlite/sqliteAccountConnectionRecoveryConfirmationRepository'
import { SqliteDeleteLocalDataRecoveryActions } from './infrastructure/sqlite/sqliteDeleteLocalDataRecoveryActions'
import { migrateLegacyPlaintextCache } from './infrastructure/sqlite/encryptedCacheMigration'
import {
  countEncryptedRecords,
  EncryptedSqliteMailRepository
} from './infrastructure/sqlite/encryptedSqliteMailRepository'
import { applyMigrations } from './infrastructure/sqlite/migrations'
import { SqliteSecretVault } from './infrastructure/sqlite/sqliteSecretVault'
import { SqliteLocalActionConfirmationRepository } from './infrastructure/sqlite/sqliteLocalActionConfirmationRepository'
import { SqliteMailDataModeRepository } from './infrastructure/sqlite/sqliteMailDataModeRepository'
import { InlineSqliteStorageSanitizer } from './infrastructure/sqlite/sqliteSanitization'
import { WorkerThreadSqliteStorageSanitizer } from './infrastructure/sqlite/workerThreadSqliteStorageSanitizer'
import { WorkerThreadRetentionMaintenance } from './infrastructure/sqlite/workerThreadRetentionMaintenance'
import { EncryptedSqliteMailSyncProjection } from './infrastructure/sqlite/encryptedSqliteMailSyncProjection'
import { WorkerThreadMailSyncProjection } from './infrastructure/sqlite/workerThreadMailSyncProjection'
import type { GoogleAccountDisconnectAuditRepository } from './application/googleAccountDisconnectCommand'
import { SqliteGoogleAccountDisconnectAuditRepository } from './infrastructure/sqlite/sqliteGoogleAccountDisconnectAuditRepository'

interface LocalDataRuntimeBase {
  mode: 'ready' | 'local-data-deleted'
  repository: MailRepository
  service: ApplicationMailStateLoader
  accountLifecycleRepository: AccountLifecycleRepository
}

export interface ReadyLocalDataRuntime extends LocalDataRuntimeBase {
  mode: 'ready'
  secretVault: SecretVault
  accountStateRepository: AccountStateRepository
  retentionService: RetentionMaintenanceRunner
  accountDataRemovalService: AccountDataRemovalService
  accountConnectionRecoveryCommandService: AccountConnectionRecoveryCommandService
  confirmationService: LocalActionConfirmationService
  deleteLocalDataService: DeleteLocalDataService
  mailDataModeService: MailDataModeService
  providerMailReadWorker?: WorkerThreadMailSyncProjection
  storageSanitizer: StorageSanitizer
  providerMailSourceDetailSource?: ProviderMailSourceDetailSource
  providerMailOriginalSourceLocatorSource?: ProviderMailOriginalSourceLocatorSource
  providerMailStartupInventory: ProviderMailStartupInventoryV1
  providerMailSyncStatusService: ProviderMailSyncStatusService
  googleAccountDisconnectAuditRepository: GoogleAccountDisconnectAuditRepository
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
  let retentionWorkerKey: Uint8Array | undefined
  let providerMailReadWorkerKey: Uint8Array | undefined
  let scheduledRetentionService: RetentionMaintenanceRunner | undefined
  let providerMailReadWorker: WorkerThreadMailSyncProjection | undefined
  try {
    applyMigrations(database)
    const secretVault = new SqliteSecretVault(database, dependencies.credentialProtector)
    const mailDataModeRepository = new SqliteMailDataModeRepository(database)
    const keyManager = new CacheDataKeyManager(secretVault)
    const storageSanitizer = databasePath === ':memory:'
      ? new InlineSqliteStorageSanitizer(database)
      : new WorkerThreadSqliteStorageSanitizer(databasePath)
    const accountLifecycleRepository = new SqliteAccountLifecycleRepository(database)
    const confirmation = new LocalActionConfirmationService(
      new SqliteLocalActionConfirmationRepository(database),
      systemClock,
      dependencies.confirmationIdSource
    )
    const deletionRecovery = new DeleteLocalDataService(
      accountLifecycleRepository,
      new SqliteDeleteLocalDataRecoveryActions(
        database,
        secretVault,
        keyManager,
        storageSanitizer
      ),
      confirmation
    )
    const recovery = await new StartupLifecycleRecoveryOwner(
      accountLifecycleRepository,
      deletionRecovery
    ).recover(dependencies.signal)
    confirmation.cleanupExpired()
    if (recovery.mode === 'local-data-deleted') {
      return deletedRuntime(database, accountLifecycleRepository)
    }
    const mailDataMode = mailDataModeRepository.load()
    const key = recovery.pendingDisconnects > 0 || mailDataMode.mode === 'live'
      ? await keyManager.loadExisting()
      : await keyManager.loadOrCreate(countEncryptedRecords(database) > 0)
    if (databasePath !== ':memory:') retentionWorkerKey = Uint8Array.from(key)
    if (databasePath !== ':memory:') providerMailReadWorkerKey = Uint8Array.from(key)
    const protector = new AesGcmCacheProtector(key)
    key.fill(0)
    repository = new EncryptedSqliteMailRepository(database, protector)
    migrateLegacyPlaintextCache(database, protector)
    const retentionService = new RetentionMaintenanceService(repository, storageSanitizer)
    if (recovery.pendingDisconnects === 0 && mailDataMode.mode === 'sample') {
      repository.seedIfEmpty(fixtures)
      await retentionService.ensureFixtureCompatibility(fixtures)
    }
    scheduledRetentionService = retentionService
    if (retentionWorkerKey !== undefined) {
      scheduledRetentionService = new WorkerThreadRetentionMaintenance(
        databasePath,
        retentionWorkerKey
      )
      retentionWorkerKey.fill(0)
      retentionWorkerKey = undefined
    }
    const retentionEncryptionContext = scheduledRetentionService instanceof
      WorkerThreadRetentionMaintenance ? scheduledRetentionService : undefined
    const accountStateRepository = new EncryptedSqliteAccountStateRepository(database, protector)
    const providerMailStartupInventory = new ProviderMailStartupInventoryService(
      accountStateRepository,
      secretVault
    ).inspect()
    const providerMailSyncStatusService = new ProviderMailSyncStatusService(
      accountStateRepository,
      systemClock
    )
    const sampleMailService = new MailApplicationService(
      repository,
      systemClock
    )
    let source: ProviderMailReadModelSource & ProviderMailSourceDetailSource &
      ProviderMailOriginalSourceLocatorSource
    if (providerMailReadWorkerKey === undefined) {
      source = new EncryptedSqliteMailSyncProjection(database, protector)
    } else {
      const workerProjection = new WorkerThreadMailSyncProjection(
        databasePath,
        providerMailReadWorkerKey
      )
      providerMailReadWorkerKey.fill(0)
      providerMailReadWorkerKey = undefined
      source = workerProjection
      providerMailReadWorker = workerProjection
    }
    const applicationMailService: ApplicationMailStateLoader = new ModeAwareMailStateService(
      mailDataModeRepository,
      sampleMailService,
      new ProviderMailReadModelService(source, systemClock)
    )
    const connections: AccountConnectionConsistencyInspector = {
      inspect: (accountId) => inspectAccountConnectionConsistency(
        accountId,
        secretVault,
        accountStateRepository
      )
    }
    const accountRecoveryConfirmation = new AccountConnectionRecoveryConfirmationService(
      connections,
      new SqliteAccountConnectionRecoveryConfirmationRepository(database),
      systemClock,
      dependencies.confirmationIdSource
    )
    accountRecoveryConfirmation.cleanupExpired()
    const accountRecovery = new AccountConnectionRecoveryService(
      connections,
      accountRecoveryConfirmation,
      secretVault,
      accountStateRepository
    )
    const mailDataModeService = new MailDataModeService(
      mailDataModeRepository,
      connections,
      storageSanitizer
    )
    const activeDeletion = new DeleteLocalDataService(
      accountLifecycleRepository,
      new ComposedDeleteLocalDataActions(
        secretVault,
        accountStateRepository,
        repository,
        keyManager,
        storageSanitizer,
        [retentionEncryptionContext, providerMailReadWorker].filter(
          (context): context is NonNullable<typeof context> => context !== undefined
        )
      ),
      confirmation
    )
    return {
      mode: 'ready',
      repository,
      service: applicationMailService,
      secretVault,
      accountStateRepository,
      accountLifecycleRepository,
      retentionService: scheduledRetentionService,
      accountDataRemovalService: new AccountDataRemovalService(repository),
      accountConnectionRecoveryCommandService: new AccountConnectionRecoveryCommandService(
        connections,
        accountRecoveryConfirmation,
        accountRecovery
      ),
      confirmationService: confirmation,
      deleteLocalDataService: activeDeletion,
      mailDataModeService,
      storageSanitizer,
      providerMailStartupInventory,
      providerMailSyncStatusService,
      googleAccountDisconnectAuditRepository:
        new SqliteGoogleAccountDisconnectAuditRepository(database),
      ...(mailDataMode.mode === 'live' ? { providerMailSourceDetailSource: source } : {}),
      ...(mailDataMode.mode === 'live'
        ? { providerMailOriginalSourceLocatorSource: source }
        : {}),
      ...(providerMailReadWorker === undefined ? {} : { providerMailReadWorker })
    }
  } catch (error) {
    retentionWorkerKey?.fill(0)
    providerMailReadWorkerKey?.fill(0)
    scheduledRetentionService?.destroyEncryptionContext?.()
    providerMailReadWorker?.destroyEncryptionContext()
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
