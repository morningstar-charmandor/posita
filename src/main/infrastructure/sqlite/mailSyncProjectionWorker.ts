import { parentPort, workerData } from 'node:worker_threads'
import type { DatabaseSync } from 'node:sqlite'
import { MailSyncError } from '../../application/mailSync.ts'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector.ts'
import { openPositaDatabase } from './database.ts'
import { EncryptedSqliteMailSyncProjection } from './encryptedSqliteMailSyncProjection.ts'
import {
  isMailSyncProjectionWorkerRequestV1,
  type MailSyncProjectionWorkerErrorCode
} from './mailSyncProjectionWorkerProtocol.ts'

if (parentPort === null) {
  throw new Error('Mail sync projection worker requires a parent port.')
}

if (!isMailSyncProjectionWorkerRequestV1(workerData)) {
  parentPort.postMessage({ version: 1, ok: false, code: 'INVALID_REQUEST' })
} else {
  const key = Buffer.from(workerData.key)
  const protector = new AesGcmCacheProtector(key)
  key.fill(0)
  workerData.key.fill(0)
  let database: DatabaseSync | undefined
  try {
    const activeDatabase = openPositaDatabase(workerData.databasePath)
    database = activeDatabase
    const projection = new EncryptedSqliteMailSyncProjection(activeDatabase, protector)
    if (workerData.operation.kind === 'load-checkpoint') {
      const checkpoint = await projection.loadCheckpoint(workerData.operation.accountId)
      parentPort.postMessage({
        version: 1,
        ok: true,
        operation: 'load-checkpoint',
        ...(checkpoint === undefined ? {} : { checkpoint })
      })
    } else if (workerData.operation.kind === 'load-read-model') {
      const snapshot = await projection.loadReadModel(workerData.operation.loadedAt)
      parentPort.postMessage({
        version: 1,
        ok: true,
        operation: 'load-read-model',
        snapshot
      })
    } else if (workerData.operation.kind === 'load-message-detail') {
      const result = await projection.loadMessageDetail(workerData.operation.request)
      parentPort.postMessage({
        version: 1,
        ok: true,
        operation: 'load-message-detail',
        result
      })
    } else if (workerData.operation.kind === 'load-original-source-locator') {
      const result = await projection.loadOriginalSourceLocator(workerData.operation.request)
      parentPort.postMessage({
        version: 1,
        ok: true,
        operation: 'load-original-source-locator',
        result
      })
    } else if (workerData.operation.kind === 'commit-batch') {
      const result = await projection.commitBatch(workerData.operation.batch)
      parentPort.postMessage({ version: 1, ok: true, operation: 'commit-batch', result })
    } else {
      const changed = projection.deleteAccountRecords(workerData.operation.accountId)
      parentPort.postMessage({
        version: 1,
        ok: true,
        operation: 'delete-account-records',
        accountId: workerData.operation.accountId,
        changed
      })
    }
  } catch (error) {
    const code: MailSyncProjectionWorkerErrorCode = error instanceof MailSyncError &&
      error.code === 'SYNC_CHECKPOINT_CONFLICT'
      ? 'SYNC_CHECKPOINT_CONFLICT'
      : 'SYNC_STORAGE_FAILED'
    parentPort.postMessage({ version: 1, ok: false, code })
  } finally {
    protector.destroy()
    if (database?.isOpen) database.close()
  }
}
