import { describe, expect, it } from 'vitest'
import { EncryptedCacheError } from '../../application/encryptedCache'
import {
  CACHE_DATA_KEY_NAME,
  type SecretName,
  type SecretVault
} from '../../application/secretVault'
import { CacheDataKeyManager } from './cacheDataKeyManager'

class MemorySecretVault implements SecretVault {
  readonly values = new Map<SecretName, string>()

  async set(name: SecretName, value: string): Promise<void> {
    this.values.set(name, value)
  }

  async get(name: SecretName): Promise<string | undefined> {
    return this.values.get(name)
  }

  async delete(name: SecretName): Promise<boolean> {
    return this.values.delete(name)
  }

  async deleteGoogleRefreshTokens(): Promise<number> {
    let deleted = 0
    for (const name of [...this.values.keys()]) {
      if (name.startsWith('oauth.google.') && name.endsWith('.refresh-token')) {
        if (this.values.delete(name)) deleted += 1
      }
    }
    return deleted
  }
}

const deterministicKey = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)

describe('CacheDataKeyManager', () => {
  it('creates, protects, and subsequently reloads one installation key', async () => {
    const vault = new MemorySecretVault()
    let generations = 0
    const manager = new CacheDataKeyManager(vault, () => {
      generations += 1
      return deterministicKey
    })

    const created = await manager.loadOrCreate(false)
    const loaded = await manager.loadOrCreate(true)

    expect(Buffer.from(created).equals(Buffer.from(deterministicKey))).toBe(true)
    expect(Buffer.from(loaded).equals(Buffer.from(deterministicKey))).toBe(true)
    expect(generations).toBe(1)
    expect(vault.values.get(CACHE_DATA_KEY_NAME)).toBe(
      Buffer.from(deterministicKey).toString('base64')
    )
  })

  it('fails closed rather than replacing a missing key over encrypted data', async () => {
    const manager = new CacheDataKeyManager(new MemorySecretVault(), () => deterministicKey)

    await expect(manager.loadOrCreate(true)).rejects.toEqual(
      expect.objectContaining<Partial<EncryptedCacheError>>({ code: 'CACHE_KEY_MISSING' })
    )
  })

  it('requires an existing key during lifecycle recovery and never creates one', async () => {
    const vault = new MemorySecretVault()
    let generations = 0
    const manager = new CacheDataKeyManager(vault, () => {
      generations += 1
      return deterministicKey
    })

    await expect(manager.loadExisting()).rejects.toEqual(
      expect.objectContaining<Partial<EncryptedCacheError>>({ code: 'CACHE_KEY_MISSING' })
    )
    expect(generations).toBe(0)
    expect(vault.values.size).toBe(0)

    await vault.set(CACHE_DATA_KEY_NAME, Buffer.from(deterministicKey).toString('base64'))
    await expect(manager.loadExisting()).resolves.toEqual(Buffer.from(deterministicKey))
    expect(generations).toBe(0)
  })

  it('rejects a corrupt protected key', async () => {
    const vault = new MemorySecretVault()
    vault.values.set(CACHE_DATA_KEY_NAME, 'not-a-valid-key')
    const manager = new CacheDataKeyManager(vault, () => deterministicKey)

    await expect(manager.loadOrCreate(true)).rejects.toEqual(
      expect.objectContaining<Partial<EncryptedCacheError>>({ code: 'CACHE_KEY_INVALID' })
    )
  })

  it('deletes the protected installation key for cryptographic erasure', async () => {
    const vault = new MemorySecretVault()
    const manager = new CacheDataKeyManager(vault, () => deterministicKey)
    await manager.loadOrCreate(false)

    expect(await manager.delete()).toBe(true)
    expect(await manager.delete()).toBe(false)
  })
})
