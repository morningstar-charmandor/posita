import type { AccountLifecycleRepository } from './accountLifecycle'
import type {
  DeleteLocalDataResultV1,
  ResumeDeleteLocalDataRequestV1
} from './deleteLocalData'

export interface DeleteLocalDataResumer {
  resume(
    request: ResumeDeleteLocalDataRequestV1,
    signal?: AbortSignal
  ): Promise<DeleteLocalDataResultV1>
}

export interface StartupLifecycleRecoveryResultV1 {
  version: 1
  mode: 'ready' | 'local-data-deleted'
  pendingDisconnects: number
}

export class StartupLifecycleRecoveryError extends Error {
  readonly code = 'LIFECYCLE_RECOVERY_CONFLICT' as const
  readonly retryable = false

  constructor() {
    super('Stored lifecycle operations conflict. Posita will not continue automatically.')
    this.name = 'StartupLifecycleRecoveryError'
  }
}

/** Owns one bounded startup recovery pass. It never creates lifecycle work. */
export class StartupLifecycleRecoveryOwner {
  constructor(
    private readonly lifecycle: AccountLifecycleRepository,
    private readonly deletion: DeleteLocalDataResumer
  ) {}

  async recover(signal?: AbortSignal): Promise<StartupLifecycleRecoveryResultV1> {
    signal?.throwIfAborted()
    const latestDeletion = this.lifecycle.loadLatestDeleteLocalData()
    const pending = this.lifecycle.listPending()
    const pendingDisconnects = pending.filter(
      (operation) => operation.operationType === 'disconnect-account'
    ).length

    if (latestDeletion === undefined) {
      return { version: 1, mode: 'ready', pendingDisconnects }
    }
    if (latestDeletion.phase !== 'completed') {
      if (pending.some((operation) => operation.operationId !== latestDeletion.operationId)) {
        throw new StartupLifecycleRecoveryError()
      }
      await this.deletion.resume(
        { version: 1, operationId: latestDeletion.operationId },
        signal
      )
    }
    return { version: 1, mode: 'local-data-deleted', pendingDisconnects: 0 }
  }
}
