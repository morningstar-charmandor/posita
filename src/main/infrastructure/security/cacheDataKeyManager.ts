import { randomBytes } from 'node:crypto'
import {
  EncryptedCacheError
} from '../../application/encryptedCache'
import {
  CACHE_DATA_KEY_NAME,
  type SecretVault
} from '../../application/secretVault'

const keyByteLength = 32
const encodedKeyPattern = /^[A-Za-z0-9+/]{43}=$/

export type KeySource = (size: number) => Uint8Array

const decodeKey = (encoded: string): Uint8Array => {
  if (!encodedKeyPattern.test(encoded)) {
    throw new EncryptedCacheError('CACHE_KEY_INVALID', 'The protected cache key is invalid.')
  }
  const key = Buffer.from(encoded, 'base64')
  if (key.byteLength !== keyByteLength || key.toString('base64') !== encoded) {
    throw new EncryptedCacheError('CACHE_KEY_INVALID', 'The protected cache key is invalid.')
  }
  return key
}

export class CacheDataKeyManager {
  constructor(
    private readonly vault: SecretVault,
    private readonly keySource: KeySource = randomBytes
  ) {}

  async loadOrCreate(hasEncryptedRecords: boolean): Promise<Uint8Array> {
    const encoded = await this.vault.get(CACHE_DATA_KEY_NAME)
    if (encoded !== undefined) return decodeKey(encoded)

    if (hasEncryptedRecords) {
      throw new EncryptedCacheError(
        'CACHE_KEY_MISSING',
        'Encrypted cache data exists but its protected key is missing.'
      )
    }

    const key = Buffer.from(this.keySource(keyByteLength))
    if (key.byteLength !== keyByteLength) {
      throw new EncryptedCacheError('CACHE_KEY_INVALID', 'The key source returned invalid data.')
    }
    await this.vault.set(CACHE_DATA_KEY_NAME, key.toString('base64'))
    return key
  }

  async loadExisting(): Promise<Uint8Array> {
    const encoded = await this.vault.get(CACHE_DATA_KEY_NAME)
    if (encoded === undefined) {
      throw new EncryptedCacheError(
        'CACHE_KEY_MISSING',
        'A pending lifecycle operation requires the existing protected cache key.'
      )
    }
    return decodeKey(encoded)
  }

  async delete(): Promise<boolean> {
    return this.vault.delete(CACHE_DATA_KEY_NAME)
  }
}
