import { describe, expect, it } from 'vitest'
import {
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  LOCAL_ACTION_CONFIRMATION_TTL_MS,
  MAX_PENDING_LOCAL_ACTION_CONFIRMATIONS,
  LocalActionConfirmationError,
  LocalActionConfirmationService,
  type LocalActionConfirmationRecordV1,
  type LocalActionConfirmationRepository
} from './localActionConfirmation'

class MemoryConfirmationRepository implements LocalActionConfirmationRepository {
  readonly records = new Map<string, LocalActionConfirmationRecordV1>()
  fail = false

  save(record: LocalActionConfirmationRecordV1): void {
    if (this.fail) throw new Error('storage failed')
    this.records.set(record.confirmationId, structuredClone(record))
  }

  load(confirmationId: string): LocalActionConfirmationRecordV1 | undefined {
    if (this.fail) throw new Error('storage failed')
    const record = this.records.get(confirmationId)
    return record && structuredClone(record)
  }
}

const createHarness = () => {
  let nowMs = Date.parse('2026-08-24T12:00:00.000Z')
  let id = 0
  const repository = new MemoryConfirmationRepository()
  const service = new LocalActionConfirmationService(
    repository,
    { now: () => new Date(nowMs) },
    () => id++ === 0 ? 'confirm-delete-1' : 'delete-local-1'
  )
  return {
    repository,
    service,
    advance: (milliseconds: number) => { nowMs += milliseconds }
  }
}

const prepare = (service: LocalActionConfirmationService) => service.prepare({
  version: 1,
  action: 'delete-local-data'
})

describe('LocalActionConfirmationService', () => {
  it('creates a bounded challenge with explicit consequences and no destructive action', () => {
    const { repository, service } = createHarness()

    expect(prepare(service)).toEqual({
      version: 1,
      confirmationId: 'confirm-delete-1',
      operationId: 'delete-local-1',
      action: 'delete-local-data',
      requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
      expiresAt: '2026-08-24T12:05:00.000Z',
      consequences: [
        'Removes Posita mailbox cache and derived data from this Mac.',
        'Removes Google refresh credentials stored by Posita.',
        'Does not delete or change mail in Gmail.'
      ]
    })
    expect(repository.records.size).toBe(0)
  })

  it('records exact typed confirmation and binds it to one operation', () => {
    const { repository, service } = createHarness()
    const challenge = prepare(service)

    expect(service.confirm({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })).toMatchObject({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      status: 'confirmed'
    })
    expect(service.isValid(challenge.confirmationId, challenge.operationId)).toBe(true)
    expect(service.matches(challenge.confirmationId, challenge.operationId)).toBe(true)
    expect(service.matches(challenge.confirmationId, 'delete-local-2')).toBe(false)
    expect(repository.records.size).toBe(1)
  })

  it('is idempotent when the confirmed response is retried', () => {
    const { service } = createHarness()
    const challenge = prepare(service)
    const request = {
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    } as const

    const first = service.confirm(request)
    expect(service.confirm(request)).toEqual(first)
  })

  it('rejects mismatched text without recording approval', () => {
    const { repository, service } = createHarness()
    const challenge = prepare(service)

    expect(() => service.confirm({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      enteredText: 'delete local data'
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_TEXT_MISMATCH', retryable: false
    }))
    expect(repository.records.size).toBe(0)
  })

  it('expires unconfirmed challenges and confirmed authority', () => {
    const first = createHarness()
    const unconfirmed = prepare(first.service)
    first.advance(LOCAL_ACTION_CONFIRMATION_TTL_MS + 1)
    expect(() => first.service.confirm({
      version: 1,
      confirmationId: unconfirmed.confirmationId,
      operationId: unconfirmed.operationId,
      action: unconfirmed.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_EXPIRED'
    }))

    const second = createHarness()
    const confirmed = prepare(second.service)
    second.service.confirm({
      version: 1,
      confirmationId: confirmed.confirmationId,
      operationId: confirmed.operationId,
      action: confirmed.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })
    second.advance(LOCAL_ACTION_CONFIRMATION_TTL_MS + 1)
    expect(second.service.isValid(confirmed.confirmationId, confirmed.operationId)).toBe(false)
    expect(second.service.matches(confirmed.confirmationId, confirmed.operationId)).toBe(true)
  })

  it('maps persistence failure to a safe retryable error', () => {
    const { repository, service } = createHarness()
    const challenge = prepare(service)
    repository.fail = true

    expect(() => service.confirm({
      version: 1,
      confirmationId: challenge.confirmationId,
      operationId: challenge.operationId,
      action: challenge.action,
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'CONFIRMATION_STORAGE_FAILED', retryable: true
    }))
  })

  it('rejects extra fields and invalid generated identifiers', () => {
    const { service } = createHarness()
    expect(() => service.prepare({
      version: 1,
      action: 'delete-local-data',
      startImmediately: true
    })).toThrowError(expect.objectContaining<Partial<LocalActionConfirmationError>>({
      code: 'INVALID_CONFIRMATION_REQUEST'
    }))

    const invalidIds = new LocalActionConfirmationService(
      new MemoryConfirmationRepository(),
      { now: () => new Date('2026-08-24T12:00:00.000Z') },
      () => '../invalid'
    )
    expect(() => prepare(invalidIds)).toThrowError(
      expect.objectContaining<Partial<LocalActionConfirmationError>>({
        code: 'INVALID_CONFIRMATION_REQUEST'
      })
    )
  })

  it('bounds simultaneous in-memory confirmation challenges', () => {
    let nextId = 0
    const service = new LocalActionConfirmationService(
      new MemoryConfirmationRepository(),
      { now: () => new Date('2026-08-24T12:00:00.000Z') },
      () => `generated-${nextId++}`
    )
    for (let index = 0; index < MAX_PENDING_LOCAL_ACTION_CONFIRMATIONS; index += 1) {
      prepare(service)
    }

    expect(() => prepare(service)).toThrowError(
      expect.objectContaining<Partial<LocalActionConfirmationError>>({
        code: 'CONFIRMATION_LIMIT_REACHED', retryable: true
      })
    )
  })
})
