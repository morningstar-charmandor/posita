import { SecretVaultError } from '../../application/secretVault'

export interface UnprotectedString {
  value: string
  shouldReprotect: boolean
}

export interface StringProtector {
  readonly scheme: string
  protect(value: string): Promise<Uint8Array>
  unprotect(value: Uint8Array): Promise<UnprotectedString>
}

export const protectionUnavailable = (options?: ErrorOptions): SecretVaultError =>
  new SecretVaultError(
    'PROTECTION_UNAVAILABLE',
    'Secure credential storage is unavailable on this device.',
    options
  )
