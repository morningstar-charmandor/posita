import { describe, expect, it } from 'vitest'
import { WorkerThreadRetentionMaintenance } from './workerThreadRetentionMaintenance'

const workerUrl = (source: string): URL => new URL(
  `data:text/javascript,${encodeURIComponent(source)}`
)

const successfulWorker = workerUrl(`
  import { parentPort } from 'node:worker_threads'
  setTimeout(() => parentPort.postMessage({
    version: 1,
    ok: true,
    result: {
      cutoffAt: '2026-06-02T05:30:00.000Z',
      changed: true,
      removed: { messages: 1, topics: 1, briefItems: 1, people: 1 }
    }
  }), 10)
`)

describe('WorkerThreadRetentionMaintenance', () => {
  it('accepts one bounded result and shares identical in-flight worker work', async () => {
    const maintenance = new WorkerThreadRetentionMaintenance(
      '/tmp/posita-retention-test.sqlite3',
      Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      successfulWorker
    )

    const first = maintenance.run(new Date('2026-08-31T05:30:00.000Z'))
    const second = maintenance.run(new Date('2026-08-31T05:30:00.000Z'))

    expect(second).toBe(first)
    await expect(first).resolves.toEqual({
      cutoffAt: '2026-06-02T05:30:00.000Z',
      changed: true,
      removed: { messages: 1, topics: 1, briefItems: 1, people: 1 }
    })
  })

  it('fails safely when a worker returns malformed or private output', async () => {
    const maintenance = new WorkerThreadRetentionMaintenance(
      '/tmp/posita-retention-test.sqlite3',
      new Uint8Array(32),
      workerUrl(`
        import { parentPort } from 'node:worker_threads'
        parentPort.postMessage({
          version: 1,
          ok: true,
          result: { databasePath: '/private/mail.sqlite3' }
        })
      `)
    )

    await expect(maintenance.run(new Date('2026-08-31T05:30:00.000Z')))
      .rejects.toThrow('Retention maintenance worker failed.')
  })

  it('erases its retained key context and refuses later work', async () => {
    const maintenance = new WorkerThreadRetentionMaintenance(
      '/tmp/posita-retention-test.sqlite3',
      new Uint8Array(32),
      successfulWorker
    )

    maintenance.destroyEncryptionContext()

    await expect(maintenance.run(new Date('2026-09-01T05:30:00.000Z')))
      .rejects.toThrow('Retention maintenance is unavailable.')
  })

  it('rejects in-memory storage and malformed key material', () => {
    expect(() => new WorkerThreadRetentionMaintenance(':memory:', new Uint8Array(32)))
      .toThrow('Retention maintenance worker configuration is invalid.')
    expect(() => new WorkerThreadRetentionMaintenance('/tmp/posita.sqlite3', new Uint8Array(16)))
      .toThrow('Retention maintenance worker configuration is invalid.')
  })
})
