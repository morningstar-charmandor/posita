import { parentPort, workerData } from 'node:worker_threads'
import { openPositaDatabase } from './database.ts'
import { completeEncryptedCacheSanitization } from './sqliteSanitization.ts'

interface SanitizationWorkerRequestV1 {
  version: 1
  databasePath: string
}

const isRequest = (value: unknown): value is SanitizationWorkerRequestV1 =>
  typeof value === 'object' && value !== null &&
  Object.keys(value).length === 2 &&
  Object.keys(value).every((key) => key === 'version' || key === 'databasePath') &&
  (value as Record<string, unknown>).version === 1 &&
  typeof (value as Record<string, unknown>).databasePath === 'string' &&
  ((value as Record<string, unknown>).databasePath as string).length > 0 &&
  ((value as Record<string, unknown>).databasePath as string).length <= 4096 &&
  (value as Record<string, unknown>).databasePath !== ':memory:'

if (parentPort === null) {
  throw new Error('SQLite sanitization worker requires a parent port.')
}

if (!isRequest(workerData)) {
  parentPort.postMessage({ version: 1, ok: false, code: 'INVALID_REQUEST' })
} else {
  let database
  try {
    database = openPositaDatabase(workerData.databasePath)
    completeEncryptedCacheSanitization(database)
    parentPort.postMessage({ version: 1, ok: true })
  } catch {
    parentPort.postMessage({ version: 1, ok: false, code: 'SANITIZATION_FAILED' })
  } finally {
    if (database?.isOpen) database.close()
  }
}
