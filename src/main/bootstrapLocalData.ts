import { fixtures } from '../shared/fixtures'
import { MailApplicationService, systemClock } from './application/mailApplicationService'
import type { MailRepository } from './application/mailRepository'
import type { SecretVault } from './application/secretVault'
import { ElectronSafeStorageProtector } from './infrastructure/security/electronSafeStorageProtector'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import { SqliteMailRepository } from './infrastructure/sqlite/sqliteMailRepository'
import { SqliteSecretVault } from './infrastructure/sqlite/sqliteSecretVault'

export interface LocalDataRuntime {
  repository: MailRepository
  service: MailApplicationService
  secretVault: SecretVault
}

export const bootstrapLocalData = (databasePath: string): LocalDataRuntime => {
  const database = openPositaDatabase(databasePath)
  const repository = new SqliteMailRepository(database)
  try {
    repository.initialize()
    repository.seedIfEmpty(fixtures)
    return {
      repository,
      service: new MailApplicationService(repository, systemClock),
      secretVault: new SqliteSecretVault(database, new ElectronSafeStorageProtector())
    }
  } catch (error) {
    repository.close()
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
