import { fixtures } from '../shared/fixtures'
import { MailApplicationService, systemClock } from './application/mailApplicationService'
import type { MailRepository } from './application/mailRepository'
import { openPositaDatabase } from './infrastructure/sqlite/database'
import { SqliteMailRepository } from './infrastructure/sqlite/sqliteMailRepository'

export interface LocalDataRuntime {
  repository: MailRepository
  service: MailApplicationService
}

export const bootstrapLocalData = (databasePath: string): LocalDataRuntime => {
  const repository = new SqliteMailRepository(openPositaDatabase(databasePath))
  try {
    repository.initialize()
    repository.seedIfEmpty(fixtures)
    return {
      repository,
      service: new MailApplicationService(repository, systemClock)
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
