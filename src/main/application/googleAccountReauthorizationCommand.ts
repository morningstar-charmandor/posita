import {
  GOOGLE_CONNECT_CONSENT,
  POSITA_PROTOCOL_VERSION,
  type CancelGoogleAccountConnectionResponseV1,
  type ConnectGoogleAccountResponseV1,
  type GoogleAccountConnectionErrorV1
} from '../../shared/contracts'
import {
  isCancelGoogleAccountReauthorizationRequest,
  isReauthorizeGoogleAccountRequest
} from '../../shared/validation'
import { AccountAuthorizationError } from './accountAuthorization'
import { AccountConnectionActivationError, type AccountConnectionActivationService } from './accountConnectionActivation'
import { AccountReauthorizationError } from './accountReauthorization'
import type { ProviderMailLifecycleAccountOutcomeV1 } from './providerMailLifecycleOwner'

export const GOOGLE_ACCOUNT_REAUTHORIZATION_SYNC_TIMEOUT_MS = 10 * 60 * 1_000
const TIMED_OUT = Symbol('google-account-reauthorization-sync-timed-out')

const error = (
  code: GoogleAccountConnectionErrorV1['code'],
  message: string,
  retryable: boolean
): { ok: false; error: GoogleAccountConnectionErrorV1 } => ({
  ok: false,
  error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable }
})

const mapFailure = (cause: unknown): { ok: false; error: GoogleAccountConnectionErrorV1 } => {
  if (cause instanceof AccountReauthorizationError) {
    return error(
      cause.code === 'ACCOUNT_REAUTHORIZATION_NOT_REQUIRED'
        ? 'CONNECTION_FAILED'
        : cause.code === 'ACCOUNT_REAUTHORIZATION_IDENTITY_MISMATCH'
          ? 'AUTHORIZATION_FAILED'
          : 'CONNECTION_FAILED',
      cause.message,
      cause.retryable
    )
  }
  if (cause instanceof AccountConnectionActivationError || cause instanceof AccountAuthorizationError) {
    return error(
      cause instanceof AccountAuthorizationError && cause.code === 'AUTHORIZATION_DECLINED'
        ? 'AUTHORIZATION_DECLINED'
        : cause instanceof AccountConnectionActivationError &&
            cause.code === 'CONNECTION_ACTIVATION_IN_PROGRESS'
          ? 'CONNECTION_IN_PROGRESS'
          : 'AUTHORIZATION_FAILED',
      cause.message,
      cause.retryable
    )
  }
  return error(
    'CONNECTION_FAILED',
    'Posita could not safely renew this Google account connection.',
    true
  )
}

export interface GoogleAccountReauthorizationLifecycle {
  syncAccounts(accounts: unknown, signal?: AbortSignal): Promise<ProviderMailLifecycleAccountOutcomeV1[]>
}

/** Public command for one explicit same-account OAuth renewal followed by one bounded read-only sync. */
export class GoogleAccountReauthorizationCommandService {
  private active?: AbortController

  constructor(
    private readonly activation?: Pick<AccountConnectionActivationService, 'connect'>,
    private readonly lifecycle?: GoogleAccountReauthorizationLifecycle,
    private readonly syncTimeoutMs = GOOGLE_ACCOUNT_REAUTHORIZATION_SYNC_TIMEOUT_MS
  ) {}

  async reauthorize(request: unknown): Promise<ConnectGoogleAccountResponseV1> {
    if (!isReauthorizeGoogleAccountRequest(request)) {
      return error('INVALID_REQUEST', 'The Google account reauthorization request was invalid.', false)
    }
    if (!this.activation || !this.lifecycle) {
      return error('CONNECTION_UNAVAILABLE', 'Google account reauthorization is unavailable.', false)
    }
    if (this.active !== undefined) {
      return error('CONNECTION_IN_PROGRESS', 'Google account reauthorization is already in progress.', false)
    }
    const controller = new AbortController()
    this.active = controller
    let releaseOnReturn = true
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const account = await this.activation.connect({
        version: POSITA_PROTOCOL_VERSION,
        accountId: request.accountId,
        provider: 'google',
        consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
        requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes
      }, controller.signal)
      let outcomes: ProviderMailLifecycleAccountOutcomeV1[]
      try {
        const syncAttempt = this.lifecycle.syncAccounts([{
          version: POSITA_PROTOCOL_VERSION,
          accountId: account.accountId,
          provider: 'google'
        }], controller.signal)
        const timedOut = new Promise<typeof TIMED_OUT>((resolve) => {
          timeoutHandle = setTimeout(() => {
            controller.abort()
            resolve(TIMED_OUT)
          }, this.syncTimeoutMs)
        })
        const result = await Promise.race([syncAttempt, timedOut])
        if (result === TIMED_OUT) {
          releaseOnReturn = false
          void syncAttempt.finally(() => {
            if (this.active === controller) this.active = undefined
          }).catch(() => undefined)
          return {
            ok: true,
            value: {
              version: POSITA_PROTOCOL_VERSION,
              accountId: account.accountId,
              provider: 'google',
              mailboxAddress: account.displayIdentity.mailboxAddress,
              connectedAt: account.connectedAt,
              status: 'connected-needs-review',
              syncErrorCode: 'SYNC_ATTEMPT_TIMED_OUT'
            }
          }
        }
        outcomes = result
      } catch {
        return {
          ok: true,
          value: {
            version: POSITA_PROTOCOL_VERSION,
            accountId: account.accountId,
            provider: 'google',
            mailboxAddress: account.displayIdentity.mailboxAddress,
            connectedAt: account.connectedAt,
            status: 'connected-needs-review',
            syncErrorCode: 'SYNC_FAILED_AFTER_REAUTHORIZATION'
          }
        }
      }
      const outcome = outcomes.length === 1 ? outcomes[0] : undefined
      if (outcome === undefined || outcome.accountId !== account.accountId) {
        return {
          ok: true,
          value: {
            version: POSITA_PROTOCOL_VERSION,
            accountId: account.accountId,
            provider: 'google',
            mailboxAddress: account.displayIdentity.mailboxAddress,
            connectedAt: account.connectedAt,
            status: 'connected-needs-review',
            syncErrorCode: 'INVALID_SYNC_RESULT_AFTER_REAUTHORIZATION'
          }
        }
      }
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          accountId: account.accountId,
          provider: 'google',
          mailboxAddress: account.displayIdentity.mailboxAddress,
          connectedAt: account.connectedAt,
          status: outcome.status === 'synced'
            ? 'connected-and-synced'
            : 'connected-sync-retry-required',
          ...(outcome.status === 'synced' ? {} : { syncErrorCode: outcome.errorCode })
        }
      }
    } catch (cause) {
      return mapFailure(cause)
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
      if (releaseOnReturn && this.active === controller) this.active = undefined
    }
  }

  cancel(request: unknown): CancelGoogleAccountConnectionResponseV1 {
    if (!isCancelGoogleAccountReauthorizationRequest(request)) {
      return error('INVALID_REQUEST', 'The Google account reauthorization cancellation was invalid.', false)
    }
    if (!this.activation || !this.lifecycle) {
      return error('CONNECTION_UNAVAILABLE', 'Google account reauthorization is unavailable.', false)
    }
    if (this.active === undefined) {
      return { ok: true, value: { version: POSITA_PROTOCOL_VERSION, status: 'no-connection-in-progress' } }
    }
    this.active.abort()
    return { ok: true, value: { version: POSITA_PROTOCOL_VERSION, status: 'cancellation-requested' } }
  }
}
