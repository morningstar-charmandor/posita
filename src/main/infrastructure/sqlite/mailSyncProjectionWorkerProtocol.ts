import { isAccountId } from '../../application/accountState.ts'
import {
  isCommitProviderMailBatchResultV1,
  isCommitProviderMailBatchV1,
  isMailSyncCheckpointV1,
  type CommitProviderMailBatchResultV1,
  type CommitProviderMailBatchV1,
  type MailSyncCheckpointV1
} from '../../application/mailSync.ts'
import { isLiveMailSnapshotV2, type LiveMailSnapshotV2 } from '../../../shared/liveMail.ts'
import {
  isLiveMailMessageDetailRequestV1,
  isLiveMailMessageDetailResultV1,
  type LiveMailMessageDetailRequestV1,
  type LiveMailMessageDetailResultV1
} from '../../../shared/liveMailDetail.ts'

export type MailSyncProjectionWorkerOperationV1 =
  | { kind: 'load-checkpoint'; accountId: string }
  | { kind: 'load-read-model'; loadedAt: string }
  | { kind: 'load-message-detail'; request: LiveMailMessageDetailRequestV1 }
  | { kind: 'commit-batch'; batch: CommitProviderMailBatchV1 }
  | { kind: 'delete-account-records'; accountId: string }

export interface MailSyncProjectionWorkerRequestV1 {
  version: 1
  databasePath: string
  key: Uint8Array
  operation: MailSyncProjectionWorkerOperationV1
}

export type MailSyncProjectionWorkerSuccessV1 =
  | {
    version: 1
    ok: true
    operation: 'load-checkpoint'
    checkpoint?: MailSyncCheckpointV1
  }
  | {
    version: 1
    ok: true
    operation: 'load-read-model'
    snapshot: LiveMailSnapshotV2
  }
  | {
    version: 1
    ok: true
    operation: 'load-message-detail'
    result: LiveMailMessageDetailResultV1
  }
  | {
    version: 1
    ok: true
    operation: 'commit-batch'
    result: CommitProviderMailBatchResultV1
  }
  | {
    version: 1
    ok: true
    operation: 'delete-account-records'
    accountId: string
    changed: boolean
  }

export type MailSyncProjectionWorkerErrorCode =
  | 'INVALID_REQUEST'
  | 'SYNC_CHECKPOINT_CONFLICT'
  | 'SYNC_STORAGE_FAILED'

export interface MailSyncProjectionWorkerErrorV1 {
  version: 1
  ok: false
  code: MailSyncProjectionWorkerErrorCode
}

export type MailSyncProjectionWorkerResponseV1 =
  | MailSyncProjectionWorkerSuccessV1
  | MailSyncProjectionWorkerErrorV1

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

export const isMailSyncProjectionWorkerRequestV1 = (
  value: unknown
): value is MailSyncProjectionWorkerRequestV1 => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'databasePath', 'key', 'operation'
  ]) || value.version !== 1 || typeof value.databasePath !== 'string' ||
      value.databasePath.length === 0 || value.databasePath.length > 4096 ||
      value.databasePath === ':memory:' || !(value.key instanceof Uint8Array) ||
      value.key.byteLength !== 32 || !isRecord(value.operation)) return false

  const operation = value.operation
  if (operation.kind === 'load-checkpoint') {
    return hasOnlyKeys(operation, ['kind', 'accountId']) && isAccountId(operation.accountId)
  }
  if (operation.kind === 'load-read-model') {
    return hasOnlyKeys(operation, ['kind', 'loadedAt']) &&
      typeof operation.loadedAt === 'string' && operation.loadedAt.length <= 64 &&
      Number.isFinite(Date.parse(operation.loadedAt))
  }
  if (operation.kind === 'load-message-detail') {
    return hasOnlyKeys(operation, ['kind', 'request']) &&
      isLiveMailMessageDetailRequestV1(operation.request)
  }
  if (operation.kind === 'delete-account-records') {
    return hasOnlyKeys(operation, ['kind', 'accountId']) && isAccountId(operation.accountId)
  }
  return operation.kind === 'commit-batch' && hasOnlyKeys(operation, ['kind', 'batch']) &&
    isCommitProviderMailBatchV1(operation.batch)
}

export const isMailSyncProjectionWorkerResponseV1 = (
  value: unknown
): value is MailSyncProjectionWorkerResponseV1 => {
  if (!isRecord(value) || value.version !== 1 || typeof value.ok !== 'boolean') return false
  if (!value.ok) {
    return hasOnlyKeys(value, ['version', 'ok', 'code']) &&
      (value.code === 'INVALID_REQUEST' || value.code === 'SYNC_CHECKPOINT_CONFLICT' ||
        value.code === 'SYNC_STORAGE_FAILED')
  }
  if (value.operation === 'load-checkpoint') {
    const checkpointKey = value.checkpoint === undefined ? [] : ['checkpoint']
    return hasOnlyKeys(value, ['version', 'ok', 'operation', ...checkpointKey]) &&
      (value.checkpoint === undefined || isMailSyncCheckpointV1(value.checkpoint))
  }
  if (value.operation === 'load-read-model') {
    return hasOnlyKeys(value, ['version', 'ok', 'operation', 'snapshot']) &&
      isLiveMailSnapshotV2(value.snapshot)
  }
  if (value.operation === 'load-message-detail') {
    return hasOnlyKeys(value, ['version', 'ok', 'operation', 'result']) &&
      isLiveMailMessageDetailResultV1(value.result)
  }
  if (value.operation === 'delete-account-records') {
    return hasOnlyKeys(value, [
      'version', 'ok', 'operation', 'accountId', 'changed'
    ]) && isAccountId(value.accountId) && typeof value.changed === 'boolean'
  }
  return value.operation === 'commit-batch' &&
    hasOnlyKeys(value, ['version', 'ok', 'operation', 'result']) &&
    isCommitProviderMailBatchResultV1(value.result)
}
