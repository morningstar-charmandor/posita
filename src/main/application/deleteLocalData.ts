import {
  AccountLifecycleError,
  isOperationId,
  type AccountLifecycleRepository,
  type DeleteLocalDataOperationV1,
  type DeleteLocalDataPhase,
  type LifecycleFailureCode
} from './accountLifecycle'
import type { AccountStateRepository } from './accountState'
import type { MutableMailRepository } from './mailRepository'
import type { SecretVault } from './secretVault'

export interface CacheDataKeyEraser {
  delete(): Promise<boolean>
}

export interface DeleteLocalDataRequestV1 {
  version: 1
  operationId: string
}

export interface DeleteLocalDataResultV1 {
  version: 1
  operationId: string
  status: 'completed'
}

type DeleteLocalDataErrorCode =
  | 'INVALID_DELETE_LOCAL_DATA_REQUEST'
  | 'DELETE_LOCAL_DATA_OPERATION_CONFLICT'
  | 'DELETE_LOCAL_DATA_IN_PROGRESS'
  | 'LIFECYCLE_STORAGE_FAILED'
  | LifecycleFailureCode

export class DeleteLocalDataError extends Error {
  readonly code: DeleteLocalDataErrorCode
  readonly retryable: boolean

  constructor(
    code: DeleteLocalDataErrorCode,
    message: string,
    retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'DeleteLocalDataError'
    this.code = code
    this.retryable = retryable
  }
}

const failureForPhase: Record<Exclude<DeleteLocalDataPhase, 'completed'>, LifecycleFailureCode> = {
  'credentials-delete-pending': 'CREDENTIAL_DELETE_FAILED',
  'account-state-delete-pending': 'ACCOUNT_STATE_DELETE_FAILED',
  'mail-data-delete-pending': 'MAIL_DATA_DELETE_FAILED',
  'compaction-pending': 'COMPACTION_FAILED',
  'data-key-delete-pending': 'DATA_KEY_DELETE_FAILED'
}

const nextPhase: Record<Exclude<DeleteLocalDataPhase, 'completed'>, DeleteLocalDataPhase> = {
  'credentials-delete-pending': 'account-state-delete-pending',
  'account-state-delete-pending': 'mail-data-delete-pending',
  'mail-data-delete-pending': 'compaction-pending',
  'compaction-pending': 'data-key-delete-pending',
  'data-key-delete-pending': 'completed'
}

export class DeleteLocalDataService {
  private active?: { operationId: string; promise: Promise<DeleteLocalDataResultV1> }

  constructor(
    private readonly lifecycle: AccountLifecycleRepository,
    private readonly vault: SecretVault,
    private readonly accountState: AccountStateRepository,
    private readonly mailRepository: MutableMailRepository,
    private readonly keyEraser: CacheDataKeyEraser
  ) {}

  delete(request: DeleteLocalDataRequestV1): Promise<DeleteLocalDataResultV1> {
    if (request.version !== 1 || !isOperationId(request.operationId)) {
      return Promise.reject(new DeleteLocalDataError(
        'INVALID_DELETE_LOCAL_DATA_REQUEST', 'The local-data deletion request is invalid.', false
      ))
    }
    if (this.active) {
      if (this.active.operationId === request.operationId) return this.active.promise
      return Promise.reject(new DeleteLocalDataError(
        'DELETE_LOCAL_DATA_IN_PROGRESS', 'Local-data deletion is already in progress.', true
      ))
    }
    const promise = this.execute(request).finally(() => {
      if (this.active?.operationId === request.operationId) this.active = undefined
    })
    this.active = { operationId: request.operationId, promise }
    return promise
  }

  private async execute(request: DeleteLocalDataRequestV1): Promise<DeleteLocalDataResultV1> {
    let operation = this.loadOrCreate(request)
    while (operation.phase !== 'completed') {
      const phase = operation.phase
      try {
        await this.perform(phase)
      } catch (error) {
        const failureCode = failureForPhase[phase]
        this.saveFailure(operation, failureCode, error)
        throw new DeleteLocalDataError(
          failureCode,
          'Posita could not finish deleting local data. Please try again.',
          true,
          { cause: error }
        )
      }
      operation = { ...operation, phase: nextPhase[phase] }
      delete operation.lastErrorCode
      this.saveOperation(operation)
    }
    return { version: 1, operationId: request.operationId, status: 'completed' }
  }

  private loadOrCreate(request: DeleteLocalDataRequestV1): DeleteLocalDataOperationV1 {
    let existing
    try {
      existing = this.lifecycle.load(request.operationId)
    } catch (error) {
      throw this.storageError(error)
    }
    if (existing !== undefined) {
      if (existing.operationType !== 'delete-local-data') {
        throw new DeleteLocalDataError(
          'DELETE_LOCAL_DATA_OPERATION_CONFLICT',
          'The lifecycle operation has another purpose.',
          false
        )
      }
      return existing
    }
    let pending
    try {
      pending = this.lifecycle.listPending()
    } catch (error) {
      throw this.storageError(error)
    }
    if (pending.length > 0) {
      throw new DeleteLocalDataError(
        'DELETE_LOCAL_DATA_IN_PROGRESS',
        'Another local-data lifecycle operation must finish first.',
        true
      )
    }
    const operation: DeleteLocalDataOperationV1 = {
      version: 1,
      operationId: request.operationId,
      operationType: 'delete-local-data',
      phase: 'credentials-delete-pending'
    }
    this.saveOperation(operation)
    return operation
  }

  private async perform(phase: Exclude<DeleteLocalDataPhase, 'completed'>): Promise<void> {
    switch (phase) {
      case 'credentials-delete-pending': {
        await this.vault.deleteGoogleRefreshTokens()
        return
      }
      case 'account-state-delete-pending': this.accountState.deleteAllAccountState(); return
      case 'mail-data-delete-pending': this.mailRepository.deleteAllRecords(); return
      case 'compaction-pending': this.mailRepository.sanitizeStorage(); return
      case 'data-key-delete-pending':
        await this.keyEraser.delete()
        this.mailRepository.destroyEncryptionContext()
        return
    }
  }

  private saveFailure(
    operation: DeleteLocalDataOperationV1,
    code: LifecycleFailureCode,
    cause: unknown
  ): void {
    try {
      this.lifecycle.save({ ...operation, lastErrorCode: code })
    } catch (error) {
      throw this.storageError(error, cause)
    }
  }

  private saveOperation(operation: DeleteLocalDataOperationV1): void {
    try {
      this.lifecycle.save(operation)
    } catch (error) {
      throw this.storageError(error)
    }
  }

  private storageError(error: unknown, actionCause?: unknown): DeleteLocalDataError {
    const cause = error instanceof AccountLifecycleError ? error : actionCause ?? error
    return new DeleteLocalDataError(
      'LIFECYCLE_STORAGE_FAILED',
      'Posita could not save local-deletion progress. Please try again.',
      true,
      { cause }
    )
  }
}
