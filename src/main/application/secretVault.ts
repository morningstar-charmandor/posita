export type SecretName =
  | `oauth.google.${string}.refresh-token`
  | 'cache.installation.data-key-v1'

export interface SecretVault {
  set(name: SecretName, value: string): Promise<void>
  has(name: SecretName): Promise<boolean>
  get(name: SecretName): Promise<string | undefined>
  delete(name: SecretName): Promise<boolean>
  deleteGoogleRefreshTokens(): Promise<number>
}

export const MAX_SECRET_LENGTH = 16_384

export const googleRefreshTokenName = (accountId: string): SecretName => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    throw new SecretVaultError('INVALID_SECRET_NAME', 'The account identifier is invalid.')
  }
  return `oauth.google.${accountId}.refresh-token`
}

export const CACHE_DATA_KEY_NAME: SecretName = 'cache.installation.data-key-v1'

export const isSecretName = (value: string): value is SecretName =>
  value === CACHE_DATA_KEY_NAME ||
  /^oauth\.google\.[A-Za-z0-9_-]{1,128}\.refresh-token$/.test(value)

export class SecretVaultError extends Error {
  readonly code:
    | 'INVALID_SECRET_NAME'
    | 'PROTECTION_UNAVAILABLE'
    | 'SECRET_CORRUPTED'
    | 'SECRET_STORAGE_FAILED'

  constructor(code: SecretVaultError['code'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SecretVaultError'
    this.code = code
  }
}
