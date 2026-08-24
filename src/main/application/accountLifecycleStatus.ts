import type {
  AccountLifecycleRepository,
  DeleteLocalDataPhase,
  DisconnectPhase,
  LifecycleFailureCode,
  LifecycleOperationV1
} from './accountLifecycle'

export type LifecyclePublicStage =
  | 'revoking-access'
  | 'removing-credentials'
  | 'removing-account-state'
  | 'removing-mail-data'
  | 'sanitizing-storage'
  | 'erasing-encryption-key'

export interface LifecycleOperationStatusV1 {
  version: 1
  operationId: string
  operationType: 'disconnect-account' | 'delete-local-data'
  accountId?: string
  status: 'pending' | 'retry-required'
  stage: LifecyclePublicStage
  completedSteps: number
  totalSteps: number
  message: string
  lastErrorCode?: LifecycleFailureCode
}

export interface LifecycleStatusSnapshotV1 {
  version: 1
  state: 'idle' | 'pending' | 'attention-required'
  operations: LifecycleOperationStatusV1[]
}

export class LifecycleStatusError extends Error {
  readonly code = 'LIFECYCLE_STATUS_UNAVAILABLE' as const
  readonly retryable = true

  constructor(options?: ErrorOptions) {
    super('Posita could not load local-data activity. Please try again.', options)
    this.name = 'LifecycleStatusError'
  }
}

const disconnectStages: Record<Exclude<DisconnectPhase, 'completed'>, LifecyclePublicStage> = {
  'revocation-pending': 'revoking-access',
  'credential-delete-pending': 'removing-credentials',
  'account-state-delete-pending': 'removing-account-state',
  'mail-data-delete-pending': 'removing-mail-data',
  'compaction-pending': 'sanitizing-storage'
}

const deleteStages: Record<Exclude<DeleteLocalDataPhase, 'completed'>, LifecyclePublicStage> = {
  'credentials-delete-pending': 'removing-credentials',
  'account-state-delete-pending': 'removing-account-state',
  'mail-data-delete-pending': 'removing-mail-data',
  'compaction-pending': 'sanitizing-storage',
  'data-key-delete-pending': 'erasing-encryption-key'
}

const disconnectPhases = Object.keys(disconnectStages) as
  Exclude<DisconnectPhase, 'completed'>[]
const deletePhases = Object.keys(deleteStages) as
  Exclude<DeleteLocalDataPhase, 'completed'>[]

const project = (operation: LifecycleOperationV1): LifecycleOperationStatusV1 | undefined => {
  if (operation.phase === 'completed') return undefined
  const retryRequired = operation.lastErrorCode !== undefined
  if (operation.operationType === 'disconnect-account') {
    return {
      version: 1,
      operationId: operation.operationId,
      operationType: operation.operationType,
      accountId: operation.accountId,
      status: retryRequired ? 'retry-required' : 'pending',
      stage: disconnectStages[operation.phase],
      completedSteps: disconnectPhases.indexOf(operation.phase),
      totalSteps: disconnectPhases.length,
      message: retryRequired
        ? 'Posita could not finish disconnecting this account. Retry is required.'
        : 'Account disconnection is pending.',
      ...(operation.lastErrorCode === undefined
        ? {}
        : { lastErrorCode: operation.lastErrorCode })
    }
  }
  return {
    version: 1,
    operationId: operation.operationId,
    operationType: operation.operationType,
    status: retryRequired ? 'retry-required' : 'pending',
    stage: deleteStages[operation.phase],
    completedSteps: deletePhases.indexOf(operation.phase),
    totalSteps: deletePhases.length,
    message: retryRequired
      ? 'Posita could not finish deleting local data. Retry is required.'
      : 'Local-data deletion is pending.',
    ...(operation.lastErrorCode === undefined
      ? {}
      : { lastErrorCode: operation.lastErrorCode })
  }
}

export class AccountLifecycleStatusService {
  constructor(private readonly repository: AccountLifecycleRepository) {}

  load(): LifecycleStatusSnapshotV1 {
    let pending
    try {
      pending = this.repository.listPending()
    } catch (error) {
      throw new LifecycleStatusError({ cause: error })
    }
    const operations = pending
      .map(project)
      .filter((operation): operation is LifecycleOperationStatusV1 => operation !== undefined)
    return {
      version: 1,
      state: operations.some((operation) => operation.status === 'retry-required')
        ? 'attention-required'
        : operations.length > 0 ? 'pending' : 'idle',
      operations
    }
  }
}
