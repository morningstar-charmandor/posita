import { describe, expect, it } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import type { ProviderAccountRecordV2 } from './accountState'
import {
  MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS,
  ProviderMailStartupInventoryService
} from './providerMailStartupInventory'

const account = (accountId: string): ProviderAccountRecordV2 => ({
  version: 2,
  accountId,
  provider: 'google',
  providerAccountId: `subject-${accountId}`,
  displayIdentity: { mailboxAddress: `${accountId}@example.test` },
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-09-02T05:00:00.000Z'
})

const service = (
  providerIds: string[],
  credentialIds: string[],
  records = new Map(providerIds.map((id) => [id, account(id)]))
): ProviderMailStartupInventoryService => new ProviderMailStartupInventoryService({
  listProviderAccountIds: () => [...providerIds],
  loadProviderAccount: (accountId) => records.get(accountId)
}, {
  listGoogleRefreshTokenAccountIds: () => [...credentialIds]
})

describe('ProviderMailStartupInventoryService', () => {
  it('returns deterministic sync requests only for complete account pairs', () => {
    expect(service(['work', 'personal'], ['personal', 'work']).inspect()).toEqual({
      version: 1,
      status: 'ready',
      accounts: [
        { version: 1, accountId: 'personal', provider: 'google' },
        { version: 1, accountId: 'work', provider: 'google' }
      ]
    })
    expect(service([], []).inspect()).toEqual({ version: 1, status: 'ready', accounts: [] })
  })

  it('fails closed over every one-sided pair without partially ready accounts', () => {
    expect(service(['work', 'orphan-state'], ['work', 'orphan-credential']).inspect()).toEqual({
      version: 1,
      status: 'recovery-required',
      accounts: [],
      inconsistencies: [
        { accountId: 'orphan-credential', status: 'credential-only' },
        { accountId: 'orphan-state', status: 'provider-state-only' }
      ]
    })
  })

  it('rejects malformed, duplicate, missing, and over-limit inventory', () => {
    expect(() => service(['../unsafe'], []).inspect()).toThrowError(expect.objectContaining({
      code: 'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY', retryable: false
    }))
    expect(() => service(['work', 'work'], ['work']).inspect()).toThrowError(expect.objectContaining({
      code: 'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY'
    }))
    expect(() => service(['work'], ['work'], new Map()).inspect()).toThrowError(expect.objectContaining({
      code: 'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY'
    }))
    const ids = Array.from({ length: MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS + 1 }, (_, i) => `a${i}`)
    expect(() => service(ids, ids).inspect()).toThrowError(expect.objectContaining({
      code: 'PROVIDER_MAIL_STARTUP_ACCOUNT_LIMIT_EXCEEDED'
    }))
  })

  it('maps storage failures to one safe retryable error', () => {
    const inventory = new ProviderMailStartupInventoryService({
      listProviderAccountIds: () => { throw new Error('private database detail') },
      loadProviderAccount: () => undefined
    }, { listGoogleRefreshTokenAccountIds: () => [] })
    expect(() => inventory.inspect()).toThrowError(expect.objectContaining({
      code: 'PROVIDER_MAIL_STARTUP_INVENTORY_UNAVAILABLE',
      retryable: true,
      message: 'The provider-mail startup inventory could not be inspected.'
    }))
  })
})
