import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type CommitProviderMailBatchV2,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV2
} from '../../application/mailSync'
import { MailSyncCoordinator } from '../../application/mailSyncCoordinator'
import { DeterministicFakeMailProviderAdapter } from '../providers/deterministicFakeMailSync'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../../shared/providerMail'
import { openPositaDatabase } from './database'
import { applyMigrations } from './migrations'
import { WorkerThreadMailSyncProjection } from './workerThreadMailSyncProjection'

const clock = { now: (): Date => new Date('2026-08-31T12:00:00.000Z') }
const key = Uint8Array.from({ length: 32 }, (_, index) => index * 5 + 1)
const temporaryDirectories: string[] = []
const openDatabases: DatabaseSync[] = []

const source = (
  suffix: string,
  accountId = 'account-work-1'
): { message: ProviderMailMessageV1; thread: ProviderMailThreadV1 } => {
  const message: ProviderMailMessageV1 = {
    version: 1,
    id: `message-${suffix}`,
    threadId: `thread-${suffix}`,
    accountId,
    source: {
      provider: 'google',
      accountId,
      providerMessageId: `provider-message-${suffix}`,
      providerThreadId: `provider-thread-${suffix}`
    },
    sender: { address: `sender-${suffix}@example.test` },
    recipients: [{ role: 'to', mailbox: { address: 'owner@example.test' } }],
    sentAt: '2026-08-30T10:00:00.000Z',
    receivedAt: '2026-08-30T10:00:01.000Z',
    subject: `Credential-free subject ${suffix}`,
    body: { plain: `Credential-free body ${suffix}.` },
    labels: ['inbox'],
    isRead: false,
    attachments: []
  }
  return {
    message,
    thread: {
      version: 1,
      id: message.threadId,
      accountId,
      provider: 'google',
      providerThreadId: message.source.providerThreadId,
      messageIds: [message.id]
    }
  }
}

const providerBatch = (
  suffix: string,
  nextCursor: string,
  complete = true,
  accountId = 'account-work-1'
): ProviderMailBatchV2 => {
  const record = source(suffix, accountId)
  return {
    version: 2,
    accountId,
    provider: 'google',
    messages: [record.message],
    threads: [record.thread],
    deletedProviderMessageIds: [],
    nextCursor,
    complete
  }
}

const commit = (
  suffix: string,
  nextCursor: string,
  expectedCursor?: string
): CommitProviderMailBatchV2 => {
  const batch = providerBatch(suffix, nextCursor)
  return {
    version: 2,
    accountId: batch.accountId,
    provider: batch.provider,
    ...(expectedCursor === undefined ? {} : { expectedCursor }),
    nextCursor,
    reconciliation: 'incremental',
    messages: batch.messages,
    threads: batch.threads,
    deletedProviderMessageIds: []
  }
}

const request = (accountId = 'account-work-1') => ({
  version: 1 as const,
  accountId,
  provider: 'google' as const
})

const createFileProjection = async (): Promise<{
  database: DatabaseSync
  projection: WorkerThreadMailSyncProjection
}> => {
  const directory = await mkdtemp(join(tmpdir(), 'posita-sync-worker-integration-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'posita.sqlite')
  const database = openPositaDatabase(databasePath)
  openDatabases.push(database)
  applyMigrations(database)
  return {
    database,
    projection: new WorkerThreadMailSyncProjection(databasePath, key)
  }
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('credential-free worker-backed mail sync integration', () => {
  it('commits multiple pages, resumes from the encrypted cursor, and classifies replay', async () => {
    const { database, projection } = await createFileProjection()
    const provider = new DeterministicFakeMailProviderAdapter([
      {
        accountId: 'account-work-1',
        batch: providerBatch('one', 'cursor-one', false)
      },
      {
        accountId: 'account-work-1',
        requestCursor: 'cursor-one',
        batch: providerBatch('two', 'cursor-two')
      },
      {
        accountId: 'account-work-1',
        requestCursor: 'cursor-two',
        batch: providerBatch('two', 'cursor-three')
      }
    ])
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await expect(coordinator.syncAccount(request())).resolves.toEqual({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      mode: 'initial',
      batchesCommitted: 2,
      insertedMessages: 2,
      updatedMessages: 0,
      replayedMessages: 0,
      cursor: 'cursor-two'
    })
    await expect(coordinator.syncAccount(request())).resolves.toMatchObject({
      mode: 'incremental',
      batchesCommitted: 1,
      insertedMessages: 0,
      updatedMessages: 0,
      replayedMessages: 1,
      cursor: 'cursor-three'
    })
    expect(provider.requests.map((item) => item.cursor ?? item.receivedAfter)).toEqual([
      '2026-06-02T12:00:00.000Z',
      'cursor-one',
      'cursor-two'
    ])
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-three'
    })
    expect(database.prepare(`
      SELECT record_type, COUNT(*) AS count FROM encrypted_provider_mail_records
      GROUP BY record_type ORDER BY record_type
    `).all()).toEqual([
      { record_type: 'provider-message', count: 2 },
      { record_type: 'provider-thread', count: 2 }
    ])
    const payloads = database.prepare(`
      SELECT payload FROM encrypted_provider_mail_records ORDER BY record_type, record_id
    `).all() as unknown as { payload: Uint8Array }[]
    const ciphertext = Buffer.concat(payloads.map(({ payload }) => Buffer.from(payload)))
    expect(ciphertext.includes(Buffer.from('provider-message-one'))).toBe(false)
    expect(ciphertext.includes(Buffer.from('Credential-free body two.'))).toBe(false)

    await coordinator.shutdown()
    projection.destroyEncryptionContext()
  })

  it('preserves an externally advanced cursor when the coordinator reaches a real conflict', async () => {
    class ControlledProvider implements ProviderMailAdapter {
      readonly started: Promise<void>
      private markStarted!: () => void
      private releaseBatch!: () => void

      constructor() {
        this.started = new Promise((resolve) => { this.markStarted = resolve })
      }

      async fetchBatch(
        _request: ProviderMailBatchRequestV1,
        signal: AbortSignal
      ): Promise<unknown> {
        this.markStarted()
        await new Promise<void>((resolve, reject) => {
          this.releaseBatch = resolve
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true })
        })
        return providerBatch('coordinator', 'cursor-coordinator')
      }

      release(): void { this.releaseBatch() }
    }

    const { database, projection } = await createFileProjection()
    await projection.commitBatch(commit('seed', 'cursor-seed'))
    const provider = new ControlledProvider()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)
    const running = coordinator.syncAccount(request())
    await provider.started
    await projection.commitBatch(commit('external', 'cursor-external', 'cursor-seed'))
    provider.release()

    await expect(running).rejects.toMatchObject({
      code: 'SYNC_CHECKPOINT_CONFLICT',
      retryable: true
    })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-external'
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
      WHERE record_type = 'provider-message'
    `).get()).toEqual({ count: 2 })

    await coordinator.shutdown()
    projection.destroyEncryptionContext()
  })

  it('cancels blocked provider work before key teardown and refuses later sync', async () => {
    class BlockingProvider implements ProviderMailAdapter {
      readonly started: Promise<void>
      private markStarted!: () => void

      constructor() {
        this.started = new Promise((resolve) => { this.markStarted = resolve })
      }

      fetchBatch(_request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
        this.markStarted()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true })
        })
      }
    }

    const { database, projection } = await createFileProjection()
    const provider = new BlockingProvider()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)
    const running = coordinator.syncAccount(request())
    await provider.started

    expect(coordinator.cancelAccount('account-work-1')).toBe(true)
    await expect(running).rejects.toMatchObject({ code: 'SYNC_CANCELLED' })
    await coordinator.shutdown()
    projection.destroyEncryptionContext()
    await expect(new MailSyncCoordinator(provider, projection, clock).syncAccount(request()))
      .rejects.toMatchObject({ code: 'SYNC_STORAGE_FAILED', retryable: true })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 0 })
  })
})
