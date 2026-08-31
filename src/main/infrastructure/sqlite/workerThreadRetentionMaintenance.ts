import { Worker } from 'node:worker_threads'
import type { RetentionResult } from '../../application/retentionMaintenance'
import type { RetentionMaintenanceRunner } from '../../application/retentionMaintenanceOwner'

interface RetentionWorkerResultV1 {
  version: 1
  ok: true
  result: RetentionResult
}

interface RetentionWorkerErrorV1 {
  version: 1
  ok: false
  code: 'INVALID_REQUEST' | 'RETENTION_FAILED'
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isWorkerResult = (
  value: unknown
): value is RetentionWorkerResultV1 | RetentionWorkerErrorV1 => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.ok !== 'boolean') return false
  if (!record.ok) {
    return Object.keys(record).length === 3 &&
      (record.code === 'INVALID_REQUEST' || record.code === 'RETENTION_FAILED')
  }
  if (Object.keys(record).length !== 3 ||
      typeof record.result !== 'object' || record.result === null) return false
  const result = record.result as Record<string, unknown>
  const removed = result.removed
  if (Object.keys(result).length !== 3 || typeof result.cutoffAt !== 'string' ||
      !Number.isFinite(Date.parse(result.cutoffAt)) || typeof result.changed !== 'boolean' ||
      typeof removed !== 'object' || removed === null || Object.keys(removed).length !== 4 ||
      !['messages', 'topics', 'briefItems', 'people'].every((key) =>
        isCount((removed as Record<string, unknown>)[key]))) return false
  return result.changed === ['messages', 'topics', 'briefItems', 'people'].some((key) =>
    ((removed as Record<string, number>)[key] ?? 0) > 0)
}

const defaultWorkerUrl = (): URL => new URL(
  import.meta.url.endsWith('.ts')
    ? './retentionMaintenanceWorker.ts'
    : './retentionMaintenanceWorker.js',
  import.meta.url
)

export class WorkerThreadRetentionMaintenance implements RetentionMaintenanceRunner {
  private readonly key: Buffer
  private active?: Promise<RetentionResult>
  private destroyed = false

  constructor(
    private readonly databasePath: string,
    key: Uint8Array,
    private readonly workerUrl = defaultWorkerUrl()
  ) {
    if (databasePath.length === 0 || databasePath.length > 4096 || databasePath === ':memory:' ||
        key.byteLength !== 32) {
      throw new Error('Retention maintenance worker configuration is invalid.')
    }
    this.key = Buffer.from(key)
  }

  run(now: Date): Promise<RetentionResult> {
    if (this.destroyed || !Number.isFinite(now.getTime())) {
      return Promise.reject(new Error('Retention maintenance is unavailable.'))
    }
    if (this.active) return this.active
    const promise = this.execute(now).finally(() => {
      if (this.active === promise) this.active = undefined
    })
    this.active = promise
    return promise
  }

  destroyEncryptionContext(): void {
    if (this.active) throw new Error('Retention maintenance is still active.')
    this.key.fill(0)
    this.destroyed = true
  }

  private execute(now: Date): Promise<RetentionResult> {
    return new Promise((resolve, reject) => {
      const workerKey = Uint8Array.from(this.key)
      let worker: Worker
      try {
        worker = new Worker(this.workerUrl, {
          name: 'posita-retention-maintenance',
          workerData: {
            version: 1,
            databasePath: this.databasePath,
            key: workerKey,
            now: now.toISOString()
          },
          transferList: [workerKey.buffer as ArrayBuffer]
        })
      } catch {
        workerKey.fill(0)
        reject(new Error('Retention maintenance worker failed.'))
        return
      }
      let settled = false
      const fail = (): void => {
        if (settled) return
        settled = true
        reject(new Error('Retention maintenance worker failed.'))
      }
      worker.once('message', (message: unknown) => {
        if (!isWorkerResult(message) || !message.ok) {
          fail()
          return
        }
        settled = true
        resolve(message.result)
      })
      worker.once('error', fail)
      worker.once('exit', (code) => {
        if (!settled || code !== 0) fail()
      })
    })
  }
}
