import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  CommitProviderMailBatchV2
} from '../../application/mailSync'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../../shared/providerMail'
import { GOOGLE_CONNECT_CONSENT } from '../../../shared/contracts'
import { AesGcmCacheProtector } from '../security/aesGcmCacheProtector'
import { openPositaDatabase } from './database'
import { EncryptedSqliteMailSyncProjection } from './encryptedSqliteMailSyncProjection'
import { applyMigrations } from './migrations'
import { EncryptedSqliteAccountStateRepository } from './encryptedSqliteAccountStateRepository'
import { LIVE_MAIL_DETAIL_BODY_LIMIT } from '../../../shared/liveMailDetail'

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
): CommitProviderMailBatchV2 => {
  const record = source(accountId, suffix)
  return {
    version: 2,
    accountId,
    provider: 'google',
    ...(expectedCursor === undefined ? {} : { expectedCursor }),
    nextCursor,
    reconciliation: 'incremental',
    messages: [record.message],
    threads: [record.thread],
    deletedProviderMessageIds: []
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
    accountState: new EncryptedSqliteAccountStateRepository(database, protector),
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
  it('projects a bounded newest-first live read model without bodies or provider IDs', async () => {
    const { accountState, projection } = createProjection()
    accountState.saveProviderAccount({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      providerAccountId: 'provider-subject-test-1',
      displayIdentity: {
        mailboxAddress: 'owner.work@example.test',
        displayLabel: 'Work'
      },
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-30T09:00:00.000Z'
    })
    const first = commit('account-work-1', 'older', undefined, 'cursor-1')
    first.messages[0]!.receivedAt = '2026-08-30T10:00:00.000Z'
    first.messages[0]!.body.plain = '  A private body\nwith   normalized spacing.  '
    await projection.commitBatch(first)
    await projection.commitBatch(commit(
      'account-work-1', 'newer', 'cursor-1', 'cursor-2'
    ))

    const readModel = await projection.loadReadModel('2026-09-01T05:00:00.000Z')
    expect(readModel).toMatchObject({
      dataMode: 'live-canonical',
      status: 'ready',
      accounts: [{
        accountId: 'account-work-1',
        provider: 'google',
        displayIdentity: {
          status: 'available',
          mailboxAddress: 'owner.work@example.test',
          displayLabel: 'Work'
        },
        status: 'ready'
      }],
      messages: [
        { id: 'message-newer', accountId: 'account-work-1' },
        { id: 'message-older', preview: 'A private body with normalized spacing.' }
      ],
      hasMore: false
    })
    const serialized = JSON.stringify(readModel)
    expect(serialized).not.toContain('provider-message-newer')
    expect(serialized).not.toContain('provider-subject-test-1')
    expect(serialized).not.toContain('recipients')
    expect(readModel.messages.every((message) => !Object.hasOwn(message, 'body'))).toBe(true)
  })

  it('loads one bounded plain-text source detail without remote identifiers or HTML', async () => {
    const { accountState, projection } = createProjection()
    accountState.saveProviderAccount({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      providerAccountId: 'provider-subject-test-1',
      displayIdentity: {
        mailboxAddress: 'owner.work@example.test',
        displayLabel: 'Work'
      },
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-30T09:00:00.000Z'
    })
    const batch = commit()
    batch.messages[0]!.recipients = [
      { role: 'to', mailbox: { address: 'owner.work@example.test' } },
      { role: 'cc', mailbox: { address: 'reviewer@example.test', displayName: 'Reviewer' } }
    ]
    batch.messages[0]!.body = {
      plain: 'Trusted plain-text source body.',
      html: { sanitization: 'reviewed-html-v1', content: '<p>Private provider HTML</p>' }
    }
    batch.messages[0]!.attachments = [{
      providerAttachmentId: 'provider-attachment-private-1',
      filename: 'brief.pdf',
      mediaType: 'application/pdf',
      sizeBytes: 2048,
      inline: false,
      contentId: 'provider-content-private-1'
    }]
    await projection.commitBatch(batch)

    const result = await projection.loadMessageDetail({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1'
    })
    expect(result).toMatchObject({
      version: 1,
      status: 'found',
      detail: {
        accountId: 'account-work-1',
        messageId: 'message-1',
        threadId: 'thread-1',
        accountIdentity: {
          status: 'available',
          mailboxAddress: 'owner.work@example.test',
          displayLabel: 'Work'
        },
        body: { plainText: 'Trusted plain-text source body.', truncated: false },
        attachments: [{
          filename: 'brief.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 2048,
          inline: false
        }]
      }
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('provider-message-1')
    expect(serialized).not.toContain('provider-subject-test-1')
    expect(serialized).not.toContain('provider-attachment-private-1')
    expect(serialized).not.toContain('provider-content-private-1')
    expect(serialized).not.toContain('Private provider HTML')
    await expect(projection.loadOriginalSourceLocator({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1'
    })).resolves.toEqual({
      version: 1,
      status: 'found',
      accountId: 'account-work-1',
      messageId: 'message-1',
      provider: 'google',
      mailboxAddress: 'owner.work@example.test',
      providerMessageId: 'provider-message-1'
    })
  })

  it('returns scoped missing detail and explicitly truncates oversized plain text', async () => {
    const { projection } = createProjection()
    const batch = commit()
    batch.messages[0]!.body.plain = 'x'.repeat(LIVE_MAIL_DETAIL_BODY_LIMIT + 1)
    await projection.commitBatch(batch)

    await expect(projection.loadMessageDetail({
      version: 1,
      accountId: 'account-personal-1',
      messageId: 'message-1'
    })).resolves.toEqual({
      version: 1,
      status: 'missing',
      accountId: 'account-personal-1',
      messageId: 'message-1'
    })
    const found = await projection.loadMessageDetail({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1'
    })
    expect(found.status).toBe('found')
    if (found.status === 'found') {
      expect(found.detail.body.truncated).toBe(true)
      expect(found.detail.body.plainText.length).toBe(LIVE_MAIL_DETAIL_BODY_LIMIT)
      expect(found.detail.accountIdentity).toEqual({ status: 'unavailable' })
    }
    await expect(projection.loadOriginalSourceLocator({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1'
    })).resolves.toEqual({
      version: 1,
      status: 'account-identity-unavailable',
      accountId: 'account-work-1',
      messageId: 'message-1'
    })
  })

  it('distinguishes live-empty and safe offline state', async () => {
    const empty = createProjection()
    await expect(empty.projection.loadReadModel('2026-09-01T05:00:00.000Z'))
      .resolves.toMatchObject({ status: 'empty', accounts: [], messages: [] })

    const offline = createProjection()
    offline.accountState.saveProviderAccount({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      providerAccountId: 'provider-subject-test-1',
      displayIdentity: { mailboxAddress: 'owner.work@example.test' },
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-30T09:00:00.000Z'
    })
    offline.accountState.saveSyncState({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      status: 'error',
      lastErrorCode: 'OFFLINE'
    })
    await expect(offline.projection.loadReadModel('2026-09-01T05:00:00.000Z'))
      .resolves.toMatchObject({
        status: 'offline',
        accounts: [{
          accountId: 'account-work-1',
          displayIdentity: {
            status: 'available',
            mailboxAddress: 'owner.work@example.test'
          },
          status: 'offline'
        }]
      })
  })

  it('caps live output at the fixed newest-summary boundary', async () => {
    const { accountState, projection } = createProjection()
    accountState.saveProviderAccount({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      providerAccountId: 'provider-subject-test-1',
      displayIdentity: { mailboxAddress: 'owner.work@example.test' },
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
      connectedAt: '2026-08-30T09:00:00.000Z'
    })
    const records = Array.from({ length: 51 }, (_, index) => {
      const record = source('account-work-1', `bounded-${index + 1}`)
      record.message.receivedAt = new Date(
        Date.parse('2026-08-30T10:00:00.000Z') + index * 1_000
      ).toISOString()
      return record
    })
    await projection.commitBatch({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      nextCursor: 'cursor-bounded-1',
      reconciliation: 'incremental',
      messages: records.map(({ message }) => message),
      threads: records.map(({ thread }) => thread),
      deletedProviderMessageIds: []
    })

    const readModel = await projection.loadReadModel('2026-09-01T05:00:00.000Z')
    expect(readModel.messages).toHaveLength(50)
    expect(readModel.hasMore).toBe(true)
    expect(readModel.messages[0]?.id).toBe('message-bounded-51')
    expect(readModel.messages.at(-1)?.id).toBe('message-bounded-2')
  })

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

  it('atomically applies a provider tombstone, repairs its thread, and advances the cursor', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit())
    const deletion = commit('account-work-1', 'unused', 'cursor-1', 'cursor-2')
    deletion.messages = []
    deletion.threads = []
    deletion.deletedProviderMessageIds = ['provider-message-1']

    await projection.commitBatch(deletion)

    expect(database.prepare(`
      SELECT record_type FROM encrypted_provider_mail_records
      WHERE account_scope = 'account-work-1'
    `).all()).toEqual([])
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-2'
    })
  })

  it('treats a bounded resync as the authoritative account window', async () => {
    const { database, projection } = createProjection()
    await projection.commitBatch(commit('account-work-1', 'stale'))
    const replacement = commit(
      'account-work-1',
      'current',
      'cursor-1',
      'cursor-recovered'
    )
    replacement.reconciliation = 'bounded-resync'

    await projection.commitBatch(replacement)

    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM encrypted_provider_mail_records
      WHERE account_scope = 'account-work-1'
    `).get()).toEqual({ count: 2 })
    const readModel = await projection.loadReadModel('2026-09-01T05:00:00.000Z')
    expect(readModel.messages.map((message) => message.id)).toEqual(['message-current'])
    await expect(projection.loadCheckpoint('account-work-1')).resolves.toMatchObject({
      cursor: 'cursor-recovered'
    })
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
