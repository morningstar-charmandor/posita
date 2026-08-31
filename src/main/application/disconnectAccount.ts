import {
  AccountLifecycleError,
  isOperationId,
  type AccountLifecycleRepository,
  type DisconnectAccountOperationV1,
  type DisconnectPhase,
  type LifecycleFailureCode
} from './accountLifecycle'
import { type AccountStateRepository, isAccountId } from './accountState'
import type { AccountDataRemovalService } from './accountDataRemoval'
import { googleRefreshTokenName, type SecretVault } from './secretVault'
import type { StorageSanitizer } from './storageSanitizer'

export interface AccountAuthorizationRevoker {
  /** Must be idempotent: an already revoked or absent grant is success. */
  revoke(accountId: string): Promise<void>
}

export interface ProviderMailAccountDataRemover {
  /** Must be idempotent and remove only the selected account's local projection. */
  deleteAccountRecords(accountId: string): Promise<boolean>
}

export interface DisconnectAccountRequestV1 {
  version: 1
  operationId: string
  accountId: string
}

export interface DisconnectAccountResultV1 {
  version: 1
  operationId: string
  accountId: string
  status: 'completed'
}

type DisconnectErrorCode =
  | 'INVALID_DISCONNECT_REQUEST'
  | 'DISCONNECT_OPERATION_CONFLICT'
  | 'DISCONNECT_IN_PROGRESS'
  | 'LIFECYCLE_STORAGE_FAILED'
  | LifecycleFailureCode

export class DisconnectAccountError extends Error {
  readonly code: DisconnectErrorCode
  readonly retryable: boolean

  constructor(code: DisconnectErrorCode, message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DisconnectAccountError'
    this.code = code
    this.retryable = retryable
  }
}

interface ActiveOperation {
  operationId: string
  promise: Promise<DisconnectAccountResultV1>
}

const failureForPhase: Record<Exclude<DisconnectPhase, 'completed'>, LifecycleFailureCode> = {
  'revocation-pending': 'REVOCATION_FAILED',
  'credential-delete-pending': 'CREDENTIAL_DELETE_FAILED',
  'account-state-delete-pending': 'ACCOUNT_STATE_DELETE_FAILED',
  'mail-data-delete-pending': 'MAIL_DATA_DELETE_FAILED',
  'compaction-pending': 'COMPACTION_FAILED'
}

const nextPhase: Record<Exclude<DisconnectPhase, 'completed'>, DisconnectPhase> = {
  'revocation-pending': 'credential-delete-pending',
  'credential-delete-pending': 'account-state-delete-pending',
  'account-state-delete-pending': 'mail-data-delete-pending',
  'mail-data-delete-pending': 'compaction-pending',
  'compaction-pending': 'completed'
}

export class DisconnectAccountService {
  private readonly activeByAccount = new Map<string, ActiveOperation>()

  constructor(
    private readonly lifecycle: AccountLifecycleRepository,
    private readonly revoker: AccountAuthorizationRevoker,
    private readonly vault: SecretVault,
    private readonly accountState: AccountStateRepository,
    private readonly accountData: AccountDataRemovalService,
    private readonly providerMail: ProviderMailAccountDataRemover,
    private readonly storageSanitizer: StorageSanitizer
  ) {}

  disconnect(request: DisconnectAccountRequestV1): Promise<DisconnectAccountResultV1> {
    if (request.version !== 1 || !isOperationId(request.operationId) ||
        !isAccountId(request.accountId)) {
      return Promise.reject(new DisconnectAccountError(
        'INVALID_DISCONNECT_REQUEST', 'The disconnect request is invalid.', false
      ))
    }
    const active = this.activeByAccount.get(request.accountId)
    if (active) {
      if (active.operationId === request.operationId) return active.promise
      return Promise.reject(new DisconnectAccountError(
        'DISCONNECT_IN_PROGRESS', 'Another disconnect is already in progress.', true
      ))
    }

    const promise = this.execute(request).finally(() => {
      const current = this.activeByAccount.get(request.accountId)
      if (current?.operationId === request.operationId) {
        this.activeByAccount.delete(request.accountId)
      }
    })
    this.activeByAccount.set(request.accountId, { operationId: request.operationId, promise })
    return promise
  }

  private async execute(request: DisconnectAccountRequestV1): Promise<DisconnectAccountResultV1> {
    let operation = this.loadOrCreate(request)
    while (operation.phase !== 'completed') {
      const phase = operation.phase
      try {
        await this.perform(phase, request.accountId)
      } catch (error) {
        const failureCode = failureForPhase[phase]
        this.saveFailure(operation, failureCode, error)
        throw new DisconnectAccountError(
          failureCode,
          'Posita could not complete account disconnection. Please try again.',
          true,
          { cause: error }
        )
      }
      operation = { ...operation, phase: nextPhase[phase] }
      delete operation.lastErrorCode
      this.saveOperation(operation)
    }
    return {
      version: 1,
      operationId: request.operationId,
      accountId: request.accountId,
      status: 'completed'
    }
  }

  private loadOrCreate(request: DisconnectAccountRequestV1): DisconnectAccountOperationV1 {
    let existing
    try {
      existing = this.lifecycle.load(request.operationId)
    } catch (error) {
      throw this.storageError(error)
    }
    if (existing !== undefined) {
      if (existing.operationType !== 'disconnect-account' || existing.accountId !== request.accountId) {
        throw new DisconnectAccountError(
          'DISCONNECT_OPERATION_CONFLICT',
          'The disconnect operation belongs to another target.',
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
    if (pending.some((operation) =>
      operation.operationType === 'delete-local-data' ||
      (operation.operationType === 'disconnect-account' && operation.accountId === request.accountId)
    )) {
      throw new DisconnectAccountError(
        'DISCONNECT_IN_PROGRESS',
        'Another lifecycle operation must finish first.',
        true
      )
    }
    const operation: DisconnectAccountOperationV1 = {
      version: 1,
      operationId: request.operationId,
      operationType: 'disconnect-account',
      accountId: request.accountId,
      phase: 'revocation-pending'
    }
    this.saveOperation(operation)
    return operation
  }

  private async perform(phase: Exclude<DisconnectPhase, 'completed'>, accountId: string): Promise<void> {
    switch (phase) {
      case 'revocation-pending': await this.revoker.revoke(accountId); return
      case 'credential-delete-pending':
        await this.vault.delete(googleRefreshTokenName(accountId)); return
      case 'account-state-delete-pending': this.accountState.deleteAccountState(accountId); return
      case 'mail-data-delete-pending':
        this.accountData.run(accountId)
        await this.providerMail.deleteAccountRecords(accountId)
        return
      case 'compaction-pending': await this.storageSanitizer.sanitize(); return
    }
  }

  private saveFailure(
    operation: DisconnectAccountOperationV1,
    code: LifecycleFailureCode,
    cause: unknown
  ): void {
    try {
      this.lifecycle.save({ ...operation, lastErrorCode: code })
    } catch (error) {
      throw this.storageError(error, cause)
    }
  }

  private saveOperation(operation: DisconnectAccountOperationV1): void {
    try {
      this.lifecycle.save(operation)
    } catch (error) {
      throw this.storageError(error)
    }
  }

  private storageError(error: unknown, actionCause?: unknown): DisconnectAccountError {
    const cause = error instanceof AccountLifecycleError ? error : actionCause ?? error
    return new DisconnectAccountError(
      'LIFECYCLE_STORAGE_FAILED',
      'Posita could not save disconnect progress. Please try again.',
      true,
      { cause }
    )
  }
}
