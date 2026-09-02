import {
  isAccountId,
  isProviderAccountRecordV2,
  type ProviderAccountRecordV2
} from './accountState'
import type { SyncAccountRequestV1 } from './mailSync'
import { MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS } from './providerMailLimits.ts'

export { MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS } from './providerMailLimits.ts'

export interface ProviderAccountInventorySource {
  listProviderAccountIds(): string[]
  loadProviderAccount(accountId: string): ProviderAccountRecordV2 | undefined
}

export interface GoogleCredentialInventorySource {
  listGoogleRefreshTokenAccountIds(): string[]
}

export type ProviderMailStartupInventoryV1 =
  | {
      version: 1
      status: 'ready'
      accounts: SyncAccountRequestV1[]
    }
  | {
      version: 1
      status: 'recovery-required'
      accounts: []
      inconsistencies: Array<{
        accountId: string
        status: 'credential-only' | 'provider-state-only'
      }>
    }

export type ProviderMailStartupInventoryErrorCode =
  | 'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY'
  | 'PROVIDER_MAIL_STARTUP_ACCOUNT_LIMIT_EXCEEDED'
  | 'PROVIDER_MAIL_STARTUP_INVENTORY_UNAVAILABLE'

export class ProviderMailStartupInventoryError extends Error {
  constructor(
    readonly code: ProviderMailStartupInventoryErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ProviderMailStartupInventoryError'
  }
}

const validateIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every(isAccountId) ||
      new Set(value).size !== value.length) {
    throw new ProviderMailStartupInventoryError(
      'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY',
      'The provider-mail startup inventory is invalid.',
      false
    )
  }
  return value.map((accountId) => accountId)
}

/**
 * Trusted read-only preflight for future provider lifecycle composition. It
 * enumerates presence only and never loads credential values or starts sync.
 */
export class ProviderMailStartupInventoryService {
  constructor(
    private readonly accountState: ProviderAccountInventorySource,
    private readonly credentials: GoogleCredentialInventorySource
  ) {}

  inspect(): ProviderMailStartupInventoryV1 {
    try {
      const providerIds = validateIds(this.accountState.listProviderAccountIds())
      const credentialIds = validateIds(this.credentials.listGoogleRefreshTokenAccountIds())
      const allIds = [...new Set([...providerIds, ...credentialIds])].sort()
      if (allIds.length > MAX_PROVIDER_MAIL_STARTUP_ACCOUNTS) {
        throw new ProviderMailStartupInventoryError(
          'PROVIDER_MAIL_STARTUP_ACCOUNT_LIMIT_EXCEEDED',
          'Too many provider accounts are present for safe startup.',
          false
        )
      }

      const providerSet = new Set(providerIds)
      const credentialSet = new Set(credentialIds)
      const inconsistencies: Extract<ProviderMailStartupInventoryV1, {
        status: 'recovery-required'
      }>['inconsistencies'] = []
      const accounts: SyncAccountRequestV1[] = []

      for (const accountId of allIds) {
        const hasProviderState = providerSet.has(accountId)
        const hasCredential = credentialSet.has(accountId)
        if (!hasProviderState || !hasCredential) {
          inconsistencies.push({
            accountId,
            status: hasCredential ? 'credential-only' : 'provider-state-only'
          })
          continue
        }
        const account = this.accountState.loadProviderAccount(accountId)
        if (!isProviderAccountRecordV2(account) || account.accountId !== accountId ||
            account.provider !== 'google') {
          throw new ProviderMailStartupInventoryError(
            'INVALID_PROVIDER_MAIL_STARTUP_INVENTORY',
            'The provider-mail startup inventory is invalid.',
            false
          )
        }
        accounts.push({ version: 1, accountId, provider: 'google' })
      }

      return inconsistencies.length > 0
        ? { version: 1, status: 'recovery-required', accounts: [], inconsistencies }
        : { version: 1, status: 'ready', accounts }
    } catch (error) {
      if (error instanceof ProviderMailStartupInventoryError) throw error
      throw new ProviderMailStartupInventoryError(
        'PROVIDER_MAIL_STARTUP_INVENTORY_UNAVAILABLE',
        'The provider-mail startup inventory could not be inspected.',
        true,
        { cause: error }
      )
    }
  }
}
