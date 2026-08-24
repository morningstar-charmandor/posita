import type { SafeStorage } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { SecretVaultError } from '../../application/secretVault'
import { ElectronSafeStorageProtector } from './electronSafeStorageProtector'

type StorageBackend = ReturnType<SafeStorage['getSelectedStorageBackend']>

const createStorage = () => ({
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  getSelectedStorageBackend: vi.fn((): StorageBackend => 'gnome_libsecret'),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`protected:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({
    result: value.toString().replace('protected:', ''),
    shouldReEncrypt: false
  }))
})

describe('ElectronSafeStorageProtector', () => {
  it('uses only the asynchronous OS storage operations', async () => {
    const storage = createStorage()
    const protector = new ElectronSafeStorageProtector(storage, 'darwin')

    const ciphertext = await protector.protect('refresh-secret')
    const result = await protector.unprotect(ciphertext)

    expect(Buffer.from(ciphertext).toString()).toBe('protected:refresh-secret')
    expect(result).toEqual({ value: 'refresh-secret', shouldReprotect: false })
    expect(storage.isAsyncEncryptionAvailable).toHaveBeenCalledTimes(2)
  })

  it('fails closed when async OS protection is unavailable', async () => {
    const storage = createStorage()
    storage.isAsyncEncryptionAvailable.mockResolvedValue(false)
    const protector = new ElectronSafeStorageProtector(storage, 'darwin')

    await expect(protector.protect('refresh-secret')).rejects.toEqual(
      expect.objectContaining<Partial<SecretVaultError>>({ code: 'PROTECTION_UNAVAILABLE' })
    )
    expect(storage.encryptStringAsync).not.toHaveBeenCalled()
  })

  it('rejects Linux plaintext and unknown storage backends', async () => {
    for (const backend of ['basic_text', 'unknown'] as const) {
      const storage = createStorage()
      storage.getSelectedStorageBackend.mockReturnValue(backend)
      const protector = new ElectronSafeStorageProtector(storage, 'linux')

      await expect(protector.protect('refresh-secret')).rejects.toEqual(
        expect.objectContaining<Partial<SecretVaultError>>({ code: 'PROTECTION_UNAVAILABLE' })
      )
      expect(storage.encryptStringAsync).not.toHaveBeenCalled()
    }
  })
})
