import type { MailDataset } from '../../shared/domain'

export interface MailRepository {
  initialize(): void
  seedIfEmpty(dataset: MailDataset): boolean
  loadDataset(): MailDataset
  close(): void
}

export interface MutableMailRepository extends MailRepository {
  replaceDataset(dataset: MailDataset): void
}

export class RepositoryError extends Error {
  readonly code: 'MIGRATION_UNSUPPORTED' | 'DATABASE_OPERATION_FAILED'

  constructor(
    code: RepositoryError['code'],
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'RepositoryError'
    this.code = code
  }
}
