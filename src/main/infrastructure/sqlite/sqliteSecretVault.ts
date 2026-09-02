import type { DatabaseSync } from 'node:sqlite'
import {
  isSecretName,
  MAX_SECRET_LENGTH,
  SecretVaultError,
  type SecretName,
  type SecretVault
} from '../../application/secretVault'
import { MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS } from '../../application/providerMailLimits.ts'
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

  async has(name: SecretName): Promise<boolean> {
    this.assertName(name)
    try {
      return this.database.prepare('SELECT 1 FROM protected_secrets WHERE name = ?')
        .get(name) !== undefined
    } catch (error) {
      throw this.storageFailure('The credential presence could not be checked.', error)
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

  async deleteGoogleRefreshTokens(): Promise<number> {
    try {
      return Number(this.database.prepare(`
        DELETE FROM protected_secrets
        WHERE name LIKE 'oauth.google.%.refresh-token'
      `).run().changes)
    } catch (error) {
      throw this.storageFailure('The Google refresh credentials could not be removed.', error)
    }
  }

  listGoogleRefreshTokenAccountIds(): string[] {
    try {
      const rows = this.database.prepare(`
        SELECT name FROM protected_secrets
        WHERE name LIKE 'oauth.google.%.refresh-token'
        ORDER BY name ASC
        LIMIT ?
      `).all(MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS + 1) as Array<{ name: unknown }>
      return rows.map((row) => {
        if (typeof row.name !== 'string' || !isSecretName(row.name)) {
          throw new SecretVaultError('SECRET_CORRUPTED', 'A credential name is invalid.')
        }
        const match = /^oauth\.google\.([A-Za-z0-9_-]{1,128})\.refresh-token$/.exec(row.name)
        if (match?.[1] === undefined) {
          throw new SecretVaultError('SECRET_CORRUPTED', 'A credential name is invalid.')
        }
        return match[1]
      })
    } catch (error) {
      throw this.storageFailure('The credential inventory could not be inspected.', error)
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
