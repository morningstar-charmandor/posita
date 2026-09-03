import {
  AccountAuthorizationError,
  isBeginAccountAuthorizationRequestV1,
  type AccountAuthorizationLaunchV1,
  type BeginAccountAuthorizationRequestV1,
  type CompleteAccountAuthorizationRequestV1
} from './accountAuthorization'
import type { ProviderAccountRecordV2 } from './accountState'

const MAX_CALLBACK_ATTEMPTS = 4
const isAborted = (signal?: AbortSignal): boolean => signal?.aborted === true

export interface AccountConnectionActivationPort {
  begin(request: BeginAccountAuthorizationRequestV1): Promise<AccountAuthorizationLaunchV1>
  complete(request: CompleteAccountAuthorizationRequestV1): Promise<ProviderAccountRecordV2>
  cancel(sessionId: string): Promise<boolean>
}

export interface AccountAuthorizationBrowser {
  open(authorizationUrl: string): Promise<void>
}

export interface AccountAuthorizationCallbackSource {
  nextCallback(sessionId: string, signal?: AbortSignal): Promise<string>
}

export type AccountConnectionActivationErrorCode =
  | 'INVALID_CONNECTION_ACTIVATION_REQUEST'
  | 'CONNECTION_ACTIVATION_IN_PROGRESS'
  | 'CONNECTION_ACTIVATION_CANCELLED'
  | 'AUTHORIZATION_BROWSER_UNAVAILABLE'
  | 'AUTHORIZATION_CALLBACK_UNAVAILABLE'
  | 'AUTHORIZATION_CALLBACK_LIMIT_REACHED'
  | 'CONNECTION_ACTIVATION_CLEANUP_FAILED'

export class AccountConnectionActivationError extends Error {
  constructor(
    readonly code: AccountConnectionActivationErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountConnectionActivationError'
  }
}

/**
 * Trusted coordinator for one complete desktop authorization handoff. Production
 * constructs it but does not expose a command that can invoke it.
 * The authorization URL and callback stay in main and never become renderer data.
 */
export class AccountConnectionActivationService {
  private running = false

  constructor(
    private readonly connection: AccountConnectionActivationPort,
    private readonly callbacks: AccountAuthorizationCallbackSource,
    private readonly browser: AccountAuthorizationBrowser
  ) {}

  async connect(
    request: BeginAccountAuthorizationRequestV1,
    signal?: AbortSignal
  ): Promise<ProviderAccountRecordV2> {
    if (!isBeginAccountAuthorizationRequestV1(request)) {
      throw this.error(
        'INVALID_CONNECTION_ACTIVATION_REQUEST',
        'The account connection activation request is invalid.',
        false
      )
    }
    if (isAborted(signal)) throw this.cancelled()
    if (this.running) {
      throw this.error(
        'CONNECTION_ACTIVATION_IN_PROGRESS',
        'An account connection activation is already in progress.',
        false
      )
    }

    this.running = true
    let launch: AccountAuthorizationLaunchV1 | undefined
    const callbackController = new AbortController()
    const callbackSignal = signal === undefined
      ? callbackController.signal
      : AbortSignal.any([signal, callbackController.signal])
    try {
      launch = await this.connection.begin(request)
      let callbackPromise = this.callbacks.nextCallback(launch.sessionId, callbackSignal)
      try {
        await this.browser.open(launch.authorizationUrl)
      } catch (error) {
        await this.cleanup(launch.sessionId, callbackController, callbackPromise, error)
        throw this.error(
          'AUTHORIZATION_BROWSER_UNAVAILABLE',
          'Posita could not open Google authorization. Start again.',
          true,
          error
        )
      }

      for (let attempt = 1; attempt <= MAX_CALLBACK_ATTEMPTS; attempt += 1) {
        let callbackUrl: string
        try {
          callbackUrl = await callbackPromise
        } catch (error) {
          await this.cancelConnection(launch.sessionId, callbackController, error)
          if (isAborted(signal)) throw this.cancelled(error)
          throw this.error(
            'AUTHORIZATION_CALLBACK_UNAVAILABLE',
            'Posita could not receive the local authorization response. Start again.',
            true,
            error
          )
        }

        if (isAborted(signal)) {
          await this.cancelConnection(launch.sessionId, callbackController)
          throw this.cancelled()
        }

        try {
          // Once completion starts, code exchange and vault/state ordering own the
          // outcome. Cancellation is intentionally observed before this boundary.
          return await this.connection.complete({
            version: 1,
            sessionId: launch.sessionId,
            callbackUrl
          })
        } catch (error) {
          if (!(error instanceof AccountAuthorizationError) ||
              error.code !== 'AUTHORIZATION_CALLBACK_REJECTED') throw error
          if (attempt === MAX_CALLBACK_ATTEMPTS) {
            await this.cancelConnection(launch.sessionId, callbackController, error)
            throw this.error(
              'AUTHORIZATION_CALLBACK_LIMIT_REACHED',
              'Too many local authorization responses were rejected. Start again.',
              false,
              error
            )
          }
          callbackPromise = this.callbacks.nextCallback(launch.sessionId, callbackSignal)
        }
      }
      throw this.error(
        'AUTHORIZATION_CALLBACK_LIMIT_REACHED',
        'Too many local authorization responses were rejected. Start again.',
        false
      )
    } finally {
      callbackController.abort()
      this.running = false
    }
  }

  private async cleanup(
    sessionId: string,
    controller: AbortController,
    callbackPromise: Promise<string>,
    cause: unknown
  ): Promise<void> {
    controller.abort()
    const [cancelResult] = await Promise.allSettled([
      this.connection.cancel(sessionId),
      callbackPromise
    ])
    if (cancelResult.status === 'rejected') {
      throw this.error(
        'CONNECTION_ACTIVATION_CLEANUP_FAILED',
        'Account connection cleanup requires review.',
        false,
        new AggregateError([cause, cancelResult.reason])
      )
    }
  }

  private async cancelConnection(
    sessionId: string,
    controller: AbortController,
    cause?: unknown
  ): Promise<void> {
    controller.abort()
    try {
      await this.connection.cancel(sessionId)
    } catch (error) {
      throw this.error(
        'CONNECTION_ACTIVATION_CLEANUP_FAILED',
        'Account connection cleanup requires review.',
        false,
        new AggregateError(cause === undefined ? [error] : [cause, error])
      )
    }
  }

  private cancelled(cause?: unknown): AccountConnectionActivationError {
    return this.error(
      'CONNECTION_ACTIVATION_CANCELLED',
      'Account connection was cancelled.',
      false,
      cause
    )
  }

  private error(
    code: AccountConnectionActivationErrorCode,
    message: string,
    retryable: boolean,
    cause?: unknown
  ): AccountConnectionActivationError {
    return new AccountConnectionActivationError(
      code,
      message,
      retryable,
      cause === undefined ? undefined : { cause }
    )
  }
}
