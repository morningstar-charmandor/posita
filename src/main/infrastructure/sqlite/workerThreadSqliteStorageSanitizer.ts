import { Worker } from 'node:worker_threads'
import {
  StorageSanitizationError,
  type StorageSanitizer
} from '../../application/storageSanitizer'

interface WorkerResultV1 {
  version: 1
  ok: boolean
  code?: string
}

const isWorkerResult = (value: unknown): value is WorkerResultV1 => {
  if (typeof value !== 'object' || value === null) return false
  const keys = Object.keys(value)
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.ok !== 'boolean') return false
  if (record.ok) return keys.length === 2 && keys.every((key) => key === 'version' || key === 'ok')
  return keys.length === 3 && keys.every((key) =>
    key === 'version' || key === 'ok' || key === 'code') &&
    (record.code === 'INVALID_REQUEST' || record.code === 'SANITIZATION_FAILED')
}

const defaultWorkerUrl = (): URL => new URL(
  import.meta.url.endsWith('.ts')
    ? './sqliteSanitizationWorker.ts'
    : './sqliteSanitizationWorker.js',
  import.meta.url
)

export class WorkerThreadSqliteStorageSanitizer implements StorageSanitizer {
  private active?: Promise<void>

  constructor(
    private readonly databasePath: string,
    private readonly workerUrl = defaultWorkerUrl()
  ) {
    if (databasePath.length === 0 || databasePath.length > 4096 || databasePath === ':memory:') {
      throw new StorageSanitizationError()
    }
  }

  sanitize(): Promise<void> {
    if (this.active) return this.active
    const promise = this.run().finally(() => {
      if (this.active === promise) this.active = undefined
    })
    this.active = promise
    return promise
  }

  private run(): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerUrl, {
        name: 'posita-sqlite-sanitizer',
        workerData: { version: 1, databasePath: this.databasePath }
      })
      let settled = false
      const fail = (cause?: unknown): void => {
        if (settled) return
        settled = true
        reject(new StorageSanitizationError(cause === undefined ? undefined : { cause }))
      }
      worker.once('message', (message: unknown) => {
        if (!isWorkerResult(message) || !message.ok) {
          fail()
          return
        }
        settled = true
        resolve()
      })
      worker.once('error', fail)
      worker.once('exit', (code) => {
        if (!settled) fail(new Error(`SQLite sanitization worker exited with code ${code}.`))
      })
    })
  }
}
