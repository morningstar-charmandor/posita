import {
  type AccountConnectionConsistencyStatus,
  type AccountConnectionService
} from './accountConnection'
import { isAccountId, type AccountStateRepository } from './accountState'
import { isOperationId } from './accountLifecycle'
import { googleRefreshTokenName, type SecretVault } from './secretVault'

export type RecoverableAccountConnectionStatus =
  | 'credential-only'
  | 'provider-state-only'

export interface RecoverAccountConnectionRequestV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatus
}

export interface AccountConnectionRecoveryResultV1 {
  version: 1
  operationId: string
  accountId: string
  status: 'absent'
  removed: 'credential' | 'provider-state'
  reconnectRequired: true
}

/**
 * A producer of this verifier must persist an auditable, short-lived receipt
 * bound to every field in the request. No production verifier exists yet.
 */
export interface AccountConnectionRecoveryConfirmationVerifier {
  isValid(request: RecoverAccountConnectionRequestV1): boolean
}

export type AccountConnectionRecoveryErrorCode =
  | 'INVALID_ACCOUNT_CONNECTION_RECOVERY_REQUEST'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED'
  | 'ACCOUNT_CONNECTION_RECOVERY_NOT_NEEDED'
  | 'ACCOUNT_CONNECTION_RECOVERY_REFUSED'
  | 'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED'
  | 'ACCOUNT_CONNECTION_RECOVERY_DELETE_FAILED'
  | 'ACCOUNT_CONNECTION_RECOVERY_INCOMPLETE'

export class AccountConnectionRecoveryError extends Error {
  constructor(
    readonly code: AccountConnectionRecoveryErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountConnectionRecoveryError'
  }
}

const requestKeys = [
  'version', 'confirmationId', 'operationId', 'action', 'accountId', 'expectedStatus'
] as const

export const isRecoverAccountConnectionRequestV1 = (
  value: unknown
): value is RecoverAccountConnectionRequestV1 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  return Object.keys(request).length === requestKeys.length &&
    Object.keys(request).every((key) => requestKeys.includes(key as typeof requestKeys[number])) &&
    request.version === 1 && isOperationId(request.confirmationId) &&
    isOperationId(request.operationId) && request.confirmationId !== request.operationId &&
    request.action === 'discard-orphaned-local-connection-state' &&
    isAccountId(request.accountId) &&
    (request.expectedStatus === 'credential-only' || request.expectedStatus === 'provider-state-only')
}

/**
 * Main-process-only recovery policy. It never contacts a provider, reconstructs
 * missing data, or repairs a complete account. Production composition remains
 * blocked until an explicit confirmation producer is approved and implemented.
 */
export class AccountConnectionRecoveryService {
  constructor(
    private readonly connections: AccountConnectionService,
    private readonly confirmations: AccountConnectionRecoveryConfirmationVerifier,
    private readonly vault: SecretVault,
    private readonly accountState: AccountStateRepository
  ) {}

  async recover(request: unknown): Promise<AccountConnectionRecoveryResultV1> {
    if (!isRecoverAccountConnectionRequestV1(request)) {
      throw new AccountConnectionRecoveryError(
        'INVALID_ACCOUNT_CONNECTION_RECOVERY_REQUEST',
        'The account connection recovery request is invalid.',
        false
      )
    }

    const recoveryRequest: RecoverAccountConnectionRequestV1 = Object.freeze({ ...request })

    const initial = await this.connections.inspect(recoveryRequest.accountId)
    this.assertRecoverable(initial.status, recoveryRequest.expectedStatus)

    let confirmed: boolean
    try {
      confirmed = this.confirmations.isValid(recoveryRequest)
    } catch (error) {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED',
        'The account connection recovery confirmation could not be verified.',
        false,
        { cause: error }
      )
    }
    if (!confirmed) {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED',
        'A valid account-bound confirmation is required.',
        false
      )
    }

    const current = await this.connections.inspect(recoveryRequest.accountId)
    if (current.status !== recoveryRequest.expectedStatus) {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED',
        'The account connection state changed after confirmation. Review it again.',
        false
      )
    }

    const removed = recoveryRequest.expectedStatus === 'credential-only'
      ? await this.deleteCredential(recoveryRequest.accountId)
      : this.deleteProviderState(recoveryRequest.accountId)
    if (!removed) {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_INCOMPLETE',
        'The orphaned account connection state was not removed.',
        false
      )
    }

    const finalState = await this.connections.inspect(recoveryRequest.accountId)
    if (finalState.status !== 'absent') {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_INCOMPLETE',
        'The account connection remains inconsistent and requires review.',
        false
      )
    }
    return {
      version: 1,
      operationId: recoveryRequest.operationId,
      accountId: recoveryRequest.accountId,
      status: 'absent',
      removed: recoveryRequest.expectedStatus === 'credential-only'
        ? 'credential'
        : 'provider-state',
      reconnectRequired: true
    }
  }

  private assertRecoverable(
    current: AccountConnectionConsistencyStatus,
    expected: RecoverableAccountConnectionStatus
  ): void {
    if (current === 'absent') {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_NOT_NEEDED',
        'This account has no local connection state to recover.',
        false
      )
    }
    if (current === 'connected') {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_REFUSED',
        'A complete account connection cannot be changed by recovery.',
        false
      )
    }
    if (current !== expected) {
      throw new AccountConnectionRecoveryError(
        'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED',
        'The account connection state no longer matches the confirmed recovery.',
        false
      )
    }
  }

  private async deleteCredential(accountId: string): Promise<boolean> {
    try {
      return await this.vault.delete(googleRefreshTokenName(accountId))
    } catch (error) {
      throw this.deleteFailure(error)
    }
  }

  private deleteProviderState(accountId: string): boolean {
    try {
      return this.accountState.deleteAccountState(accountId)
    } catch (error) {
      throw this.deleteFailure(error)
    }
  }

  private deleteFailure(error: unknown): AccountConnectionRecoveryError {
    return new AccountConnectionRecoveryError(
      'ACCOUNT_CONNECTION_RECOVERY_DELETE_FAILED',
      'The orphaned account connection state could not be removed.',
      true,
      { cause: error }
    )
  }
}
