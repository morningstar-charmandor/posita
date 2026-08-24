import { SecretVaultError } from '../../application/secretVault'
import type { StringProtector, UnprotectedString } from './stringProtector'

const header = Uint8Array.from([0x50, 0x46, 0x41, 0x4b, 0x01])
const mask = 0xa5

export class DeterministicFakeStringProtector implements StringProtector {
  readonly scheme = 'deterministic-fake-v1'

  async protect(value: string): Promise<Uint8Array> {
    const bytes = new TextEncoder().encode(value)
    return Uint8Array.from([...header, ...bytes.map((byte) => byte ^ mask)])
  }

  async unprotect(value: Uint8Array): Promise<UnprotectedString> {
    const hasHeader = header.every((byte, index) => value[index] === byte)
    if (!hasHeader) {
      throw new SecretVaultError('SECRET_CORRUPTED', 'The fake protected value is invalid.')
    }

    const bytes = value.slice(header.length).map((byte) => byte ^ mask)
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(bytes), shouldReprotect: false }
  }
}
