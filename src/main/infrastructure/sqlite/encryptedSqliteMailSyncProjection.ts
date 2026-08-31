import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  isAccountId,
  type ProviderSyncStateV1
} from '../../application/accountState.ts'
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
  isProviderMailMessageV1,
  isProviderMailThreadV1,
  type ProviderMailMessageV1,
  type ProviderMailThreadV1
} from '../../../shared/providerMail.ts'
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
export class EncryptedSqliteMailSyncProjection implements MailSyncProjection {
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
}
