import { isDeepStrictEqual } from 'node:util'
import {
  AccountAuthorizationError,
  isAccountAuthorizationLaunchV1,
  isAuthorizedAccountGrantV2,
  isBeginAccountAuthorizationRequestV1,
  type AccountAuthorizationAdapter,
  type AccountAuthorizationLaunchV1,
  type BeginAccountAuthorizationRequestV1,
  type CompleteAccountAuthorizationRequestV1
} from './accountAuthorization'
import {
  isProviderAccountRecordV2,
  isProviderSyncState,
  type AccountStateRepository,
  type ProviderAccountRecordV2,
  type ProviderSyncState
} from './accountState'
import { providerMailSyncRetryPolicy } from './providerMailSyncRetryPolicy'
import { googleRefreshTokenName, type SecretVault } from './secretVault'

export type AccountReauthorizationErrorCode =
  | 'INVALID_ACCOUNT_REAUTHORIZATION_REQUEST'
  | 'ACCOUNT_REAUTHORIZATION_NOT_REQUIRED'
  | 'ACCOUNT_REAUTHORIZATION_RECOVERY_REQUIRED'
  | 'ACCOUNT_REAUTHORIZATION_IDENTITY_MISMATCH'
  | 'ACCOUNT_REAUTHORIZATION_STATE_CHANGED'
  | 'CREDENTIAL_REPLACEMENT_FAILED'

export class AccountReauthorizationError extends Error {
  constructor(
    readonly code: AccountReauthorizationErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountReauthorizationError'
  }
}

interface PendingReauthorization {
  sessionId: string
  account: ProviderAccountRecordV2
  syncState: ProviderSyncState
}

export interface AccountAccessTokenInvalidator {
  invalidate(accountId: string): void
}

/**
 * Trusted credential-renewal coordinator. It preserves the encrypted account,
 * sync cursor, retained mail and connected timestamp. A new refresh credential
 * is accepted only after Google verifies the exact existing subject and mailbox.
 */
export class AccountReauthorizationService {
  private pending?: PendingReauthorization

  constructor(
    private readonly authorization: AccountAuthorizationAdapter,
    private readonly vault: SecretVault,
    private readonly accountState: AccountStateRepository,
    private readonly accessTokens: AccountAccessTokenInvalidator
  ) {}

  async begin(request: BeginAccountAuthorizationRequestV1): Promise<AccountAuthorizationLaunchV1> {
    if (!isBeginAccountAuthorizationRequestV1(request)) throw this.invalid()
    if (this.pending !== undefined) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_IN_PROGRESS',
        'A Google account reauthorization is already pending.',
        false
      )
    }
    const current = await this.loadEligibleState(request.accountId)
    let launch: AccountAuthorizationLaunchV1
    try {
      launch = await this.authorization.begin(request)
    } catch (error) {
      if (error instanceof AccountAuthorizationError) throw error
      throw this.invalid(error)
    }
    if (!isAccountAuthorizationLaunchV1(launch) || launch.accountId !== request.accountId ||
        launch.provider !== request.provider || launch.consentVersion !== request.consentVersion) {
      if (isAccountAuthorizationLaunchV1(launch)) {
        try { await this.authorization.cancel(launch.sessionId) } catch { /* Preserve invalid result. */ }
      }
      throw this.invalid()
    }
    this.pending = { sessionId: launch.sessionId, ...current }
    return launch
  }

  async complete(request: CompleteAccountAuthorizationRequestV1): Promise<ProviderAccountRecordV2> {
    const pending = this.pending
    if (pending === undefined || pending.sessionId !== request.sessionId) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_NOT_FOUND',
        'The Google account reauthorization session is unavailable.',
        false
      )
    }
    let grant
    try {
      grant = await this.authorization.complete(request)
    } catch (error) {
      if (!(error instanceof AccountAuthorizationError) ||
          error.code !== 'AUTHORIZATION_CALLBACK_REJECTED') this.pending = undefined
      if (error instanceof AccountAuthorizationError) throw error
      throw this.invalid(error)
    }
    this.pending = undefined
    if (!isAuthorizedAccountGrantV2(grant) || grant.accountId !== pending.account.accountId) {
      throw this.invalid()
    }
    if (grant.providerAccountId !== pending.account.providerAccountId ||
        grant.mailboxAddress.toLowerCase() !==
          pending.account.displayIdentity.mailboxAddress.toLowerCase()) {
      throw new AccountReauthorizationError(
        'ACCOUNT_REAUTHORIZATION_IDENTITY_MISMATCH',
        'Google authorized a different account. The existing Posita connection was not changed.',
        false
      )
    }

    const current = await this.loadEligibleState(pending.account.accountId)
    if (!isDeepStrictEqual(current.account, pending.account) ||
        !isDeepStrictEqual(current.syncState, pending.syncState)) {
      throw new AccountReauthorizationError(
        'ACCOUNT_REAUTHORIZATION_STATE_CHANGED',
        'The Google account state changed during reauthorization. The existing credential was not changed.',
        true
      )
    }
    try {
      await this.vault.set(googleRefreshTokenName(pending.account.accountId), grant.refreshToken)
      this.accessTokens.invalidate(pending.account.accountId)
    } catch (error) {
      throw new AccountReauthorizationError(
        'CREDENTIAL_REPLACEMENT_FAILED',
        'Posita could not securely replace the expired Google credential.',
        true,
        { cause: error }
      )
    }
    return structuredClone(pending.account)
  }

  async cancel(sessionId: string): Promise<boolean> {
    const cancelled = await this.authorization.cancel(sessionId)
    if (this.pending?.sessionId === sessionId) this.pending = undefined
    return cancelled
  }

  private async loadEligibleState(accountId: string): Promise<{
    account: ProviderAccountRecordV2
    syncState: ProviderSyncState
  }> {
    let account: ProviderAccountRecordV2 | undefined
    let syncState: ProviderSyncState | undefined
    let hasCredential: boolean
    try {
      account = this.accountState.loadProviderAccount(accountId)
      syncState = this.accountState.loadSyncState(accountId)
      hasCredential = await this.vault.has(googleRefreshTokenName(accountId))
    } catch (error) {
      throw new AccountReauthorizationError(
        'ACCOUNT_REAUTHORIZATION_RECOVERY_REQUIRED',
        'Posita could not verify the existing Google account safely.',
        false,
        { cause: error }
      )
    }
    if (!hasCredential || !isProviderAccountRecordV2(account) || account.accountId !== accountId ||
        !isProviderSyncState(syncState) || syncState.accountId !== accountId) {
      throw new AccountReauthorizationError(
        'ACCOUNT_REAUTHORIZATION_RECOVERY_REQUIRED',
        'The existing Google account connection is incomplete and requires recovery.',
        false
      )
    }
    if (syncState.status !== 'error' || syncState.lastErrorCode === undefined ||
        providerMailSyncRetryPolicy(syncState.lastErrorCode).disposition !== 'reconnect-required') {
      throw new AccountReauthorizationError(
        'ACCOUNT_REAUTHORIZATION_NOT_REQUIRED',
        'This Google account does not currently require reauthorization.',
        false
      )
    }
    return { account: structuredClone(account), syncState: structuredClone(syncState) }
  }

  private invalid(cause?: unknown): AccountReauthorizationError {
    return new AccountReauthorizationError(
      'INVALID_ACCOUNT_REAUTHORIZATION_REQUEST',
      'The Google account reauthorization request is invalid.',
      false,
      cause === undefined ? undefined : { cause }
    )
  }
}
