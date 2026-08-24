import { describe, expect, it } from 'vitest'
import type {
  AccountLifecycleRepository,
  LifecycleOperationV1
} from './accountLifecycle'
import {
  AccountLifecycleStatusService,
  LifecycleStatusError
} from './accountLifecycleStatus'

class FakeLifecycleRepository implements AccountLifecycleRepository {
  constructor(readonly operations: LifecycleOperationV1[] = [], readonly fail = false) {}
  save(): void {}
  load(): LifecycleOperationV1 | undefined { return undefined }
  listPending(): LifecycleOperationV1[] {
    if (this.fail) throw new Error('storage failed')
    return structuredClone(this.operations)
  }
  deleteCompleted(): boolean { return false }
}

describe('AccountLifecycleStatusService', () => {
  it('returns an empty safe snapshot when no lifecycle work is pending', () => {
    expect(new AccountLifecycleStatusService(new FakeLifecycleRepository()).load()).toEqual({
      version: 1,
      state: 'idle',
      operations: []
    })
  })

  it('projects internal phases into bounded user-facing progress', () => {
    const service = new AccountLifecycleStatusService(new FakeLifecycleRepository([
      {
        version: 1,
        operationId: 'disconnect-work-1',
        operationType: 'disconnect-account',
        accountId: 'work',
        phase: 'mail-data-delete-pending'
      },
      {
        version: 1,
        operationId: 'delete-local-1',
        operationType: 'delete-local-data',
        phase: 'data-key-delete-pending'
      }
    ]))

    expect(service.load()).toEqual({
      version: 1,
      state: 'pending',
      operations: [
        {
          version: 1,
          operationId: 'disconnect-work-1',
          operationType: 'disconnect-account',
          accountId: 'work',
          status: 'pending',
          stage: 'removing-mail-data',
          completedSteps: 3,
          totalSteps: 5,
          message: 'Account disconnection is pending.'
        },
        {
          version: 1,
          operationId: 'delete-local-1',
          operationType: 'delete-local-data',
          status: 'pending',
          stage: 'erasing-encryption-key',
          completedSteps: 4,
          totalSteps: 5,
          message: 'Local-data deletion is pending.'
        }
      ]
    })
  })

  it('shows only allow-listed retry detail and requests attention', () => {
    const service = new AccountLifecycleStatusService(new FakeLifecycleRepository([{
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'compaction-pending',
      lastErrorCode: 'COMPACTION_FAILED'
    }]))

    expect(service.load()).toEqual({
      version: 1,
      state: 'attention-required',
      operations: [{
        version: 1,
        operationId: 'delete-local-1',
        operationType: 'delete-local-data',
        status: 'retry-required',
        stage: 'sanitizing-storage',
        completedSteps: 3,
        totalSteps: 5,
        message: 'Posita could not finish deleting local data. Retry is required.',
        lastErrorCode: 'COMPACTION_FAILED'
      }]
    })
  })

  it('maps storage failures to a safe retryable error', () => {
    const service = new AccountLifecycleStatusService(new FakeLifecycleRepository([], true))
    expect(() => service.load()).toThrowError(
      expect.objectContaining<Partial<LifecycleStatusError>>({
        code: 'LIFECYCLE_STATUS_UNAVAILABLE', retryable: true
      })
    )
  })
})
