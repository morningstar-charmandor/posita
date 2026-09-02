import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  isAccountId,
  type ProviderSyncStateV1
} from '../../application/accountState.ts'
import type { ProviderMailReadModelSource } from '../../application/providerMailReadModel.ts'
import type { ProviderMailSourceDetailSource } from '../../application/providerMailSourceDetail.ts'
import type {
  ProviderMailOriginalSourceLocatorResultV1,
  ProviderMailOriginalSourceLocatorSource
} from '../../application/providerMailOriginalSource.ts'
import {
  MailSyncError,
  isCommitProviderMailBatchV1,
  type CommitProviderMailBatchResultV1,
  type CommitProviderMailBatchV1,
  type MailSyncCheckpointV1,
  type MailSyncProjection
} from '../../application/mailSync.ts'
import {
  EncryptedCacheError,
  type CacheRecordContext,
  type CacheRecordProtector
} from '../../application/encryptedCache.ts'
import {
  applyProviderMailRetentionPolicy,
  type ProviderMailRetentionResult
} from '../../application/providerMailRetention.ts'
import {
  isProviderMailMessageV1,
  isProviderMailThreadV1,
  type ProviderMailMessageV1,
  type ProviderMailThreadV1
} from '../../../shared/providerMail.ts'
import {
  LIVE_MAIL_READ_LIMIT,
  type LiveMailAccountStatusV1,
  type LiveMailSnapshotV2
} from '../../../shared/liveMail.ts'
import {
  LIVE_MAIL_DETAIL_BODY_LIMIT,
  isLiveMailMessageDetailRequestV1,
  type LiveMailMessageDetailRequestV1,
  type LiveMailMessageDetailResultV1
} from '../../../shared/liveMailDetail.ts'
import {
  EncryptedSqliteAccountStateRepository,
  saveEncryptedProviderSyncState
} from './encryptedSqliteAccountStateRepository.ts'

type ProviderMailRecordType = 'provider-message' | 'provider-thread'

interface ProviderMailRow {
  record_type: string
  record_id: string
  account_scope: string
  envelope_scheme: string
  payload: Uint8Array
}

interface StoredRecord<T> {
  rowId: string
  value: T
}

export type ProviderMailStorageIdSource = () => string

const contextFor = (
  recordType: ProviderMailRecordType,
  recordId: string,
  accountId: string
): CacheRecordContext => ({ recordType, recordId, accountScope: accountId, position: 0 })

const malformed = (message: string): MailSyncError =>
  new MailSyncError('MALFORMED_PAYLOAD', message, false)

const storageFailure = (cause: unknown): MailSyncError =>
  new MailSyncError(
    'SYNC_STORAGE_FAILED',
    'The encrypted mail projection could not be updated.',
    true,
    { cause }
  )

const checkpointConflict = (): MailSyncError => new MailSyncError(
  'SYNC_CHECKPOINT_CONFLICT',
  'The mail sync checkpoint changed before commit.',
  true
)

/** Delete-only helper for full local-data recovery, which intentionally has no key. */
export const deleteAllEncryptedProviderMailRecords = (database: DatabaseSync): boolean => {
  try {
    return Number(database.prepare('DELETE FROM encrypted_provider_mail_records').run().changes) > 0
  } catch (error) {
    throw storageFailure(error)
  }
}

/**
 * Credential-free encrypted projection proof. It is deliberately uncomposed;
 * file-backed production use must place this synchronous work behind one worker owner.
 */
export class EncryptedSqliteMailSyncProjection implements
  MailSyncProjection, ProviderMailReadModelSource, ProviderMailSourceDetailSource,
  ProviderMailOriginalSourceLocatorSource {
  private readonly accountState: EncryptedSqliteAccountStateRepository

  constructor(
    private readonly database: DatabaseSync,
    private readonly protector: CacheRecordProtector,
    private readonly storageIdSource: ProviderMailStorageIdSource = randomUUID
  ) {
    this.accountState = new EncryptedSqliteAccountStateRepository(database, protector)
  }

  async loadCheckpoint(accountId: string): Promise<MailSyncCheckpointV1 | undefined> {
    try {
      const state = this.accountState.loadSyncState(accountId)
      if (state?.cursor === undefined) return undefined
      return {
        version: 1,
        accountId: state.accountId,
        provider: state.provider,
        cursor: state.cursor
      }
    } catch (error) {
      throw storageFailure(error)
    }
  }

  async loadReadModel(loadedAt: string): Promise<LiveMailSnapshotV2> {
    if (!Number.isFinite(Date.parse(loadedAt))) {
      throw malformed('The live-mail read timestamp is invalid.')
    }
    try {
      const rows = this.database.prepare(`
        SELECT account_scope FROM encrypted_account_records
        WHERE record_type IN ('provider-account', 'sync-state')
        UNION
        SELECT account_scope FROM encrypted_provider_mail_records
        ORDER BY account_scope
      `).all() as unknown as { account_scope: string }[]
      if (rows.length > 32) throw malformed('The live-mail account result is too large.')

      const accounts: LiveMailSnapshotV2['accounts'] = []
      const allMessages: LiveMailSnapshotV2['messages'] = []
      for (const { account_scope: accountId } of rows) {
        if (!isAccountId(accountId)) throw malformed('The stored account scope is invalid.')
        const providerAccount = this.accountState.loadProviderAccount(accountId)
        const syncState = this.accountState.loadSyncState(accountId)
        const status = this.readStatus(providerAccount !== undefined, syncState)
        accounts.push({
          accountId,
          provider: 'google',
          displayIdentity: providerAccount === undefined
            ? { status: 'unavailable' }
            : { status: 'available', ...providerAccount.displayIdentity },
          status,
          ...(syncState?.lastSuccessAt === undefined
            ? {}
            : { lastSuccessAt: syncState.lastSuccessAt })
        })
        const stored = this.loadAccountRecords(accountId)
        allMessages.push(...stored.messages.map(({ value }) => ({
          id: value.id,
          threadId: value.threadId,
          accountId: value.accountId,
          provider: value.source.provider,
          sender: value.sender,
          receivedAt: value.receivedAt,
          subject: value.subject,
          preview: this.preview(value.body.plain),
          isRead: value.isRead,
          attachmentCount: value.attachments.length
        })))
      }

      allMessages.sort((left, right) =>
        Date.parse(right.receivedAt) - Date.parse(left.receivedAt) ||
        left.accountId.localeCompare(right.accountId) ||
        left.id.localeCompare(right.id))
      const messages = allMessages.slice(0, LIVE_MAIL_READ_LIMIT)
      return {
        version: 2,
        dataMode: 'live-canonical',
        loadedAt,
        status: this.snapshotStatus(accounts, messages.length),
        accounts,
        messages,
        hasMore: allMessages.length > LIVE_MAIL_READ_LIMIT
      }
    } catch (error) {
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  async loadMessageDetail(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LiveMailMessageDetailResultV1> {
    if (!isLiveMailMessageDetailRequestV1(request)) {
      throw malformed('The source-message detail request is invalid.')
    }
    try {
      const message = this.loadAccountRecords(request.accountId).messages
        .find(({ value }) => value.id === request.messageId)?.value
      if (message === undefined) {
        return {
          version: 1,
          status: 'missing',
          accountId: request.accountId,
          messageId: request.messageId
        }
      }
      const providerAccount = this.accountState.loadProviderAccount(request.accountId)
      const plainText = this.boundPlainText(message.body.plain)
      return {
        version: 1,
        status: 'found',
        detail: {
          version: 1,
          accountId: message.accountId,
          messageId: message.id,
          threadId: message.threadId,
          provider: message.source.provider,
          accountIdentity: providerAccount === undefined
            ? { status: 'unavailable' }
            : { status: 'available', ...providerAccount.displayIdentity },
          sender: message.sender,
          recipients: message.recipients,
          sentAt: message.sentAt,
          receivedAt: message.receivedAt,
          subject: message.subject,
          body: plainText,
          isRead: message.isRead,
          attachments: message.attachments.map((attachment) => ({
            filename: attachment.filename,
            mediaType: attachment.mediaType,
            sizeBytes: attachment.sizeBytes,
            inline: attachment.inline
          }))
        }
      }
    } catch (error) {
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  async loadOriginalSourceLocator(
    request: LiveMailMessageDetailRequestV1
  ): Promise<ProviderMailOriginalSourceLocatorResultV1> {
    if (!isLiveMailMessageDetailRequestV1(request)) {
      throw malformed('The original-source locator request is invalid.')
    }
    try {
      const message = this.loadAccountRecords(request.accountId).messages
        .find(({ value }) => value.id === request.messageId)?.value
      if (message === undefined) {
        return { version: 1, status: 'missing', accountId: request.accountId, messageId: request.messageId }
      }
      const account = this.accountState.loadProviderAccount(request.accountId)
      if (account === undefined) {
        return {
          version: 1,
          status: 'account-identity-unavailable',
          accountId: request.accountId,
          messageId: request.messageId
        }
      }
      return {
        version: 1,
        status: 'found',
        accountId: message.accountId,
        messageId: message.id,
        provider: message.source.provider,
        mailboxAddress: account.displayIdentity.mailboxAddress,
        providerMessageId: message.source.providerMessageId
      }
    } catch (error) {
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  async commitBatch(
    batch: CommitProviderMailBatchV1
  ): Promise<CommitProviderMailBatchResultV1> {
    if (!isCommitProviderMailBatchV1(batch)) {
      throw malformed('The normalized mail batch is invalid.')
    }

    this.database.exec('BEGIN IMMEDIATE')
    try {
      const currentState = this.accountState.loadSyncState(batch.accountId)
      if (currentState?.cursor !== batch.expectedCursor) throw checkpointConflict()

      const stored = this.loadAccountRecords(batch.accountId)
      const messageBySource = new Map(stored.messages.map((record) => [
        record.value.source.providerMessageId,
        record
      ]))
      const messageById = new Map(stored.messages.map((record) => [record.value.id, record]))
      const threadBySource = new Map(stored.threads.map((record) => [
        record.value.providerThreadId,
        record
      ]))
      const threadById = new Map(stored.threads.map((record) => [record.value.id, record]))

      let insertedMessages = 0
      let updatedMessages = 0
      let replayedMessages = 0

      for (const message of batch.messages) {
        const existing = messageBySource.get(message.source.providerMessageId)
        const idOwner = messageById.get(message.id)
        const unchanged = existing !== undefined && isDeepStrictEqual(existing.value, message)
        if (idOwner !== undefined && idOwner !== existing) {
          throw malformed('A canonical message identifier belongs to another source record.')
        }
        if (existing === undefined) insertedMessages += 1
        else if (unchanged) replayedMessages += 1
        else updatedMessages += 1
        if (!unchanged) {
          this.saveRecord('provider-message', batch.accountId, existing?.rowId, message)
        }
      }

      for (const thread of batch.threads) {
        const existing = threadBySource.get(thread.providerThreadId)
        const idOwner = threadById.get(thread.id)
        if (idOwner !== undefined && idOwner !== existing) {
          throw malformed('A canonical thread identifier belongs to another source record.')
        }
        if (existing === undefined || !isDeepStrictEqual(existing.value, thread)) {
          this.saveRecord('provider-thread', batch.accountId, existing?.rowId, thread)
        }
      }

      const nextState: ProviderSyncStateV1 = {
        version: 1,
        accountId: batch.accountId,
        provider: batch.provider,
        status: 'idle',
        cursor: batch.nextCursor
      }
      saveEncryptedProviderSyncState(this.database, this.protector, nextState)
      this.database.exec('COMMIT')
      return {
        version: 1,
        accountId: batch.accountId,
        nextCursor: batch.nextCursor,
        insertedMessages,
        updatedMessages,
        replayedMessages
      }
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  deleteAccountRecords(accountId: string): boolean {
    if (!isAccountId(accountId)) throw malformed('The account scope is invalid.')
    try {
      return Number(this.database.prepare(`
        DELETE FROM encrypted_provider_mail_records WHERE account_scope = ?
      `).run(accountId).changes) > 0
    } catch (error) {
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  applyRetention(now: Date): ProviderMailRetentionResult {
    try {
      const scopes = this.database.prepare(`
        SELECT DISTINCT account_scope FROM encrypted_provider_mail_records
        ORDER BY account_scope
      `).all() as unknown as { account_scope: string }[]
      const plans = scopes.map(({ account_scope: accountId }) => {
        if (!isAccountId(accountId)) throw malformed('The stored account scope is invalid.')
        const stored = this.loadAccountRecords(accountId)
        const plan = applyProviderMailRetentionPolicy(
          stored.messages.map(({ value }) => value),
          stored.threads.map(({ value }) => value),
          now
        )
        const retainedThreadById = new Map(plan.threads.map((thread) => [thread.id, thread]))
        return {
          accountId,
          stored,
          plan,
          updatedThreads: stored.threads.flatMap((record) => {
            const retained = retainedThreadById.get(record.value.id)
            if (retained === undefined || isDeepStrictEqual(retained, record.value)) return []
            const context = contextFor('provider-thread', record.rowId, accountId)
            return [{
              accountId,
              rowId: record.rowId,
              payload: this.protector.protect(context, JSON.stringify(retained))
            }]
          })
        }
      })
      const result: ProviderMailRetentionResult = {
        cutoffAt: plans[0]?.plan.result.cutoffAt ??
          applyProviderMailRetentionPolicy([], [], now).result.cutoffAt,
        changed: plans.some(({ plan }) => plan.result.changed),
        removedMessages: plans.reduce((total, { plan }) =>
          total + plan.result.removedMessages, 0),
        removedThreads: plans.reduce((total, { plan }) =>
          total + plan.result.removedThreads, 0),
        updatedThreads: plans.reduce((total, { plan }) =>
          total + plan.result.updatedThreads, 0)
      }
      if (!result.changed) return result

      this.database.exec('BEGIN IMMEDIATE')
      try {
        for (const { accountId, stored, plan, updatedThreads } of plans) {
          const retainedMessageIds = new Set(plan.messages.map((message) => message.id))
          const retainedThreadIds = new Set(plan.threads.map((thread) => thread.id))
          for (const record of stored.messages) {
            if (!retainedMessageIds.has(record.value.id)) {
              this.deleteStoredRecord('provider-message', record.rowId, accountId)
            }
          }
          for (const record of stored.threads) {
            if (!retainedThreadIds.has(record.value.id)) {
              this.deleteStoredRecord('provider-thread', record.rowId, accountId)
            }
          }
          for (const update of updatedThreads) {
            const updated = this.database.prepare(`
              UPDATE encrypted_provider_mail_records
              SET envelope_scheme = ?, payload = ?, updated_at = datetime('now')
              WHERE record_type = 'provider-thread' AND account_scope = ? AND record_id = ?
            `).run(
              this.protector.scheme,
              Buffer.from(update.payload),
              update.accountId,
              update.rowId
            )
            if (Number(updated.changes) !== 1) {
              throw new EncryptedCacheError(
                'CACHE_STORAGE_FAILED',
                'The encrypted provider-thread record changed during retention.'
              )
            }
          }
        }
        this.database.prepare(`
          INSERT INTO encrypted_cache_state (id, status, updated_at)
          VALUES (1, 'sanitization-pending', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            status = 'sanitization-pending', updated_at = datetime('now')
        `).run()
        this.database.exec('COMMIT')
        return result
      } catch (error) {
        if (this.database.isTransaction) this.database.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof MailSyncError) throw error
      throw storageFailure(error)
    }
  }

  private loadAccountRecords(accountId: string): {
    messages: StoredRecord<ProviderMailMessageV1>[]
    threads: StoredRecord<ProviderMailThreadV1>[]
  } {
    const rows = this.database.prepare(`
      SELECT record_type, record_id, account_scope, envelope_scheme, payload
      FROM encrypted_provider_mail_records
      WHERE account_scope = ? ORDER BY record_type, record_id
    `).all(accountId) as unknown as ProviderMailRow[]
    const messages: StoredRecord<ProviderMailMessageV1>[] = []
    const threads: StoredRecord<ProviderMailThreadV1>[] = []
    const messageSources = new Set<string>()
    const threadSources = new Set<string>()
    const messageIds = new Set<string>()
    const threadIds = new Set<string>()

    for (const row of rows) {
      if ((row.record_type !== 'provider-message' && row.record_type !== 'provider-thread') ||
          row.account_scope !== accountId || row.envelope_scheme !== this.protector.scheme) {
        throw new EncryptedCacheError(
          'CACHE_RECORD_INVALID',
          'Encrypted provider-mail record metadata is invalid.'
        )
      }
      const plaintext = this.protector.unprotect(
        contextFor(row.record_type, row.record_id, accountId),
        row.payload
      )
      let value: unknown
      try {
        value = JSON.parse(plaintext) as unknown
      } catch (error) {
        throw new EncryptedCacheError(
          'CACHE_RECORD_INVALID',
          'Decrypted provider-mail data is not valid JSON.',
          { cause: error }
        )
      }
      if (row.record_type === 'provider-message') {
        if (!isProviderMailMessageV1(value) || value.accountId !== accountId ||
            value.source.provider !== 'google' ||
            messageSources.has(value.source.providerMessageId) || messageIds.has(value.id)) {
          throw new EncryptedCacheError(
            'CACHE_RECORD_INVALID',
            'Encrypted provider-message data is invalid.'
          )
        }
        messageSources.add(value.source.providerMessageId)
        messageIds.add(value.id)
        messages.push({ rowId: row.record_id, value })
      } else {
        if (!isProviderMailThreadV1(value) || value.accountId !== accountId ||
            value.provider !== 'google' ||
            threadSources.has(value.providerThreadId) || threadIds.has(value.id)) {
          throw new EncryptedCacheError(
            'CACHE_RECORD_INVALID',
            'Encrypted provider-thread data is invalid.'
          )
        }
        threadSources.add(value.providerThreadId)
        threadIds.add(value.id)
        threads.push({ rowId: row.record_id, value })
      }
    }
    return { messages, threads }
  }

  private readStatus(
    hasProviderAccount: boolean,
    syncState: ProviderSyncStateV1 | undefined
  ): LiveMailAccountStatusV1 {
    if (!hasProviderAccount) return 'attention-required'
    if (syncState === undefined) return 'not-synced'
    if (syncState.status === 'syncing') return 'syncing'
    if (syncState.status === 'disabled') return 'disabled'
    if (syncState.status === 'error') {
      return syncState.lastErrorCode === 'OFFLINE' ? 'offline' : 'attention-required'
    }
    return 'ready'
  }

  private snapshotStatus(
    accounts: readonly { status: LiveMailAccountStatusV1 }[],
    messageCount: number
  ): LiveMailSnapshotV2['status'] {
    if (accounts.some((account) => account.status === 'attention-required')) {
      return 'attention-required'
    }
    if (accounts.some((account) => account.status === 'offline')) return 'offline'
    if (accounts.some((account) => account.status === 'syncing')) return 'syncing'
    return messageCount > 0 ? 'ready' : 'empty'
  }

  private preview(body: string): string {
    const normalized = body.replace(/\s+/g, ' ').trim()
    return normalized.length <= 240 ? normalized : `${normalized.slice(0, 239)}…`
  }

  private boundPlainText(body: string): { plainText: string; truncated: boolean } {
    if (body.length <= LIVE_MAIL_DETAIL_BODY_LIMIT) {
      return { plainText: body, truncated: false }
    }
    let plainText = body.slice(0, LIVE_MAIL_DETAIL_BODY_LIMIT)
    const lastCodeUnit = plainText.charCodeAt(plainText.length - 1)
    if (lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF) plainText = plainText.slice(0, -1)
    return { plainText, truncated: true }
  }

  private saveRecord(
    recordType: ProviderMailRecordType,
    accountId: string,
    storedId: string | undefined,
    value: ProviderMailMessageV1 | ProviderMailThreadV1
  ): void {
    const recordId = storedId ?? this.storageIdSource()
    const context = contextFor(recordType, recordId, accountId)
    const payload = this.protector.protect(context, JSON.stringify(value))
    if (storedId === undefined) {
      this.database.prepare(`
        INSERT INTO encrypted_provider_mail_records (
          record_type, record_id, account_scope, envelope_scheme, payload,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(recordType, recordId, accountId, this.protector.scheme, Buffer.from(payload))
      return
    }
    const result = this.database.prepare(`
      UPDATE encrypted_provider_mail_records
      SET envelope_scheme = ?, payload = ?, updated_at = datetime('now')
      WHERE record_type = ? AND account_scope = ? AND record_id = ?
    `).run(this.protector.scheme, Buffer.from(payload), recordType, accountId, recordId)
    if (Number(result.changes) !== 1) {
      throw new EncryptedCacheError(
        'CACHE_STORAGE_FAILED',
        'The encrypted provider-mail record changed during commit.'
      )
    }
  }

  private deleteStoredRecord(
    recordType: ProviderMailRecordType,
    rowId: string,
    accountId: string
  ): void {
    const result = this.database.prepare(`
      DELETE FROM encrypted_provider_mail_records
      WHERE record_type = ? AND account_scope = ? AND record_id = ?
    `).run(recordType, accountId, rowId)
    if (Number(result.changes) !== 1) {
      throw new EncryptedCacheError(
        'CACHE_STORAGE_FAILED',
        'The encrypted provider-mail record changed during retention.'
      )
    }
  }
}
