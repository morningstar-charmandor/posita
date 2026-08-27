import {
  POSITA_PROTOCOL_VERSION,
  type ExecuteLocalDataDeletionRequestV1,
  type ExecuteLocalDataDeletionResponseV1,
  type LocalDataDeletionErrorCodeV1,
  type LocalDataDeletionErrorV1,
  type LocalDataDeletionResultV1,
  type PrepareLocalDataDeletionRequestV1,
  type PrepareLocalDataDeletionResponseV1
} from '../../shared/contracts'
import {
  isExecuteLocalDataDeletionRequest,
  isPrepareLocalDataDeletionRequest
} from '../../shared/validation'
import { DeleteLocalDataError, type DeleteLocalDataService } from './deleteLocalData'
import {
  LocalActionConfirmationError,
  type LocalActionConfirmationService
} from './localActionConfirmation'

export interface LocalDataDeletedTransition {
  markLocalDataDeleted(): void
}

const error = (
  code: LocalDataDeletionErrorCodeV1,
  message: string,
  retryable: boolean
): LocalDataDeletionErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code,
  message,
  retryable
})

const mapConfirmationError = (cause: LocalActionConfirmationError): LocalDataDeletionErrorV1 => {
  switch (cause.code) {
    case 'INVALID_CONFIRMATION_REQUEST':
      return error('INVALID_REQUEST', 'The local-data deletion request was invalid.', false)
    case 'CONFIRMATION_NOT_FOUND':
      return error('CONFIRMATION_NOT_FOUND', cause.message, false)
    case 'CONFIRMATION_EXPIRED':
      return error('CONFIRMATION_EXPIRED', cause.message, false)
    case 'CONFIRMATION_TEXT_MISMATCH':
      return error('CONFIRMATION_TEXT_MISMATCH', cause.message, false)
    case 'CONFIRMATION_LIMIT_REACHED':
      return error('CONFIRMATION_LIMIT_REACHED', cause.message, true)
    case 'CONFIRMATION_STORAGE_FAILED':
      return error('STORAGE_UNAVAILABLE', cause.message, true)
  }
}

const mapDeletionError = (cause: DeleteLocalDataError): LocalDataDeletionErrorV1 => {
  switch (cause.code) {
    case 'INVALID_DELETE_LOCAL_DATA_REQUEST':
      return error('INVALID_REQUEST', 'The local-data deletion request was invalid.', false)
    case 'DELETE_LOCAL_DATA_NOT_CONFIRMED':
      return error('CONFIRMATION_NOT_FOUND', 'A current confirmation is required.', false)
    case 'DELETE_LOCAL_DATA_OPERATION_CONFLICT':
    case 'DELETE_LOCAL_DATA_IN_PROGRESS':
      return error('OPERATION_CONFLICT', cause.message, cause.retryable)
    case 'CONFIRMATION_UNAVAILABLE':
    case 'LIFECYCLE_STORAGE_FAILED':
      return error('STORAGE_UNAVAILABLE', cause.message, true)
    case 'DELETE_LOCAL_DATA_RESUME_NOT_FOUND':
      return error('DELETION_FAILED', 'Local-data deletion could not be resumed.', false)
    default:
      return error(
        'DELETION_FAILED',
        'Posita could not finish deleting local data. Restart Posita to resume safely.',
        true
      )
  }
}

export class LocalDataDeletionCommandService {
  private available: boolean

  constructor(
    private readonly confirmation?: LocalActionConfirmationService,
    private readonly deletion?: DeleteLocalDataService,
    private readonly transition?: LocalDataDeletedTransition
  ) {
    this.available = confirmation !== undefined && deletion !== undefined && transition !== undefined
  }

  prepare(request: unknown): PrepareLocalDataDeletionResponseV1 {
    if (!this.available || !this.confirmation || !this.deletion || !this.transition) {
      return this.unavailable()
    }
    if (!isPrepareLocalDataDeletionRequest(request)) return this.invalid()
    try {
      this.deletion.checkCanStart()
      return { ok: true, value: this.confirmation.prepare(request) }
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof LocalActionConfirmationError
          ? mapConfirmationError(cause)
          : cause instanceof DeleteLocalDataError
            ? mapDeletionError(cause)
          : error('DELETION_FAILED', 'Posita could not prepare local-data deletion.', true)
      }
    }
  }

  async execute(request: unknown): Promise<ExecuteLocalDataDeletionResponseV1> {
    if (!this.available || !this.confirmation || !this.deletion || !this.transition) {
      return this.unavailable()
    }
    if (!isExecuteLocalDataDeletionRequest(request)) return this.invalid()
    let expiredConfirmation: LocalActionConfirmationError | undefined
    try {
      try {
        this.confirmation.confirm(request)
      } catch (cause) {
        if (cause instanceof LocalActionConfirmationError &&
            cause.code === 'CONFIRMATION_EXPIRED') {
          expiredConfirmation = cause
        } else {
          throw cause
        }
      }
      const result = await this.deletion.delete({
        version: POSITA_PROTOCOL_VERSION,
        confirmationId: request.confirmationId,
        operationId: request.operationId
      })
      this.transition.markLocalDataDeleted()
      this.available = false
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          operationId: result.operationId,
          status: 'local-data-deleted'
        }
      }
    } catch (cause) {
      let mappedError: LocalDataDeletionErrorV1
      if (cause instanceof DeleteLocalDataError &&
          cause.code === 'DELETE_LOCAL_DATA_NOT_CONFIRMED' && expiredConfirmation) {
        mappedError = mapConfirmationError(expiredConfirmation)
      } else if (cause instanceof LocalActionConfirmationError) {
        mappedError = mapConfirmationError(cause)
      } else if (cause instanceof DeleteLocalDataError) {
        mappedError = mapDeletionError(cause)
      } else {
        mappedError = error('DELETION_FAILED', 'Posita could not finish deleting local data.', true)
      }
      return {
        ok: false,
        error: mappedError
      }
    }
  }

  private invalid(): LocalDataDeletionResultV1<never> {
    return { ok: false, error: error('INVALID_REQUEST', 'The request was invalid.', false) }
  }

  private unavailable(): LocalDataDeletionResultV1<never> {
    return {
      ok: false,
      error: error(
        'DELETION_UNAVAILABLE',
        'Local-data deletion is unavailable in the current application state.',
        false
      )
    }
  }
}
