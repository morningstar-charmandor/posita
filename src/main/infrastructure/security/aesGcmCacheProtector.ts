import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from 'node:crypto'
import {
  CACHE_ENVELOPE_SCHEME,
  CACHE_ENVELOPE_VERSION,
  EncryptedCacheError,
  MAX_CACHE_PLAINTEXT_BYTES,
  type CacheRecordContext,
  type CacheRecordProtector
} from '../../application/encryptedCache'

const magic = Buffer.from('PSTA', 'ascii')
const headerLength = magic.length + 1
const nonceLength = 12
const tagLength = 16
const minimumEnvelopeLength = headerLength + nonceLength + tagLength

export type NonceSource = (size: number) => Uint8Array

const assertContext = (context: CacheRecordContext): void => {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/.test(context.recordType) ||
    context.recordId.length < 1 || context.recordId.length > 256 ||
    (context.accountScope !== undefined &&
      (context.accountScope.length < 1 || context.accountScope.length > 256)) ||
    !Number.isSafeInteger(context.position) || context.position < 0
  ) {
    throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'Cache record metadata is invalid.')
  }
}

const associatedData = (context: CacheRecordContext): Buffer => Buffer.from(JSON.stringify([
  'posita-cache',
  CACHE_ENVELOPE_VERSION,
  'encrypted_records',
  'payload',
  context.recordType,
  context.recordId,
  context.accountScope ?? null,
  context.position
]), 'utf8')

const hasExpectedHeader = (envelope: Buffer): boolean =>
  envelope.length >= minimumEnvelopeLength &&
  envelope.subarray(0, magic.length).equals(magic) &&
  envelope[magic.length] === CACHE_ENVELOPE_VERSION

export class AesGcmCacheProtector implements CacheRecordProtector {
  readonly scheme = CACHE_ENVELOPE_SCHEME
  private readonly key: Buffer
  private destroyed = false

  constructor(key: Uint8Array, private readonly nonceSource: NonceSource = randomBytes) {
    if (key.byteLength !== 32) {
      throw new EncryptedCacheError('CACHE_KEY_INVALID', 'The cache key has an invalid length.')
    }
    this.key = Buffer.from(key)
  }

  protect(context: CacheRecordContext, plaintext: string): Uint8Array {
    this.assertAvailable()
    assertContext(context)
    const input = Buffer.from(plaintext, 'utf8')
    if (input.byteLength > MAX_CACHE_PLAINTEXT_BYTES) {
      throw new EncryptedCacheError('CACHE_RECORD_INVALID', 'The cache record is too large.')
    }

    const nonce = Buffer.from(this.nonceSource(nonceLength))
    if (nonce.byteLength !== nonceLength) {
      throw new EncryptedCacheError('CACHE_ENVELOPE_INVALID', 'The nonce source returned invalid data.')
    }

    try {
      const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: tagLength })
      cipher.setAAD(associatedData(context))
      const ciphertext = Buffer.concat([cipher.update(input), cipher.final()])
      const header = Buffer.concat([magic, Buffer.from([CACHE_ENVELOPE_VERSION])])
      return Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext])
    } catch (error) {
      if (error instanceof EncryptedCacheError) throw error
      throw new EncryptedCacheError(
        'CACHE_ENVELOPE_INVALID',
        'The cache record could not be encrypted.',
        { cause: error }
      )
    }
  }

  unprotect(context: CacheRecordContext, value: Uint8Array): string {
    this.assertAvailable()
    assertContext(context)
    const envelope = Buffer.from(value)
    if (!hasExpectedHeader(envelope) ||
        envelope.byteLength > MAX_CACHE_PLAINTEXT_BYTES + minimumEnvelopeLength) {
      throw new EncryptedCacheError('CACHE_ENVELOPE_INVALID', 'The cache envelope is invalid.')
    }

    const nonceStart = headerLength
    const tagStart = nonceStart + nonceLength
    const ciphertextStart = tagStart + tagLength
    const nonce = envelope.subarray(nonceStart, tagStart)
    const tag = envelope.subarray(tagStart, ciphertextStart)
    const ciphertext = envelope.subarray(ciphertextStart)

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, { authTagLength: tagLength })
      decipher.setAAD(associatedData(context))
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch (error) {
      throw new EncryptedCacheError(
        'CACHE_AUTHENTICATION_FAILED',
        'The cache record failed authentication.',
        { cause: error }
      )
    }
  }

  destroy(): void {
    this.key.fill(0)
    this.destroyed = true
  }

  private assertAvailable(): void {
    if (this.destroyed) {
      throw new EncryptedCacheError('CACHE_KEY_MISSING', 'The cache key is no longer available.')
    }
  }
}
