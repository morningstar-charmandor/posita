import type { DatabaseSync } from 'node:sqlite'
import {
  isSecretName,
  MAX_SECRET_LENGTH,
  SecretVaultError,
  type SecretName,
  type SecretVault
} from '../../application/secretVault'
import type { StringProtector } from '../security/stringProtector'

interface ProtectedSecretRow {
  name: string
  protection_scheme: string
  ciphertext: Uint8Array
}

export class SqliteSecretVault implements SecretVault {
  constructor(
    private readonly database: DatabaseSync,
    private readonly protector: StringProtector
  ) {}

  async set(name: SecretName, value: string): Promise<void> {
    this.assertName(name)
    if (value.length === 0 || value.length > MAX_SECRET_LENGTH) {
      throw new SecretVaultError('SECRET_STORAGE_FAILED', 'The credential length is invalid.')
    }

    const ciphertext = await this.protector.protect(value)
    try {
      this.database.prepare(`
        INSERT INTO protected_secrets (
          name, protection_scheme, ciphertext, created_at, updated_at
        ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(name) DO UPDATE SET
          protection_scheme = excluded.protection_scheme,
          ciphertext = excluded.ciphertext,
          updated_at = datetime('now')
      `).run(name, this.protector.scheme, Buffer.from(ciphertext))
    } catch (error) {
      throw this.storageFailure('The credential could not be stored.', error)
    }
  }

  async get(name: SecretName): Promise<string | undefined> {
    this.assertName(name)
    let row: ProtectedSecretRow | undefined
    try {
      row = this.database.prepare(`
        SELECT name, protection_scheme, ciphertext
        FROM protected_secrets WHERE name = ?
      `).get(name) as ProtectedSecretRow | undefined
    } catch (error) {
      throw this.storageFailure('The credential could not be loaded.', error)
    }

    if (!row) return undefined
    if (row.protection_scheme !== this.protector.scheme) {
      throw new SecretVaultError(
        'SECRET_CORRUPTED',
        'The credential uses an unsupported protection scheme.'
      )
    }

    const unprotected = await this.protector.unprotect(row.ciphertext)
    if (unprotected.shouldReprotect) await this.set(name, unprotected.value)
    return unprotected.value
  }

  async delete(name: SecretName): Promise<boolean> {
    this.assertName(name)
    try {
      return this.database.prepare('DELETE FROM protected_secrets WHERE name = ?')
        .run(name).changes > 0
    } catch (error) {
      throw this.storageFailure('The credential could not be removed.', error)
    }
  }

  private assertName(name: string): asserts name is SecretName {
    if (!isSecretName(name)) {
      throw new SecretVaultError('INVALID_SECRET_NAME', 'The credential name is invalid.')
    }
  }

  private storageFailure(message: string, cause: unknown): SecretVaultError {
    if (cause instanceof SecretVaultError) return cause
    return new SecretVaultError('SECRET_STORAGE_FAILED', message, { cause })
  }
}
