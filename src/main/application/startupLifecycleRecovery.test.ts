import { describe, expect, it } from 'vitest'
import type {
  AccountLifecycleRepository,
  DeleteLocalDataOperationV1,
  LifecycleOperationV1
} from './accountLifecycle'
import type { DeleteLocalDataResumer } from './startupLifecycleRecovery'
import {
  StartupLifecycleRecoveryError,
  StartupLifecycleRecoveryOwner
} from './startupLifecycleRecovery'

class MemoryLifecycle implements AccountLifecycleRepository {
  constructor(readonly operations: LifecycleOperationV1[]) {}
  save(): void {}
  load(): LifecycleOperationV1 | undefined { return undefined }
  loadLatestDeleteLocalData(): DeleteLocalDataOperationV1 | undefined {
    return [...this.operations]
      .reverse()
      .find((operation): operation is DeleteLocalDataOperationV1 =>
        operation.operationType === 'delete-local-data')
  }
  listPending(): LifecycleOperationV1[] {
    return this.operations.filter((operation) => operation.phase !== 'completed')
  }
  deleteCompleted(): boolean { return false }
}

class FakeResumer implements DeleteLocalDataResumer {
  readonly operationIds: string[] = []
  async resume(request: { operationId: string }): Promise<{
    version: 1
    operationId: string
    status: 'completed'
  }> {
    this.operationIds.push(request.operationId)
    return { version: 1, operationId: request.operationId, status: 'completed' }
  }
}

describe('StartupLifecycleRecoveryOwner', () => {
  it('reports pending disconnects without inventing a live revocation adapter', async () => {
    const resumer = new FakeResumer()
    const owner = new StartupLifecycleRecoveryOwner(new MemoryLifecycle([{
      version: 1,
      operationId: 'disconnect-work-1',
      operationType: 'disconnect-account',
      accountId: 'work',
      phase: 'revocation-pending'
    }]), resumer)

    await expect(owner.recover()).resolves.toEqual({
      version: 1,
      mode: 'ready',
      pendingDisconnects: 1
    })
    expect(resumer.operationIds).toEqual([])
  })

  it('resumes one pending full deletion and returns deleted mode', async () => {
    const resumer = new FakeResumer()
    const owner = new StartupLifecycleRecoveryOwner(new MemoryLifecycle([{
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'compaction-pending'
    }]), resumer)

    await expect(owner.recover()).resolves.toEqual({
      version: 1,
      mode: 'local-data-deleted',
      pendingDisconnects: 0
    })
    expect(resumer.operationIds).toEqual(['delete-local-1'])
  })

  it('honors a completed deletion marker without repeating actions', async () => {
    const resumer = new FakeResumer()
    const owner = new StartupLifecycleRecoveryOwner(new MemoryLifecycle([{
      version: 1,
      operationId: 'delete-local-1',
      operationType: 'delete-local-data',
      phase: 'completed'
    }]), resumer)

    await expect(owner.recover()).resolves.toMatchObject({ mode: 'local-data-deleted' })
    expect(resumer.operationIds).toEqual([])
  })

  it('fails closed on conflicting pending lifecycle work', async () => {
    const owner = new StartupLifecycleRecoveryOwner(new MemoryLifecycle([
      {
        version: 1,
        operationId: 'delete-local-1',
        operationType: 'delete-local-data',
        phase: 'mail-data-delete-pending'
      },
      {
        version: 1,
        operationId: 'disconnect-work-1',
        operationType: 'disconnect-account',
        accountId: 'work',
        phase: 'credential-delete-pending'
      }
    ]), new FakeResumer())

    await expect(owner.recover()).rejects.toEqual(
      expect.objectContaining<Partial<StartupLifecycleRecoveryError>>({
        code: 'LIFECYCLE_RECOVERY_CONFLICT', retryable: false
      })
    )
  })
})
