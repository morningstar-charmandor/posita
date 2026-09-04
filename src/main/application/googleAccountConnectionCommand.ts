import {
  GOOGLE_CONNECT_CONSENT,
  POSITA_PROTOCOL_VERSION,
  type CancelGoogleAccountConnectionResponseV1,
  type ConnectGoogleAccountResponseV1,
  type GoogleAccountConnectionErrorCodeV1,
  type GoogleAccountConnectionErrorV1
} from '../../shared/contracts'
import {
  isCancelGoogleAccountConnectionRequest,
  isConnectGoogleAccountRequest
} from '../../shared/validation'
import { AccountAuthorizationError } from './accountAuthorization'
import { AccountConnectionError } from './accountConnection'
import {
  AccountConnectionActivationError,
  type AccountConnectionActivationService
} from './accountConnectionActivation'
import { isAccountId, type ProviderAccountRecordV2 } from './accountState'
import { isOperationId } from './accountLifecycle'
import type {
  ProviderMailLifecycleAccountOutcomeV1,
  ProviderMailLifecycleOwner
} from './providerMailLifecycleOwner'

const error = (
  code: GoogleAccountConnectionErrorCodeV1,
  message: string,
  retryable: boolean
): GoogleAccountConnectionErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code,
  message,
  retryable
})

const mapConnectionFailure = (cause: unknown): GoogleAccountConnectionErrorV1 => {
  if (cause instanceof AccountConnectionActivationError) {
    if (cause.code === 'CONNECTION_ACTIVATION_IN_PROGRESS') {
      return error('CONNECTION_IN_PROGRESS', cause.message, false)
    }
    if (cause.code === 'CONNECTION_ACTIVATION_CANCELLED') {
      return error('AUTHORIZATION_FAILED', 'Google account connection was cancelled.', true)
    }
    return error('AUTHORIZATION_FAILED', cause.message, cause.retryable)
  }
  if (cause instanceof AccountAuthorizationError) {
    if (cause.code === 'AUTHORIZATION_DECLINED') {
      return error('AUTHORIZATION_DECLINED', cause.message, false)
    }
    return error('AUTHORIZATION_FAILED', cause.message, cause.retryable)
  }
  if (cause instanceof AccountConnectionError) {
    return error('CONNECTION_FAILED', cause.message, cause.retryable)
  }
  return error(
    'CONNECTION_FAILED',
    'Posita could not complete the Google account connection safely.',
    true
  )
}

export interface GoogleAccountConnectionLifecycle {
  activateConnectedAccount(request: {
    version: 1
    accountId: string
    provider: 'google'
  }): Promise<ProviderMailLifecycleAccountOutcomeV1>
  disconnectAccount(request: {
    version: 1
    operationId: string
    accountId: string
  }): Promise<unknown>
}

/**
 * Public command owner for one explicit Google authorization. It creates the opaque
 * Posita account ID in trusted main, never returns provider identity or credentials,
 * and owns cancellation while the browser/callback flow is pending.
 */
export class GoogleAccountConnectionCommandService {
  private active?: AbortController

  constructor(
    private readonly activation?: Pick<AccountConnectionActivationService, 'connect'>,
    private readonly lifecycle?: GoogleAccountConnectionLifecycle,
    private readonly idSource?: () => string
  ) {}

  async connect(request: unknown): Promise<ConnectGoogleAccountResponseV1> {
    if (!isConnectGoogleAccountRequest(request)) {
      return { ok: false, error: error('INVALID_REQUEST', 'The Google connection request was invalid.', false) }
    }
    if (!this.activation || !this.lifecycle || !this.idSource) return this.unavailable()
    if (this.active !== undefined) {
      return { ok: false, error: error('CONNECTION_IN_PROGRESS', 'A Google connection is already in progress.', false) }
    }
    const accountId = this.idSource()
    if (!isAccountId(accountId)) {
      return { ok: false, error: error('CONNECTION_FAILED', 'Posita could not create a safe account identifier.', false) }
    }
    const controller = new AbortController()
    this.active = controller
    let account: ProviderAccountRecordV2
    try {
      account = await this.activation.connect({
        version: POSITA_PROTOCOL_VERSION,
        accountId,
        provider: 'google',
        consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
        requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes
      }, controller.signal)
    } catch (cause) {
      return { ok: false, error: mapConnectionFailure(cause) }
    } finally {
      if (this.active === controller) this.active = undefined
    }

    let outcome: ProviderMailLifecycleAccountOutcomeV1
    try {
      outcome = await this.lifecycle.activateConnectedAccount({
        version: POSITA_PROTOCOL_VERSION,
        accountId: account.accountId,
        provider: 'google'
      })
    } catch {
      const rollbackOperationId = this.idSource()
      if (isOperationId(rollbackOperationId)) {
        try {
          await this.lifecycle.disconnectAccount({
            version: POSITA_PROTOCOL_VERSION,
            operationId: rollbackOperationId,
            accountId: account.accountId
          })
          return {
            ok: false,
            error: error(
              'CONNECTION_FAILED',
              'Google authorization completed, but Posita safely removed the connection because live-mail activation failed. Start again.',
              true
            )
          }
        } catch {
          // The lifecycle journal preserves the cleanup attempt for review.
        }
      }
      return {
        ok: true,
        value: this.connected(account, 'connected-needs-review', 'ACTIVATION_FAILED')
      }
    }
    return {
      ok: true,
      value: outcome.status === 'synced'
        ? this.connected(account, 'connected-and-synced')
        : this.connected(account, 'connected-sync-retry-required', outcome.errorCode)
    }
  }

  cancel(request: unknown): CancelGoogleAccountConnectionResponseV1 {
    if (!isCancelGoogleAccountConnectionRequest(request)) {
      return { ok: false, error: error('INVALID_REQUEST', 'The Google cancellation request was invalid.', false) }
    }
    if (!this.activation || !this.lifecycle || !this.idSource) return this.unavailable()
    if (this.active === undefined) {
      return { ok: true, value: { version: POSITA_PROTOCOL_VERSION, status: 'no-connection-in-progress' } }
    }
    this.active.abort()
    return { ok: true, value: { version: POSITA_PROTOCOL_VERSION, status: 'cancellation-requested' } }
  }

  private connected(
    account: ProviderAccountRecordV2,
    status: 'connected-and-synced' | 'connected-sync-retry-required' | 'connected-needs-review',
    syncErrorCode?: string
  ) {
    return {
      version: POSITA_PROTOCOL_VERSION,
      accountId: account.accountId,
      provider: 'google' as const,
      mailboxAddress: account.displayIdentity.mailboxAddress,
      connectedAt: account.connectedAt,
      status,
      ...(syncErrorCode === undefined ? {} : { syncErrorCode })
    }
  }

  private unavailable(): { ok: false; error: GoogleAccountConnectionErrorV1 } {
    return {
      ok: false,
      error: error(
        'CONNECTION_UNAVAILABLE',
        'Google account connection is unavailable in the current application state.',
        false
      )
    }
  }
}

export type GoogleAccountConnectionCommandLifecycle = Pick<
  ProviderMailLifecycleOwner,
  'activateConnectedAccount' | 'disconnectAccount'
>
