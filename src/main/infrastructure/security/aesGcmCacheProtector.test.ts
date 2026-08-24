import { describe, expect, it } from 'vitest'
import {
  EncryptedCacheError,
  MAX_CACHE_PLAINTEXT_BYTES,
  type CacheRecordContext
} from '../../application/encryptedCache'
import { AesGcmCacheProtector } from './aesGcmCacheProtector'

const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const context: CacheRecordContext = {
  recordType: 'message',
  recordId: 'message-1',
  accountScope: 'account-1',
  position: 0
}

const incrementingNonce = () => {
  let counter = 0
  return (size: number): Uint8Array => {
    counter += 1
    return Uint8Array.from({ length: size }, (_, index) => (counter + index) % 256)
  }
}

describe('AesGcmCacheProtector', () => {
  it('round-trips UTF-8 data with a versioned non-plaintext envelope', () => {
    const protector = new AesGcmCacheProtector(key, incrementingNonce())
    const plaintext = 'Private mail body — नमस्ते'

    const envelope = protector.protect(context, plaintext)

    expect(Buffer.from(envelope).subarray(0, 4).toString('ascii')).toBe('PSTA')
    expect(Buffer.from(envelope).includes(Buffer.from(plaintext))).toBe(false)
    expect(protector.unprotect(context, envelope)).toBe(plaintext)
  })

  it('uses a different nonce for repeated encryption', () => {
    const protector = new AesGcmCacheProtector(key, incrementingNonce())

    const first = protector.protect(context, 'same value')
    const second = protector.protect(context, 'same value')

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false)
    expect(protector.unprotect(context, first)).toBe('same value')
    expect(protector.unprotect(context, second)).toBe('same value')
  })

  it('rejects ciphertext tampering, wrong metadata, and a wrong key', () => {
    const protector = new AesGcmCacheProtector(key, incrementingNonce())
    const envelope = protector.protect(context, 'source-grounded private value')
    const tampered = Uint8Array.from(envelope)
    const lastIndex = tampered.length - 1
    tampered[lastIndex] = tampered[lastIndex]! ^ 0xff

    for (const attempt of [
      () => protector.unprotect(context, tampered),
      () => protector.unprotect({ ...context, recordId: 'message-2' }, envelope),
      () => new AesGcmCacheProtector(Uint8Array.from(key, (byte) => byte ^ 0xff))
        .unprotect(context, envelope)
    ]) {
      expect(attempt).toThrowError(
        expect.objectContaining<Partial<EncryptedCacheError>>({
          code: 'CACHE_AUTHENTICATION_FAILED'
        })
      )
    }
  })

  it('rejects malformed, oversized, and unsupported envelopes', () => {
    const protector = new AesGcmCacheProtector(key, incrementingNonce())
    const envelope = protector.protect(context, 'value')
    const unsupported = Uint8Array.from(envelope)
    unsupported[4] = 99

    for (const value of [new Uint8Array(), unsupported]) {
      expect(() => protector.unprotect(context, value)).toThrowError(
        expect.objectContaining<Partial<EncryptedCacheError>>({ code: 'CACHE_ENVELOPE_INVALID' })
      )
    }

    expect(() => protector.protect(context, 'x'.repeat(MAX_CACHE_PLAINTEXT_BYTES + 1)))
      .toThrowError(expect.objectContaining<Partial<EncryptedCacheError>>({
        code: 'CACHE_RECORD_INVALID'
      }))
  })
})
