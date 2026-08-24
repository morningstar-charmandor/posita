import { describe, expect, it } from 'vitest'
import {
  CACHE_DATA_KEY_NAME,
  googleRefreshTokenName,
  isSecretName,
  SecretVaultError
} from './secretVault'

describe('credential names', () => {
  it('constructs the only credential namespace Posita currently supports', () => {
    const name = googleRefreshTokenName('account_personal-1')

    expect(name).toBe('oauth.google.account_personal-1.refresh-token')
    expect(isSecretName(name)).toBe(true)
    expect(isSecretName(CACHE_DATA_KEY_NAME)).toBe(true)
    expect(isSecretName('oauth.google.account_personal-1.access-token')).toBe(false)
  })

  it('rejects identifiers that could escape or expand the namespace', () => {
    expect(() => googleRefreshTokenName('../personal')).toThrowError(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'INVALID_SECRET_NAME' })
    )
    expect(() => googleRefreshTokenName('')).toThrowError(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'INVALID_SECRET_NAME' })
    )
  })
})
