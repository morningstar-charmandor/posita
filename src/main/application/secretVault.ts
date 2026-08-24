export type SecretName = `oauth.google.${string}.refresh-token`

export interface SecretVault {
  set(name: SecretName, value: string): Promise<void>
  get(name: SecretName): Promise<string | undefined>
  delete(name: SecretName): Promise<boolean>
}

export const MAX_SECRET_LENGTH = 16_384

export const googleRefreshTokenName = (accountId: string): SecretName => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    throw new SecretVaultError('INVALID_SECRET_NAME', 'The account identifier is invalid.')
  }
  return `oauth.google.${accountId}.refresh-token`
}

export const isSecretName = (value: string): value is SecretName =>
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
