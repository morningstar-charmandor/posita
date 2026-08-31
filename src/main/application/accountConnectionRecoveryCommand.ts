import {
  POSITA_PROTOCOL_VERSION,
  type AccountConnectionRecoveryErrorCodeV1,
  type AccountConnectionRecoveryErrorV1,
  type AccountConnectionRecoveryResponseV1,
  type ExecuteAccountConnectionRecoveryResponseV1,
  type PrepareAccountConnectionRecoveryResponseV1
} from '../../shared/contracts'
import {
  isExecuteAccountConnectionRecoveryRequest,
  isPrepareAccountConnectionRecoveryRequest
} from '../../shared/validation'
import type { AccountConnectionConsistencyInspector } from './accountConnection'
import {
  AccountConnectionRecoveryConfirmationError,
  type AccountConnectionRecoveryConfirmationService
} from './accountConnectionRecoveryConfirmation'
import {
  AccountConnectionRecoveryError,
  type AccountConnectionRecoveryService
} from './recoverAccountConnection'

const error = (
  code: AccountConnectionRecoveryErrorCodeV1,
  message: string,
  retryable: boolean
): AccountConnectionRecoveryErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code,
  message,
  retryable
})

const mapConfirmationError = (
  cause: AccountConnectionRecoveryConfirmationError
): AccountConnectionRecoveryErrorV1 => {
  switch (cause.code) {
    case 'INVALID_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUEST':
      return error('INVALID_REQUEST', 'The local connection recovery request was invalid.', false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_NOT_FOUND':
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_USED':
      return error('CONFIRMATION_NOT_FOUND', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_EXPIRED':
      return error('CONFIRMATION_EXPIRED', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT_MISMATCH':
      return error('CONFIRMATION_TEXT_MISMATCH', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_LIMIT_REACHED':
      return error('CONFIRMATION_LIMIT_REACHED', cause.message, true)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STATE_CHANGED':
      return error('CONNECTION_STATE_CHANGED', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED':
      return error('STORAGE_UNAVAILABLE', cause.message, true)
  }
}

const mapRecoveryError = (
  cause: AccountConnectionRecoveryError
): AccountConnectionRecoveryErrorV1 => {
  switch (cause.code) {
    case 'INVALID_ACCOUNT_CONNECTION_RECOVERY_REQUEST':
      return error('INVALID_REQUEST', 'The local connection recovery request was invalid.', false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUIRED':
      return error('CONFIRMATION_NOT_FOUND', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_UNAVAILABLE':
      return error('STORAGE_UNAVAILABLE', cause.message, true)
    case 'ACCOUNT_CONNECTION_RECOVERY_NOT_NEEDED':
      return error('RECOVERY_NOT_NEEDED', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_REFUSED':
      return error('RECOVERY_REFUSED', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_STATE_CHANGED':
      return error('CONNECTION_STATE_CHANGED', cause.message, false)
    case 'ACCOUNT_CONNECTION_RECOVERY_DELETE_FAILED':
    case 'ACCOUNT_CONNECTION_RECOVERY_INCOMPLETE':
      return error(
        'RECOVERY_FAILED',
        'Posita could not finish local connection recovery. Review the account and start again.',
        true
      )
  }
}

export class AccountConnectionRecoveryCommandService {
  constructor(
    private readonly connections?: AccountConnectionConsistencyInspector,
    private readonly confirmation?: Pick<
      AccountConnectionRecoveryConfirmationService,
      'prepare' | 'confirm'
    >,
    private readonly recovery?: Pick<AccountConnectionRecoveryService, 'recover'>
  ) {}

  async prepare(request: unknown): Promise<PrepareAccountConnectionRecoveryResponseV1> {
    if (!this.connections || !this.confirmation || !this.recovery) return this.unavailable()
    if (!isPrepareAccountConnectionRecoveryRequest(request)) return this.invalid()
    try {
      const consistency = await this.connections.inspect(request.accountId)
      if (consistency.status === 'absent') {
        return {
          ok: false,
          error: error(
            'RECOVERY_NOT_NEEDED',
            'No incomplete local connection data was found for this account.',
            false
          )
        }
      }
      if (consistency.status === 'connected') {
        return {
          ok: false,
          error: error(
            'RECOVERY_REFUSED',
            'This account connection is complete and cannot be changed by recovery.',
            false
          )
        }
      }
      return { ok: true, value: await this.confirmation.prepare(request) }
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof AccountConnectionRecoveryConfirmationError
          ? mapConfirmationError(cause)
          : cause instanceof AccountConnectionRecoveryError
            ? mapRecoveryError(cause)
            : error(
                'STORAGE_UNAVAILABLE',
                'Posita could not inspect local connection data safely.',
                true
              )
      }
    }
  }

  async execute(request: unknown): Promise<ExecuteAccountConnectionRecoveryResponseV1> {
    if (!this.connections || !this.confirmation || !this.recovery) return this.unavailable()
    if (!isExecuteAccountConnectionRecoveryRequest(request)) return this.invalid()
    try {
      this.confirmation.confirm(request)
      const result = await this.recovery.recover({
        version: request.version,
        confirmationId: request.confirmationId,
        operationId: request.operationId,
        action: request.action,
        accountId: request.accountId,
        expectedStatus: request.expectedStatus
      })
      return { ok: true, value: result }
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof AccountConnectionRecoveryConfirmationError
          ? mapConfirmationError(cause)
          : cause instanceof AccountConnectionRecoveryError
            ? mapRecoveryError(cause)
            : error(
                'RECOVERY_FAILED',
                'Posita could not finish local connection recovery. Start again.',
                true
              )
      }
    }
  }

  private invalid(): AccountConnectionRecoveryResponseV1<never> {
    return {
      ok: false,
      error: error('INVALID_REQUEST', 'The local connection recovery request was invalid.', false)
    }
  }

  private unavailable(): AccountConnectionRecoveryResponseV1<never> {
    return {
      ok: false,
      error: error(
        'RECOVERY_UNAVAILABLE',
        'Local connection recovery is unavailable in the current application state.',
        false
      )
    }
  }
}
