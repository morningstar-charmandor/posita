import { safeStorage, type SafeStorage } from 'electron'
import { SecretVaultError } from '../../application/secretVault'
import {
  protectionUnavailable,
  type StringProtector,
  type UnprotectedString
} from './stringProtector'

type SafeStoragePort = Pick<
  SafeStorage,
  | 'decryptStringAsync'
  | 'encryptStringAsync'
  | 'getSelectedStorageBackend'
  | 'isAsyncEncryptionAvailable'
>

export class ElectronSafeStorageProtector implements StringProtector {
  readonly scheme = 'electron-safe-storage-async-v1'

  constructor(
    private readonly storage: SafeStoragePort = safeStorage,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  async protect(value: string): Promise<Uint8Array> {
    await this.assertAvailable()
    try {
      return await this.storage.encryptStringAsync(value)
    } catch (error) {
      throw protectionUnavailable({ cause: error })
    }
  }

  async unprotect(value: Uint8Array): Promise<UnprotectedString> {
    await this.assertAvailable()
    try {
      const result = await this.storage.decryptStringAsync(Buffer.from(value))
      return { value: result.result, shouldReprotect: result.shouldReEncrypt }
    } catch (error) {
      throw new SecretVaultError(
        'SECRET_CORRUPTED',
        'The stored credential could not be decrypted.',
        { cause: error }
      )
    }
  }

  private async assertAvailable(): Promise<void> {
    try {
      const available = await this.storage.isAsyncEncryptionAvailable()
      const backend = this.platform === 'linux'
        ? this.storage.getSelectedStorageBackend()
        : undefined

      if (!available || backend === 'basic_text' || backend === 'unknown') {
        throw protectionUnavailable()
      }
    } catch (error) {
      if (error instanceof SecretVaultError) throw error
      throw protectionUnavailable({ cause: error })
    }
  }
}
