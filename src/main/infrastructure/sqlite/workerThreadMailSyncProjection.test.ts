import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { CommitProviderMailBatchV1 } from '../../application/mailSync'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../../shared/providerMail'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { WorkerThreadMailSyncProjection } from './workerThreadMailSyncProjection'

const temporaryDirectories: string[] = []
const openDatabases: DatabaseSync[] = []
const key = Uint8Array.from({ length: 32 }, (_, index) => index * 3 + 1)

const workerUrl = (source: string): URL => new URL(
  `data:text/javascript,${encodeURIComponent(source)}`
)

const source = (): { message: ProviderMailMessageV1; thread: ProviderMailThreadV1 } => {
  const message: ProviderMailMessageV1 = {
    version: 1,
    id: 'message-worker-1',
    threadId: 'thread-worker-1',
    accountId: 'account-work-1',
    source: {
      provider: 'google',
      accountId: 'account-work-1',
      providerMessageId: 'provider-message-worker-1',
      providerThreadId: 'provider-thread-worker-1'
    },
    sender: { address: 'sender@example.test' },
    recipients: [{ role: 'to', mailbox: { address: 'owner@example.test' } }],
    sentAt: '2026-08-31T09:00:00.000Z',
    receivedAt: '2026-08-31T09:00:01.000Z',
    subject: 'Worker encrypted subject',
    body: { plain: 'Worker encrypted body.' },
    labels: ['inbox'],
    isRead: false,
    attachments: []
  }
  return {
    message,
    thread: {
      version: 1,
      id: message.threadId,
      accountId: message.accountId,
      provider: 'google',
      providerThreadId: message.source.providerThreadId,
      messageIds: [message.id]
    }
  }
}

const batch = (expectedCursor?: string, nextCursor = 'cursor-worker-1') => {
  const record = source()
  return {
    version: 1,
    accountId: 'account-work-1',
    provider: 'google',
    ...(expectedCursor === undefined ? {} : { expectedCursor }),
    nextCursor,
    reconciliation: 'incremental',
    messages: [record.message],
    threads: [record.thread]
  } satisfies CommitProviderMailBatchV1
}

const createFileDatabase = async (): Promise<{ databasePath: string; database: DatabaseSync }> => {
  const directory = await mkdtemp(join(tmpdir(), 'posita-mail-projection-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'posita.sqlite')
  const database = openPositaDatabase(databasePath)
  openDatabases.push(database)
  applyMigrations(database)
  return { databasePath, database }
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('WorkerThreadMailSyncProjection', () => {
  it('commits and reloads one file-backed encrypted batch outside the caller', async () => {
    const { databasePath, database } = await createFileDatabase()
    const projection = new WorkerThreadMailSyncProjection(databasePath, key)

    await expect(projection.commitBatch(batch())).resolves.toMatchObject({
      insertedMessages: 1,
      nextCursor: 'cursor-worker-1'
    })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-worker-1'
    })
    await expect(projection.loadReadModel('2026-09-01T05:00:00.000Z')).resolves.toMatchObject({
      dataMode: 'live-canonical',
      status: 'attention-required',
      accounts: [{ accountId: 'account-work-1', status: 'attention-required' }],
      messages: [{
        id: 'message-worker-1',
        accountId: 'account-work-1',
        preview: 'Worker encrypted body.'
      }]
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 2 })
    const values = database.prepare(`
      SELECT record_id, payload FROM encrypted_provider_mail_records
    `).all() as unknown as { record_id: string; payload: Uint8Array }[]
    const stored = Buffer.concat(values.map((value) => Buffer.concat([
      Buffer.from(value.record_id), Buffer.from(value.payload)
    ])))
    expect(stored.includes(Buffer.from('provider-message-worker-1'))).toBe(false)
    expect(stored.includes(Buffer.from('Worker encrypted body.'))).toBe(false)
    await expect(projection.deleteAccountRecords('account-work-1')).resolves.toBe(true)
    await expect(projection.deleteAccountRecords('account-work-1')).resolves.toBe(false)
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 0 })
  })

  it('serializes replay after commit and returns a typed cursor conflict', async () => {
    const { databasePath } = await createFileDatabase()
    const projection = new WorkerThreadMailSyncProjection(databasePath, key)

    const first = projection.commitBatch(batch())
    const replay = projection.commitBatch(batch('cursor-worker-1', 'cursor-worker-2'))
    await expect(first).resolves.toMatchObject({ insertedMessages: 1 })
    await expect(replay).resolves.toMatchObject({ replayedMessages: 1 })
    await expect(projection.commitBatch(batch(
      'cursor-stale', 'cursor-worker-3'
    ))).rejects.toMatchObject({
      code: 'SYNC_CHECKPOINT_CONFLICT',
      retryable: true
    })
  })

  it('rejects malformed worker output without exposing its private fields', async () => {
    const { databasePath } = await createFileDatabase()
    const projection = new WorkerThreadMailSyncProjection(
      databasePath,
      key,
      workerUrl(`
        import { parentPort } from 'node:worker_threads'
        parentPort.postMessage({ version: 1, ok: true, databasePath: '/private/mail.sqlite' })
      `)
    )

    await expect(projection.loadCheckpoint('account-work-1')).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED',
      message: 'The encrypted mail projection could not be updated.'
    })
  })

  it('bounds queued file operations and refuses key teardown while work is active', async () => {
    const { databasePath } = await createFileDatabase()
    const projection = new WorkerThreadMailSyncProjection(
      databasePath,
      key,
      workerUrl(`
        import { parentPort } from 'node:worker_threads'
        setTimeout(() => parentPort.postMessage({
          version: 1, ok: true, operation: 'load-checkpoint'
        }), 5)
      `)
    )
    const accepted = Array.from({ length: 2 }, () =>
      projection.loadCheckpoint('account-work-1'))

    await expect(projection.loadCheckpoint('account-work-1')).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED'
    })
    expect(() => projection.destroyEncryptionContext()).toThrowError(
      expect.objectContaining({ code: 'SYNC_STORAGE_FAILED' })
    )
    await expect(Promise.all(accepted)).resolves.toEqual(Array(2).fill(undefined))
    expect(() => projection.destroyEncryptionContext()).not.toThrow()
  })

  it('erases its retained key and rejects invalid or later work', async () => {
    const { databasePath } = await createFileDatabase()
    expect(() => new WorkerThreadMailSyncProjection(':memory:', key)).toThrowError(
      expect.objectContaining({ code: 'SYNC_STORAGE_FAILED' })
    )
    const projection = new WorkerThreadMailSyncProjection(databasePath, key)

    await expect(projection.loadCheckpoint('invalid account')).rejects.toMatchObject({
      code: 'INVALID_SYNC_REQUEST',
      retryable: false
    })
    projection.destroyEncryptionContext()
    await expect(projection.loadCheckpoint('account-work-1')).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED'
    })
  })

  it('settles accepted read work before shutdown and refuses new work', async () => {
    const { databasePath } = await createFileDatabase()
    const projection = new WorkerThreadMailSyncProjection(
      databasePath,
      key,
      workerUrl(`
        import { parentPort } from 'node:worker_threads'
        setTimeout(() => parentPort.postMessage({
          version: 1,
          ok: true,
          operation: 'load-read-model',
          snapshot: {
            version: 1,
            dataMode: 'live-canonical',
            loadedAt: '2026-09-01T05:00:00.000Z',
            status: 'empty',
            accounts: [],
            messages: [],
            hasMore: false
          }
        }), 5)
      `)
    )
    const accepted = projection.loadReadModel('2026-09-01T05:00:00.000Z')
    const shutdown = projection.shutdown()

    await expect(projection.loadReadModel('2026-09-01T05:00:00.000Z')).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED'
    })
    await expect(accepted).resolves.toMatchObject({ status: 'empty' })
    await expect(shutdown).resolves.toBeUndefined()
  })
})
