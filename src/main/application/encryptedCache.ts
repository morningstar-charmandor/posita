export const CACHE_ENVELOPE_SCHEME = 'aes-256-gcm-v1'
export const CACHE_ENVELOPE_VERSION = 1
export const MAX_CACHE_PLAINTEXT_BYTES = 16 * 1024 * 1024

export interface CacheRecordContext {
  recordType: string
  recordId: string
  accountScope?: string
  position: number
}

export interface CacheRecordProtector {
  readonly scheme: typeof CACHE_ENVELOPE_SCHEME
  protect(context: CacheRecordContext, plaintext: string): Uint8Array
  unprotect(context: CacheRecordContext, envelope: Uint8Array): string
  destroy(): void
}

export class EncryptedCacheError extends Error {
  readonly code:
    | 'CACHE_KEY_MISSING'
    | 'CACHE_KEY_INVALID'
    | 'CACHE_ENVELOPE_INVALID'
    | 'CACHE_AUTHENTICATION_FAILED'
    | 'CACHE_RECORD_INVALID'
    | 'CACHE_STORAGE_FAILED'
    | 'CACHE_MIGRATION_FAILED'

  constructor(code: EncryptedCacheError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EncryptedCacheError'
    this.code = code
  }
}
