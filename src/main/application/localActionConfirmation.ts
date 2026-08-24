import { isOperationId } from './accountLifecycle'

export const DELETE_LOCAL_DATA_CONFIRMATION_TEXT = 'DELETE LOCAL DATA' as const
export const LOCAL_ACTION_CONFIRMATION_TTL_MS = 5 * 60 * 1000
export const MAX_PENDING_LOCAL_ACTION_CONFIRMATIONS = 16

export interface ConfirmationClock {
  now(): Date
}

export interface LocalActionConfirmationRecordV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  confirmedAt: string
  expiresAt: string
}

export interface LocalActionConfirmationRepository {
  save(record: LocalActionConfirmationRecordV1): void
  load(confirmationId: string): LocalActionConfirmationRecordV1 | undefined
}

export interface LocalActionConfirmationVerifier {
  isValid(confirmationId: string, operationId: string): boolean
  matches(confirmationId: string, operationId: string): boolean
}

export interface PrepareDeleteLocalDataConfirmationRequestV1 {
  version: 1
  action: 'delete-local-data'
}

export interface DeleteLocalDataConfirmationChallengeV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  requiredText: typeof DELETE_LOCAL_DATA_CONFIRMATION_TEXT
  expiresAt: string
  consequences: readonly [string, string, string]
}

export interface ConfirmDeleteLocalDataRequestV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  enteredText: string
}

export interface ConfirmDeleteLocalDataResultV1 {
  version: 1
  confirmationId: string
  operationId: string
  action: 'delete-local-data'
  status: 'confirmed'
  confirmedAt: string
  expiresAt: string
}

export type ConfirmationErrorCode =
  | 'INVALID_CONFIRMATION_REQUEST'
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_TEXT_MISMATCH'
  | 'CONFIRMATION_LIMIT_REACHED'
  | 'CONFIRMATION_STORAGE_FAILED'

export class LocalActionConfirmationError extends Error {
  readonly code: ConfirmationErrorCode
  readonly retryable: boolean

  constructor(
    code: ConfirmationErrorCode,
    message: string,
    retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'LocalActionConfirmationError'
    this.code = code
    this.retryable = retryable
  }
}

interface PendingChallenge {
  confirmationId: string
  operationId: string
  expiresAtMs: number
}

const consequences = Object.freeze([
  'Removes Posita mailbox cache and derived data from this Mac.',
  'Removes Google refresh credentials stored by Posita.',
  'Does not delete or change mail in Gmail.'
] as const)

const isExactObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null &&
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 64) return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

export const isLocalActionConfirmationRecordV1 = (
  value: unknown
): value is LocalActionConfirmationRecordV1 =>
  isExactObject(value, [
    'version', 'confirmationId', 'operationId', 'action', 'confirmedAt', 'expiresAt'
  ]) && value.version === 1 && isOperationId(value.confirmationId) &&
  isOperationId(value.operationId) && value.action === 'delete-local-data' &&
  isTimestamp(value.confirmedAt) && isTimestamp(value.expiresAt) &&
  Date.parse(value.expiresAt) >= Date.parse(value.confirmedAt)

export class LocalActionConfirmationService implements LocalActionConfirmationVerifier {
  private readonly pending = new Map<string, PendingChallenge>()

  constructor(
    private readonly repository: LocalActionConfirmationRepository,
    private readonly clock: ConfirmationClock,
    private readonly idSource: () => string
  ) {}

  prepare(request: unknown): DeleteLocalDataConfirmationChallengeV1 {
    if (!isExactObject(request, ['version', 'action']) ||
        request.version !== 1 || request.action !== 'delete-local-data') {
      throw this.invalidRequest()
    }
    const nowMs = this.clock.now().getTime()
    for (const [confirmationId, challenge] of this.pending) {
      if (challenge.expiresAtMs < nowMs) this.pending.delete(confirmationId)
    }
    if (this.pending.size >= MAX_PENDING_LOCAL_ACTION_CONFIRMATIONS) {
      throw new LocalActionConfirmationError(
        'CONFIRMATION_LIMIT_REACHED',
        'Too many confirmation challenges are open. Please wait and try again.',
        true
      )
    }
    const confirmationId = this.idSource()
    const operationId = this.idSource()
    if (!isOperationId(confirmationId) || !isOperationId(operationId) ||
        confirmationId === operationId) {
      throw new LocalActionConfirmationError(
        'INVALID_CONFIRMATION_REQUEST',
        'Posita could not create a safe confirmation challenge.',
        false
      )
    }
    const expiresAtMs = nowMs + LOCAL_ACTION_CONFIRMATION_TTL_MS
    this.pending.set(confirmationId, { confirmationId, operationId, expiresAtMs })
    return {
      version: 1,
      confirmationId,
      operationId,
      action: 'delete-local-data',
      requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
      expiresAt: new Date(expiresAtMs).toISOString(),
      consequences
    }
  }

  confirm(request: unknown): ConfirmDeleteLocalDataResultV1 {
    if (!isExactObject(request, [
      'version', 'confirmationId', 'operationId', 'action', 'enteredText'
    ]) || request.version !== 1 || !isOperationId(request.confirmationId) ||
        !isOperationId(request.operationId) || request.action !== 'delete-local-data' ||
        typeof request.enteredText !== 'string') {
      throw this.invalidRequest()
    }
    if (request.enteredText !== DELETE_LOCAL_DATA_CONFIRMATION_TEXT) {
      throw new LocalActionConfirmationError(
        'CONFIRMATION_TEXT_MISMATCH',
        'The confirmation text does not match.',
        false
      )
    }

    const existing = this.load(request.confirmationId)
    if (existing !== undefined) {
      if (existing.operationId !== request.operationId) throw this.notFound()
      if (Date.parse(existing.expiresAt) < this.clock.now().getTime()) throw this.expired()
      return this.result(existing)
    }

    const challenge = this.pending.get(request.confirmationId)
    if (challenge === undefined || challenge.operationId !== request.operationId) {
      throw this.notFound()
    }
    const now = this.clock.now()
    if (challenge.expiresAtMs < now.getTime()) {
      this.pending.delete(request.confirmationId)
      throw this.expired()
    }
    const record: LocalActionConfirmationRecordV1 = {
      version: 1,
      confirmationId: request.confirmationId,
      operationId: request.operationId,
      action: 'delete-local-data',
      confirmedAt: now.toISOString(),
      expiresAt: new Date(challenge.expiresAtMs).toISOString()
    }
    try {
      this.repository.save(record)
    } catch (error) {
      throw this.storageError(error)
    }
    this.pending.delete(request.confirmationId)
    return this.result(record)
  }

  isValid(confirmationId: string, operationId: string): boolean {
    const record = this.load(confirmationId)
    return record?.operationId === operationId &&
      Date.parse(record.expiresAt) >= this.clock.now().getTime()
  }

  matches(confirmationId: string, operationId: string): boolean {
    return this.load(confirmationId)?.operationId === operationId
  }

  private load(confirmationId: string): LocalActionConfirmationRecordV1 | undefined {
    try {
      return this.repository.load(confirmationId)
    } catch (error) {
      throw this.storageError(error)
    }
  }

  private result(record: LocalActionConfirmationRecordV1): ConfirmDeleteLocalDataResultV1 {
    return { ...record, status: 'confirmed' }
  }

  private invalidRequest(): LocalActionConfirmationError {
    return new LocalActionConfirmationError(
      'INVALID_CONFIRMATION_REQUEST', 'The confirmation request is invalid.', false
    )
  }

  private notFound(): LocalActionConfirmationError {
    return new LocalActionConfirmationError(
      'CONFIRMATION_NOT_FOUND', 'The confirmation challenge is no longer available.', false
    )
  }

  private expired(): LocalActionConfirmationError {
    return new LocalActionConfirmationError(
      'CONFIRMATION_EXPIRED', 'The confirmation challenge expired. Please start again.', false
    )
  }

  private storageError(cause: unknown): LocalActionConfirmationError {
    return new LocalActionConfirmationError(
      'CONFIRMATION_STORAGE_FAILED',
      'Posita could not record the confirmation safely. Please try again.',
      true,
      { cause }
    )
  }
}
