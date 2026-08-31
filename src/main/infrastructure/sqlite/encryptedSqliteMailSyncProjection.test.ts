import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  CommitProviderMailBatchV1
} from '../../application/mailSync'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../../shared/providerMail'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector'
import { openPositaDatabase } from './database'
import { EncryptedSqliteMailSyncProjection } from './encryptedSqliteMailSyncProjection'
import { applyMigrations } from './migrations'

const testKey = Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 3)
const openDatabases: DatabaseSync[] = []

const nonceSource = () => {
  let counter = 0
  return (size: number): Uint8Array => {
    counter += 1
    return Uint8Array.from({ length: size }, (_, index) => (counter * 23 + index) % 256)
  }
}

const source = (
  accountId = 'account-work-1',
  suffix = '1'
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
    subject: `Encrypted subject ${suffix}`,
    body: { plain: `Encrypted body ${suffix}.` },
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

const commit = (
  accountId = 'account-work-1',
  suffix = '1',
  expectedCursor?: string,
  nextCursor = 'cursor-1'
): CommitProviderMailBatchV1 => {
  const record = source(accountId, suffix)
  return {
    version: 1,
    accountId,
    provider: 'google',
    ...(expectedCursor === undefined ? {} : { expectedCursor }),
    nextCursor,
    reconciliation: 'incremental',
    messages: [record.message],
    threads: [record.thread]
  }
}

const createProjection = () => {
  const database = openPositaDatabase(':memory:')
  openDatabases.push(database)
  applyMigrations(database)
  const protector = new AesGcmCacheProtector(testKey, nonceSource())
  let storageId = 0
  return {
    database,
    projection: new EncryptedSqliteMailSyncProjection(
      database,
      protector,
      () => `storage-${++storageId}`
    )
  }
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.isOpen) database.close()
  }
})

describe('EncryptedSqliteMailSyncProjection', () => {
  it('starts empty and atomically persists canonical records with its checkpoint', async () => {
    const { database, projection } = createProjection()
    expect(await projection.loadCheckpoint('account-work-1')).toBeUndefined()

    await expect(projection.commitBatch(commit())).resolves.toEqual({
      version: 1,
      accountId: 'account-work-1',
      nextCursor: 'cursor-1',
      insertedMessages: 1,
      updatedMessages: 0,
      replayedMessages: 0
    })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toEqual({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      cursor: 'cursor-1'
    })
    expect(database.prepare(`
      SELECT record_type, account_scope FROM encrypted_provider_mail_records
      ORDER BY record_type
    `).all()).toEqual([
      { record_type: 'provider-message', account_scope: 'account-work-1' },
      { record_type: 'provider-thread', account_scope: 'account-work-1' }
    ])
    const payloads = database.prepare(`
      SELECT payload FROM encrypted_provider_mail_records ORDER BY record_type
    `).all() as unknown as { payload: Uint8Array }[]
    const ciphertext = Buffer.concat(payloads.map((row) => Buffer.from(row.payload)))
    expect(ciphertext.includes(Buffer.from('provider-message-1'))).toBe(false)
    expect(ciphertext.includes(Buffer.from('Encrypted body 1.'))).toBe(false)
    const metadata = JSON.stringify(database.prepare(`
      SELECT record_id, account_scope FROM encrypted_provider_mail_records
    `).all())
    expect(metadata).not.toContain('message-1')
    expect(metadata).not.toContain('provider-message-1')
  })

  it('classifies replay and update by account-scoped provider identity', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit())

    await expect(projection.commitBatch(commit(
      'account-work-1', '1', 'cursor-1', 'cursor-2'
    ))).resolves.toMatchObject({ replayedMessages: 1, updatedMessages: 0 })
    const changed = commit('account-work-1', '1', 'cursor-2', 'cursor-3')
    changed.messages[0] = { ...changed.messages[0]!, subject: 'Changed encrypted subject' }
    await expect(projection.commitBatch(changed)).resolves.toMatchObject({
      insertedMessages: 0,
      updatedMessages: 1,
      replayedMessages: 0
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
      WHERE record_type = 'provider-message' AND account_scope = 'account-work-1'
    `).get()).toEqual({ count: 1 })
  })

  it('keeps identical provider identities isolated between accounts', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit('account-work-1', 'shared'))
    await projection.commitBatch(commit('account-personal-1', 'shared'))

    expect(database.prepare(`
      SELECT account_scope, COUNT(*) AS count FROM encrypted_provider_mail_records
      WHERE record_type = 'provider-message' GROUP BY account_scope ORDER BY account_scope
    `).all()).toEqual([
      { account_scope: 'account-personal-1', count: 1 },
      { account_scope: 'account-work-1', count: 1 }
    ])
  })

  it('rejects cross-account normalized data before opening a durable batch', async () => {
    const { database, projection } = createProjection()
    const invalid = commit()
    invalid.messages = [source('account-other-1').message]

    await expect(projection.commitBatch(invalid)).rejects.toMatchObject({
      code: 'MALFORMED_PAYLOAD',
      retryable: false
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 0 })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toBeUndefined()
  })

  it('rejects a stale cursor without changing records or checkpoint', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit())

    await expect(projection.commitBatch(commit(
      'account-work-1', '2', 'cursor-stale', 'cursor-2'
    ))).rejects.toMatchObject({
      code: 'SYNC_CHECKPOINT_CONFLICT',
      retryable: true
    })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-1'
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 2 })
  })

  it('authenticates stored metadata and ciphertext before replay', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit())
    database.prepare(`
      UPDATE encrypted_provider_mail_records SET payload = ?
      WHERE record_type = 'provider-message'
    `).run(Buffer.from('tampered-envelope'))

    await expect(projection.commitBatch(commit(
      'account-work-1', '1', 'cursor-1', 'cursor-2'
    ))).rejects.toMatchObject({ code: 'SYNC_STORAGE_FAILED' })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-1'
    })
  })

  it('rolls back provider records when checkpoint persistence fails', async () => {
    const { database, projection } = createProjection()
    database.exec(`
      CREATE TRIGGER reject_sync_checkpoint
      BEFORE INSERT ON encrypted_account_records
      WHEN NEW.record_type = 'sync-state'
      BEGIN SELECT RAISE(ABORT, 'deterministic checkpoint failure'); END;
    `)

    await expect(projection.commitBatch(commit())).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED'
    })
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
    `).get()).toEqual({ count: 0 })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toBeUndefined()
  })

  it('deletes only one account projection and is idempotent', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit('account-work-1', 'work'))
    await projection.commitBatch(commit('account-personal-1', 'personal'))

    expect(projection.deleteAccountRecords('account-work-1')).toBe(true)
    expect(projection.deleteAccountRecords('account-work-1')).toBe(false)
    expect(database.prepare(`
      SELECT DISTINCT account_scope FROM encrypted_provider_mail_records
    `).all()).toEqual([{ account_scope: 'account-personal-1' }])
  })

  it('retains the exact boundary and evicts older messages while repairing threads', async () => {
    const { database, projection } = createProjection()
    const old = source('account-work-1', 'old')
    old.message.sentAt = '2026-06-01T09:59:59.999Z'
    old.message.receivedAt = '2026-06-01T10:00:00.000Z'
    const recent = source('account-work-1', 'recent')
    recent.message.threadId = old.message.threadId
    recent.message.source.providerThreadId = old.message.source.providerThreadId
    const boundary = source('account-personal-1', 'boundary')
    boundary.message.sentAt = '2026-06-02T09:59:59.999Z'
    boundary.message.receivedAt = '2026-06-02T10:00:00.000Z'
    await projection.commitBatch({
      ...commit('account-work-1'),
      messages: [old.message, recent.message],
      threads: [{
        ...old.thread,
        messageIds: [old.message.id, recent.message.id]
      }]
    })
    await projection.commitBatch({
      ...commit('account-personal-1'),
      messages: [boundary.message],
      threads: [boundary.thread]
    })

    expect(projection.applyRetention(new Date('2026-08-31T10:00:00.000Z'))).toEqual({
      cutoffAt: '2026-06-02T10:00:00.000Z',
      changed: true,
      removedMessages: 1,
      removedThreads: 0,
      updatedThreads: 1
    })
    expect(database.prepare(`
      SELECT record_type, account_scope, COUNT(*) AS count
      FROM encrypted_provider_mail_records
      GROUP BY record_type, account_scope ORDER BY account_scope, record_type
    `).all()).toEqual([
      { record_type: 'provider-message', account_scope: 'account-personal-1', count: 1 },
      { record_type: 'provider-thread', account_scope: 'account-personal-1', count: 1 },
      { record_type: 'provider-message', account_scope: 'account-work-1', count: 1 },
      { record_type: 'provider-thread', account_scope: 'account-work-1', count: 1 }
    ])
    expect(database.prepare(`
      SELECT status FROM encrypted_cache_state WHERE id = 1
    `).get()).toEqual({ status: 'sanitization-pending' })
    expect(projection.applyRetention(new Date('2026-08-31T10:00:00.000Z')))
      .toMatchObject({ changed: false, removedMessages: 0, updatedThreads: 0 })
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-1'
    })
  })

  it('fails retention before mutation when any account ciphertext is invalid', async () => {
    const { database, projection } = createProjection()
    const old = commit('account-work-1', 'old')
    old.messages[0]!.receivedAt = '2026-01-01T00:00:00.000Z'
    await projection.commitBatch(old)
    await projection.commitBatch(commit('account-personal-1', 'personal'))
    database.prepare(`
      UPDATE encrypted_provider_mail_records SET payload = ?
      WHERE account_scope = 'account-personal-1' AND record_type = 'provider-thread'
    `).run(Buffer.from('tampered'))

    expect(() => projection.applyRetention(new Date('2026-08-31T10:00:00.000Z')))
      .toThrowError(expect.objectContaining({ code: 'SYNC_STORAGE_FAILED' }))
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
      WHERE account_scope = 'account-work-1' AND record_type = 'provider-message'
    `).get()).toEqual({ count: 1 })
  })

  it('keeps another account when opaque storage IDs happen to collide', async () => {
    const database = openPositaDatabase(':memory:')
    openDatabases.push(database)
    applyMigrations(database)
    const projection = new EncryptedSqliteMailSyncProjection(
      database,
      new AesGcmCacheProtector(testKey, nonceSource()),
      () => 'shared-storage-id'
    )
    const expired = commit('account-work-1', 'expired')
    expired.messages[0]!.receivedAt = '2026-01-01T00:00:00.000Z'
    const retained = commit('account-personal-1', 'retained')
    retained.messages[0]!.receivedAt = '2026-08-30T00:00:00.000Z'
    await projection.commitBatch(expired)
    await projection.commitBatch(retained)

    expect(projection.applyRetention(new Date('2026-08-31T10:00:00.000Z')))
      .toMatchObject({ removedMessages: 1, removedThreads: 1 })
    expect(database.prepare(`
      SELECT account_scope, COUNT(*) AS count FROM encrypted_provider_mail_records
      GROUP BY account_scope
    `).all()).toEqual([{ account_scope: 'account-personal-1', count: 2 }])
  })
})
