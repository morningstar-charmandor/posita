export interface StorageSanitizer {
  /** One single-flight physical SQLite cleanup. Implementations must be idempotent. */
  sanitize(): Promise<void>
}

export class StorageSanitizationError extends Error {
  readonly code = 'STORAGE_SANITIZATION_FAILED' as const

  constructor(options?: ErrorOptions) {
    super('Posita could not sanitize local storage.', options)
    this.name = 'StorageSanitizationError'
  }
}
