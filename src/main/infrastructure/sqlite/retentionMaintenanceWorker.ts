import { parentPort, workerData } from 'node:worker_threads'
import type { DatabaseSync } from 'node:sqlite'
import { RetentionMaintenanceService } from '../../application/retentionMaintenance.ts'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector.ts'
import { openPositaDatabase } from './database.ts'
import { EncryptedSqliteMailRepository } from './encryptedSqliteMailRepository.ts'
import { completeEncryptedCacheSanitization } from './sqliteSanitization.ts'

interface RetentionWorkerRequestV1 {
  version: 1
  databasePath: string
  key: Uint8Array
  now: string
}

const isRequest = (value: unknown): value is RetentionWorkerRequestV1 => {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  return Object.keys(request).length === 4 &&
    Object.keys(request).every((key) => ['version', 'databasePath', 'key', 'now'].includes(key)) &&
    request.version === 1 && typeof request.databasePath === 'string' &&
    request.databasePath.length > 0 && request.databasePath.length <= 4096 &&
    request.databasePath !== ':memory:' && request.key instanceof Uint8Array &&
    request.key.byteLength === 32 && typeof request.now === 'string' &&
    Number.isFinite(Date.parse(request.now)) &&
    new Date(request.now).toISOString() === request.now
}

if (parentPort === null) {
  throw new Error('Retention maintenance worker requires a parent port.')
}

if (!isRequest(workerData)) {
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
    const repository = new EncryptedSqliteMailRepository(activeDatabase, protector)
    const maintenance = new RetentionMaintenanceService(repository, {
      sanitize: async () => completeEncryptedCacheSanitization(activeDatabase)
    })
    const result = await maintenance.run(new Date(workerData.now))
    parentPort.postMessage({ version: 1, ok: true, result })
  } catch {
    parentPort.postMessage({ version: 1, ok: false, code: 'RETENTION_FAILED' })
  } finally {
    protector.destroy()
    if (database?.isOpen) database.close()
  }
}
