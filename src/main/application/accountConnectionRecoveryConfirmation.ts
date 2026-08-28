import { type AccountConnectionService } from './accountConnection'
import { isAccountId } from './accountState'
import { isOperationId } from './accountLifecycle'
import {
  type AccountConnectionRecoveryConfirmationVerifier,
  type RecoverableAccountConnectionStatus,
  type RecoverAccountConnectionRequestV1
} from './recoverAccountConnection'

export const ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT = 'DISCARD LOCAL CONNECTION'
export const ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TTL_MS = 5 * 60 * 1000
export const MAX_PENDING_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATIONS = 16

export interface AccountConnectionRecoveryConfirmationClock {
  now(): Date
}

export interface AccountConnectionRecoveryConfirmationRecordV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatus
  confirmedAt: string
  expiresAt: string
  consumedAt?: string
}

export interface AccountConnectionRecoveryConfirmationRepository {
  save(record: AccountConnectionRecoveryConfirmationRecordV1): void
  load(confirmationId: string): AccountConnectionRecoveryConfirmationRecordV1 | undefined
  consume(request: RecoverAccountConnectionRequestV1, consumedAt: string): boolean
  deleteExpired(expiresBefore: string): number
}

export interface PrepareAccountConnectionRecoveryRequestV1 {
  version: 1
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatus
}

export interface AccountConnectionRecoveryConfirmationChallengeV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'discard-orphaned-local-connection-state'
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatus
  requiredText: typeof ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
  expiresAt: string
}

export interface ConfirmAccountConnectionRecoveryRequestV1
  extends PrepareAccountConnectionRecoveryRequestV1 {
  confirmationId: string
  operationId: string
  enteredText: string
}

export type AccountConnectionRecoveryConfirmationErrorCode =
  | 'INVALID_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUEST'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_NOT_FOUND'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_EXPIRED'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_USED'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT_MISMATCH'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_LIMIT_REACHED'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STATE_CHANGED'
  | 'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED'

export class AccountConnectionRecoveryConfirmationError extends Error {
  constructor(
    readonly code: AccountConnectionRecoveryConfirmationErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountConnectionRecoveryConfirmationError'
  }
}

interface PendingChallenge {
  operationId: string
  accountId: string
  expectedStatus: RecoverableAccountConnectionStatus
  expiresAtMs: number
}

const isExactObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))

const isRecoverableStatus = (value: unknown): value is RecoverableAccountConnectionStatus =>
  value === 'credential-only' || value === 'provider-state-only'

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 64) return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

export const isAccountConnectionRecoveryConfirmationRecordV1 = (
  value: unknown
): value is AccountConnectionRecoveryConfirmationRecordV1 => {
  const baseKeys = [
    'version', 'confirmationId', 'operationId', 'action', 'accountId',
    'expectedStatus', 'confirmedAt', 'expiresAt'
  ]
  if (!isExactObject(value, value !== null && typeof value === 'object' &&
      'consumedAt' in value ? [...baseKeys, 'consumedAt'] : baseKeys)) return false
  return value.version === 1 && isOperationId(value.confirmationId) &&
  isOperationId(value.operationId) && value.confirmationId !== value.operationId &&
  value.action === 'discard-orphaned-local-connection-state' &&
  isAccountId(value.accountId) && isRecoverableStatus(value.expectedStatus) &&
  isTimestamp(value.confirmedAt) && isTimestamp(value.expiresAt) &&
  Date.parse(value.expiresAt) >= Date.parse(value.confirmedAt) &&
  (value.consumedAt === undefined ||
    (isTimestamp(value.consumedAt) &&
      Date.parse(value.consumedAt) >= Date.parse(value.confirmedAt) &&
      Date.parse(value.consumedAt) <= Date.parse(value.expiresAt)))
}

export class AccountConnectionRecoveryConfirmationService
implements AccountConnectionRecoveryConfirmationVerifier {
  private readonly pending = new Map<string, PendingChallenge>()

  constructor(
    private readonly connections: AccountConnectionService,
    private readonly repository: AccountConnectionRecoveryConfirmationRepository,
    private readonly clock: AccountConnectionRecoveryConfirmationClock,
    private readonly idSource: () => string
  ) {}

  async prepare(request: unknown): Promise<AccountConnectionRecoveryConfirmationChallengeV1> {
    if (!isExactObject(request, ['version', 'action', 'accountId', 'expectedStatus']) ||
        request.version !== 1 || request.action !== 'discard-orphaned-local-connection-state' ||
        !isAccountId(request.accountId) || !isRecoverableStatus(request.expectedStatus)) {
      throw this.invalidRequest()
    }
    let consistency
    try {
      consistency = await this.connections.inspect(request.accountId)
    } catch (error) {
      throw this.storageError(error)
    }
    if (consistency.status !== request.expectedStatus) {
      throw new AccountConnectionRecoveryConfirmationError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STATE_CHANGED',
        'The account connection state is not eligible for the requested recovery.',
        false
      )
    }
    const nowMs = this.validNow().getTime()
    for (const [confirmationId, challenge] of this.pending) {
      if (challenge.expiresAtMs < nowMs) this.pending.delete(confirmationId)
    }
    if (this.pending.size >= MAX_PENDING_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATIONS) {
      throw new AccountConnectionRecoveryConfirmationError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_LIMIT_REACHED',
        'Too many account recovery confirmations are open. Please wait and try again.',
        true
      )
    }
    const confirmationId = this.idSource()
    const operationId = this.idSource()
    if (!isOperationId(confirmationId) || !isOperationId(operationId) ||
        confirmationId === operationId) throw this.invalidRequest()
    const expiresAtMs = nowMs + ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TTL_MS
    this.pending.set(confirmationId, {
      operationId,
      accountId: request.accountId,
      expectedStatus: request.expectedStatus,
      expiresAtMs
    })
    return {
      version: 1,
      confirmationId,
      operationId,
      action: request.action,
      accountId: request.accountId,
      expectedStatus: request.expectedStatus,
      requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
      expiresAt: new Date(expiresAtMs).toISOString()
    }
  }

  confirm(request: unknown): AccountConnectionRecoveryConfirmationRecordV1 {
    if (!isExactObject(request, [
      'version', 'confirmationId', 'operationId', 'action', 'accountId',
      'expectedStatus', 'enteredText'
    ]) || request.version !== 1 || !isOperationId(request.confirmationId) ||
        !isOperationId(request.operationId) ||
        request.action !== 'discard-orphaned-local-connection-state' ||
        !isAccountId(request.accountId) || !isRecoverableStatus(request.expectedStatus) ||
        typeof request.enteredText !== 'string') throw this.invalidRequest()
    if (request.enteredText !== ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT) {
      throw new AccountConnectionRecoveryConfirmationError(
        'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT_MISMATCH',
        'The account recovery confirmation text does not match.',
        false
      )
    }
    const confirmedRequest: ConfirmAccountConnectionRecoveryRequestV1 = {
      version: 1,
      confirmationId: request.confirmationId,
      operationId: request.operationId,
      action: request.action,
      accountId: request.accountId,
      expectedStatus: request.expectedStatus,
      enteredText: request.enteredText
    }
    const existing = this.load(request.confirmationId)
    if (existing !== undefined) {
      if (!this.matchesRequest(existing, confirmedRequest)) throw this.notFound()
      if (existing.consumedAt !== undefined) throw this.used()
      if (Date.parse(existing.expiresAt) < this.validNow().getTime()) throw this.expired()
      return existing
    }
    const challenge = this.pending.get(request.confirmationId)
    if (challenge === undefined || challenge.operationId !== request.operationId ||
        challenge.accountId !== request.accountId ||
        challenge.expectedStatus !== request.expectedStatus) throw this.notFound()
    const now = this.validNow()
    if (challenge.expiresAtMs < now.getTime()) {
      this.pending.delete(request.confirmationId)
      throw this.expired()
    }
    const record: AccountConnectionRecoveryConfirmationRecordV1 = {
      version: 1,
      confirmationId: request.confirmationId,
      operationId: request.operationId,
      action: request.action,
      accountId: request.accountId,
      expectedStatus: request.expectedStatus,
      confirmedAt: now.toISOString(),
      expiresAt: new Date(challenge.expiresAtMs).toISOString()
    }
    try {
      this.repository.save(record)
    } catch (error) {
      throw this.storageError(error)
    }
    this.pending.delete(request.confirmationId)
    return record
  }

  consume(request: RecoverAccountConnectionRequestV1): boolean {
    try {
      return this.repository.consume(request, this.validNow().toISOString())
    } catch (error) {
      if (error instanceof AccountConnectionRecoveryConfirmationError) throw error
      throw this.storageError(error)
    }
  }

  cleanupExpired(): number {
    try {
      return this.repository.deleteExpired(this.validNow().toISOString())
    } catch (error) {
      if (error instanceof AccountConnectionRecoveryConfirmationError) throw error
      throw this.storageError(error)
    }
  }

  private matchesRequest(
    record: AccountConnectionRecoveryConfirmationRecordV1,
    request: Pick<RecoverAccountConnectionRequestV1, 'confirmationId' | 'operationId' | 'action' | 'accountId' | 'expectedStatus'>
  ): boolean {
    return record.confirmationId === request.confirmationId &&
      record.operationId === request.operationId && record.action === request.action &&
      record.accountId === request.accountId && record.expectedStatus === request.expectedStatus
  }

  private load(confirmationId: string): AccountConnectionRecoveryConfirmationRecordV1 | undefined {
    try {
      return this.repository.load(confirmationId)
    } catch (error) {
      throw this.storageError(error)
    }
  }

  private validNow(): Date {
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime())) throw this.storageError(new Error('Invalid clock.'))
    return now
  }

  private invalidRequest(): AccountConnectionRecoveryConfirmationError {
    return new AccountConnectionRecoveryConfirmationError(
      'INVALID_ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_REQUEST',
      'The account recovery confirmation request is invalid.',
      false
    )
  }

  private notFound(): AccountConnectionRecoveryConfirmationError {
    return new AccountConnectionRecoveryConfirmationError(
      'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_NOT_FOUND',
      'The account recovery confirmation is no longer available.',
      false
    )
  }

  private expired(): AccountConnectionRecoveryConfirmationError {
    return new AccountConnectionRecoveryConfirmationError(
      'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_EXPIRED',
      'The account recovery confirmation expired. Please start again.',
      false
    )
  }

  private used(): AccountConnectionRecoveryConfirmationError {
    return new AccountConnectionRecoveryConfirmationError(
      'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_USED',
      'The account recovery confirmation was already used. Please start again.',
      false
    )
  }

  private storageError(cause: unknown): AccountConnectionRecoveryConfirmationError {
    return new AccountConnectionRecoveryConfirmationError(
      'ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_STORAGE_FAILED',
      'Posita could not record the account recovery confirmation safely.',
      true,
      { cause }
    )
  }
}
