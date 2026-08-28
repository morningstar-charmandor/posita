import {
  AccountAuthorizationError,
  isAccountAuthorizationLaunchV1,
  isAuthorizedAccountGrantV1,
  isBeginAccountAuthorizationRequestV1,
  type AccountAuthorizationAdapter,
  type AccountAuthorizationLaunchV1,
  type BeginAccountAuthorizationRequestV1,
  type CompleteAccountAuthorizationRequestV1
} from './accountAuthorization'
import {
  isAccountId,
  isProviderAccountRecordV1,
  type AccountStateRepository,
  type ProviderAccountRecordV1
} from './accountState'
import { googleRefreshTokenName, type SecretVault } from './secretVault'

export type AccountConnectionErrorCode =
  | 'INVALID_ACCOUNT_CONNECTION_REQUEST'
  | 'ACCOUNT_ALREADY_CONNECTED'
  | 'ACCOUNT_CONNECTION_RECOVERY_REQUIRED'
  | 'AUTHORIZATION_RESULT_INVALID'
  | 'CREDENTIAL_STORAGE_FAILED'
  | 'ACCOUNT_STATE_STORAGE_FAILED'
  | 'ACCOUNT_CONNECTION_ROLLBACK_FAILED'

export class AccountConnectionError extends Error {
  constructor(
    readonly code: AccountConnectionErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountConnectionError'
  }
}

interface PendingConnection {
  sessionId: string
  accountId: string
}

export type AccountConnectionConsistencyStatus =
  | 'absent'
  | 'connected'
  | 'credential-only'
  | 'provider-state-only'

export interface AccountConnectionConsistencyV1 {
  version: 1
  accountId: string
  status: AccountConnectionConsistencyStatus
}

export const isAccountConnectionConsistencyV1 = (
  value: unknown
): value is AccountConnectionConsistencyV1 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return Object.keys(result).length === 3 &&
    Object.keys(result).every((key) => ['version', 'accountId', 'status'].includes(key)) &&
    result.version === 1 && isAccountId(result.accountId) &&
    (result.status === 'absent' || result.status === 'connected' ||
      result.status === 'credential-only' || result.status === 'provider-state-only')
}

/**
 * Trusted application coordinator. This service is intentionally not composed
 * into startup or IPC until live authorization is separately approved.
 */
export class AccountConnectionService {
  private pending?: PendingConnection

  constructor(
    private readonly authorization: AccountAuthorizationAdapter,
    private readonly vault: SecretVault,
    private readonly accountState: AccountStateRepository
  ) {}

  async begin(
    request: BeginAccountAuthorizationRequestV1
  ): Promise<AccountAuthorizationLaunchV1> {
    if (!isBeginAccountAuthorizationRequestV1(request)) {
      throw new AccountAuthorizationError(
        'INVALID_AUTHORIZATION_REQUEST',
        'The authorization request is invalid.',
        false
      )
    }
    if (this.pending !== undefined) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_IN_PROGRESS',
        'An account authorization session is already pending.',
        false
      )
    }
    await this.assertAccountIsAvailable(request.accountId)
    let launch
    try {
      launch = await this.authorization.begin(request)
    } catch (error) {
      if (error instanceof AccountAuthorizationError) throw error
      throw this.invalidAuthorizationResult(error)
    }
    if (!isAccountAuthorizationLaunchV1(launch) ||
        launch.accountId !== request.accountId ||
        launch.provider !== request.provider ||
        launch.consentVersion !== request.consentVersion) {
      await this.cancelInvalidLaunch(launch)
      throw this.invalidAuthorizationResult()
    }
    this.pending = { sessionId: launch.sessionId, accountId: launch.accountId }
    return launch
  }

  async complete(
    request: CompleteAccountAuthorizationRequestV1
  ): Promise<ProviderAccountRecordV1> {
    const pending = this.pending
    if (pending === undefined || pending.sessionId !== request.sessionId) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_NOT_FOUND',
        'The authorization session is unavailable.',
        false
      )
    }

    let grant
    try {
      grant = await this.authorization.complete(request)
    } catch (error) {
      if (!(error instanceof AccountAuthorizationError)) {
        this.pending = undefined
        throw this.invalidAuthorizationResult(error)
      }
      if (this.isTerminalAuthorizationFailure(error)) this.pending = undefined
      throw error
    }

    this.pending = undefined
    if (!isAuthorizedAccountGrantV1(grant) ||
        grant.sessionId !== pending.sessionId ||
        grant.accountId !== pending.accountId) {
      throw this.invalidAuthorizationResult()
    }

    await this.assertAccountIsAvailable(grant.accountId)
    const secretName = googleRefreshTokenName(grant.accountId)
    try {
      await this.vault.set(secretName, grant.refreshToken)
    } catch (error) {
      await this.rollbackCredentialAfterFailedWrite(secretName, error)
      throw new AccountConnectionError(
        'CREDENTIAL_STORAGE_FAILED',
        'The account credential could not be stored. Start the connection again.',
        true,
        { cause: error }
      )
    }

    const account: ProviderAccountRecordV1 = {
      version: 1,
      accountId: grant.accountId,
      provider: grant.provider,
      providerAccountId: grant.providerAccountId,
      consentVersion: grant.consentVersion,
      connectedAt: grant.connectedAt
    }
    if (!isProviderAccountRecordV1(account)) {
      await this.rollbackAfterAccountStateFailure(secretName, grant.accountId)
      throw this.invalidAuthorizationResult()
    }

    try {
      this.accountState.saveProviderAccount(account)
    } catch (error) {
      await this.rollbackAfterAccountStateFailure(secretName, grant.accountId, error)
      throw new AccountConnectionError(
        'ACCOUNT_STATE_STORAGE_FAILED',
        'The account state could not be stored. Start the connection again.',
        true,
        { cause: error }
      )
    }
    return account
  }

  async cancel(sessionId: string): Promise<boolean> {
    let cancelled: boolean
    try {
      cancelled = await this.authorization.cancel(sessionId)
    } catch (error) {
      if (error instanceof AccountAuthorizationError) throw error
      throw this.invalidAuthorizationResult(error)
    }
    if (this.pending?.sessionId === sessionId) this.pending = undefined
    return cancelled
  }

  async inspect(accountId: string): Promise<AccountConnectionConsistencyV1> {
    if (!isAccountId(accountId)) {
      throw new AccountConnectionError(
        'INVALID_ACCOUNT_CONNECTION_REQUEST',
        'The account connection request is invalid.',
        false
      )
    }
    let hasProviderState: boolean
    let hasCredential: boolean
    try {
      hasProviderState = this.accountState.hasProviderAccount(accountId)
      hasCredential = await this.vault.has(googleRefreshTokenName(accountId))
    } catch (error) {
      throw new AccountConnectionError(
        'ACCOUNT_CONNECTION_RECOVERY_REQUIRED',
        'Existing account connection state could not be verified.',
        false,
        { cause: error }
      )
    }
    const status: AccountConnectionConsistencyStatus = hasProviderState
      ? (hasCredential ? 'connected' : 'provider-state-only')
      : (hasCredential ? 'credential-only' : 'absent')
    return { version: 1, accountId, status }
  }

  private async assertAccountIsAvailable(accountId: string): Promise<void> {
    const consistency = await this.inspect(accountId)
    if (consistency.status === 'connected') {
      throw new AccountConnectionError(
        'ACCOUNT_ALREADY_CONNECTED',
        'This Posita account is already connected.',
        false
      )
    }
    if (consistency.status !== 'absent') {
      throw new AccountConnectionError(
        'ACCOUNT_CONNECTION_RECOVERY_REQUIRED',
        'Incomplete account connection state requires recovery.',
        false
      )
    }
  }

  private async cancelInvalidLaunch(value: unknown): Promise<void> {
    if (!isAccountAuthorizationLaunchV1(value)) return
    try {
      await this.authorization.cancel(value.sessionId)
    } catch {
      // The invalid provider result remains the authoritative safe failure.
    }
  }

  private isTerminalAuthorizationFailure(error: unknown): boolean {
    return error instanceof AccountAuthorizationError &&
      error.code !== 'AUTHORIZATION_PROVIDER_UNAVAILABLE' &&
      error.code !== 'AUTHORIZATION_CALLBACK_REJECTED'
  }

  private async rollbackCredentialAfterFailedWrite(
    secretName: ReturnType<typeof googleRefreshTokenName>,
    cause: unknown
  ): Promise<void> {
    try {
      await this.vault.delete(secretName)
    } catch (rollbackError) {
      throw this.rollbackFailure(cause, rollbackError)
    }
  }

  private async rollbackAfterAccountStateFailure(
    secretName: ReturnType<typeof googleRefreshTokenName>,
    accountId: string,
    cause?: unknown
  ): Promise<void> {
    let accountStateError: unknown
    let credentialError: unknown
    try {
      this.accountState.deleteAccountState(accountId)
    } catch (error) {
      accountStateError = error
    }
    try {
      const removed = await this.vault.delete(secretName)
      if (!removed) credentialError = new Error('Credential rollback target was absent.')
    } catch (error) {
      credentialError = error
    }
    if (accountStateError !== undefined || credentialError !== undefined) {
      throw this.rollbackFailure(cause, accountStateError ?? credentialError)
    }
  }

  private invalidAuthorizationResult(cause?: unknown): AccountConnectionError {
    return new AccountConnectionError(
      'AUTHORIZATION_RESULT_INVALID',
      'The authorization provider returned an invalid result.',
      false,
      cause === undefined ? undefined : { cause }
    )
  }

  private rollbackFailure(cause: unknown, rollbackError: unknown): AccountConnectionError {
    return new AccountConnectionError(
      'ACCOUNT_CONNECTION_ROLLBACK_FAILED',
      'Account connection cleanup requires recovery.',
      false,
      { cause: new AggregateError([cause, rollbackError]) }
    )
  }
}
