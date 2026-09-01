import type { AccountConnectionConsistencyInspector } from './accountConnection'
import { isAccountId } from './accountState'
import type { StorageSanitizer } from './storageSanitizer'

export type MailDataMode = 'sample' | 'live'

export interface MailDataModeStateV1 {
  version: 1
  mode: MailDataMode
}

export interface ActivateLiveMailModeRequestV1 {
  version: 1
  accountId: string
}

export interface ActivateLiveMailModeResultV1 {
  version: 1
  mode: 'live'
  changed: boolean
}

export interface MailDataModeTransitionV1 {
  changed: boolean
  sanitizationRequired: boolean
}

export interface MailDataModeRepository {
  load(): MailDataModeStateV1
  activateLive(): MailDataModeTransitionV1
}

export type MailDataModeErrorCode =
  | 'INVALID_MAIL_DATA_MODE_REQUEST'
  | 'CONNECTED_ACCOUNT_REQUIRED'
  | 'MAIL_DATA_MODE_INSPECTION_FAILED'
  | 'MAIL_DATA_MODE_STORAGE_FAILED'
  | 'MAIL_DATA_MODE_SANITIZATION_FAILED'

export class MailDataModeError extends Error {
  constructor(
    readonly code: MailDataModeErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'MailDataModeError'
  }
}

/**
 * Trusted, credential-free boundary for the one-way sample-to-live transition.
 * It is intentionally not exposed through preload or IPC.
 */
export class MailDataModeService {
  constructor(
    private readonly repository: MailDataModeRepository,
    private readonly connections: AccountConnectionConsistencyInspector,
    private readonly storageSanitizer: StorageSanitizer
  ) {}

  load(): MailDataModeStateV1 {
    try {
      return this.repository.load()
    } catch (error) {
      throw new MailDataModeError(
        'MAIL_DATA_MODE_STORAGE_FAILED',
        'Posita could not load the local mail mode.',
        true,
        { cause: error }
      )
    }
  }

  async activateLive(
    request: ActivateLiveMailModeRequestV1
  ): Promise<ActivateLiveMailModeResultV1> {
    if (typeof request !== 'object' || request === null || Array.isArray(request) ||
        request.version !== 1 || !isAccountId(request.accountId) ||
        Object.keys(request).length !== 2) {
      throw new MailDataModeError(
        'INVALID_MAIL_DATA_MODE_REQUEST',
        'The live-mail activation request is invalid.',
        false
      )
    }

    const current = this.load()
    if (current.mode === 'sample') await this.assertConnected(request.accountId)

    let transition: MailDataModeTransitionV1
    try {
      transition = this.repository.activateLive()
    } catch (error) {
      throw new MailDataModeError(
        'MAIL_DATA_MODE_STORAGE_FAILED',
        'Posita could not switch the local mail mode.',
        true,
        { cause: error }
      )
    }

    if (transition.sanitizationRequired) {
      try {
        await this.storageSanitizer.sanitize()
      } catch (error) {
        throw new MailDataModeError(
          'MAIL_DATA_MODE_SANITIZATION_FAILED',
          'Live mode is active, but local sample-data cleanup must be retried.',
          true,
          { cause: error }
        )
      }
    }

    return { version: 1, mode: 'live', changed: transition.changed }
  }

  private async assertConnected(accountId: string): Promise<void> {
    let consistency
    try {
      consistency = await this.connections.inspect(accountId)
    } catch (error) {
      throw new MailDataModeError(
        'MAIL_DATA_MODE_INSPECTION_FAILED',
        'Posita could not verify the connected account.',
        true,
        { cause: error }
      )
    }
    if (consistency.accountId !== accountId || consistency.status !== 'connected') {
      throw new MailDataModeError(
        'CONNECTED_ACCOUNT_REQUIRED',
        'A complete connected account is required before live mail can replace samples.',
        false
      )
    }
  }
}
