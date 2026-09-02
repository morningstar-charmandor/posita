import { Worker } from 'node:worker_threads'
import { isAccountId } from '../../application/accountState'
import {
  MailSyncError,
  isCommitProviderMailBatchV2,
  type CommitProviderMailBatchResultV1,
  type CommitProviderMailBatchV2,
  type MailSyncCheckpointV1,
  type MailSyncProjection
} from '../../application/mailSync'
import type { ProviderMailAccountDataRemover } from '../../application/disconnectAccount'
import type { ProviderMailReadModelSource } from '../../application/providerMailReadModel'
import type { ProviderMailSourceDetailSource } from '../../application/providerMailSourceDetail'
import type {
  ProviderMailOriginalSourceLocatorResultV1,
  ProviderMailOriginalSourceLocatorSource
} from '../../application/providerMailOriginalSource'
import type { LiveMailSnapshotV2 } from '../../../shared/liveMail'
import {
  isLiveMailMessageDetailRequestV1,
  type LiveMailMessageDetailRequestV1,
  type LiveMailMessageDetailResultV1
} from '../../../shared/liveMailDetail'
import {
  isMailSyncProjectionWorkerResponseV1,
  type MailSyncProjectionWorkerOperationV1,
  type MailSyncProjectionWorkerResponseV1,
  type MailSyncProjectionWorkerSuccessV1
} from './mailSyncProjectionWorkerProtocol'

const MAX_PENDING_OPERATIONS = 2

const defaultWorkerUrl = (): URL => new URL(
  import.meta.url.endsWith('.ts')
    ? './mailSyncProjectionWorker.ts'
    : './mailSyncProjectionWorker.js',
  import.meta.url
)

const unavailable = (): MailSyncError => new MailSyncError(
  'SYNC_STORAGE_FAILED',
  'The encrypted mail projection could not be updated.',
  true
)

const invalidRequest = (): MailSyncError => new MailSyncError(
  'INVALID_SYNC_REQUEST',
  'The mail synchronization request is invalid.',
  false
)

/** Serializes file-backed projection work outside Electron's main event loop. */
export class WorkerThreadMailSyncProjection implements
  MailSyncProjection, ProviderMailAccountDataRemover, ProviderMailReadModelSource,
  ProviderMailSourceDetailSource, ProviderMailOriginalSourceLocatorSource {
  private readonly key: Buffer
  private tail: Promise<void> = Promise.resolve()
  private pending = 0
  private destroyed = false

  constructor(
    private readonly databasePath: string,
    key: Uint8Array,
    private readonly workerUrl = defaultWorkerUrl()
  ) {
    if (databasePath.length === 0 || databasePath.length > 4096 || databasePath === ':memory:' ||
        key.byteLength !== 32) throw unavailable()
    this.key = Buffer.from(key)
  }

  async loadCheckpoint(accountId: string): Promise<MailSyncCheckpointV1 | undefined> {
    if (!isAccountId(accountId)) throw invalidRequest()
    const response = await this.enqueue({ kind: 'load-checkpoint', accountId })
    if (response.operation !== 'load-checkpoint') throw unavailable()
    if (response.checkpoint !== undefined && response.checkpoint.accountId !== accountId) {
      throw unavailable()
    }
    return response.checkpoint
  }

  async loadReadModel(loadedAt: string): Promise<LiveMailSnapshotV2> {
    if (loadedAt.length > 64 || !Number.isFinite(Date.parse(loadedAt))) throw invalidRequest()
    const response = await this.enqueue({ kind: 'load-read-model', loadedAt })
    if (response.operation !== 'load-read-model' || response.snapshot.loadedAt !== loadedAt) {
      throw unavailable()
    }
    return response.snapshot
  }

  async loadMessageDetail(
    request: LiveMailMessageDetailRequestV1
  ): Promise<LiveMailMessageDetailResultV1> {
    if (!isLiveMailMessageDetailRequestV1(request)) throw invalidRequest()
    const response = await this.enqueue({
      kind: 'load-message-detail',
      request: structuredClone(request)
    })
    if (response.operation !== 'load-message-detail') throw unavailable()
    const result = response.result
    const accountId = result.status === 'found' ? result.detail.accountId : result.accountId
    const messageId = result.status === 'found' ? result.detail.messageId : result.messageId
    if (accountId !== request.accountId || messageId !== request.messageId) throw unavailable()
    return result
  }

  async loadOriginalSourceLocator(
    request: LiveMailMessageDetailRequestV1
  ): Promise<ProviderMailOriginalSourceLocatorResultV1> {
    if (!isLiveMailMessageDetailRequestV1(request)) throw invalidRequest()
    const response = await this.enqueue({
      kind: 'load-original-source-locator',
      request: structuredClone(request)
    })
    if (response.operation !== 'load-original-source-locator') throw unavailable()
    const result = response.result
    if (result.accountId !== request.accountId || result.messageId !== request.messageId) {
      throw unavailable()
    }
    return result
  }

  async commitBatch(
    batch: CommitProviderMailBatchV2
  ): Promise<CommitProviderMailBatchResultV1> {
    if (!isCommitProviderMailBatchV2(batch)) throw invalidRequest()
    const response = await this.enqueue({ kind: 'commit-batch', batch: structuredClone(batch) })
    if (response.operation !== 'commit-batch') throw unavailable()
    if (response.result.accountId !== batch.accountId ||
        response.result.nextCursor !== batch.nextCursor) throw unavailable()
    return response.result
  }

  async deleteAccountRecords(accountId: string): Promise<boolean> {
    if (!isAccountId(accountId)) throw invalidRequest()
    const response = await this.enqueue({ kind: 'delete-account-records', accountId })
    if (response.operation !== 'delete-account-records' || response.accountId !== accountId) {
      throw unavailable()
    }
    return response.changed
  }

  destroyEncryptionContext(): void {
    if (this.pending > 0) throw unavailable()
    this.key.fill(0)
    this.destroyed = true
  }

  async shutdown(): Promise<void> {
    this.destroyed = true
    await this.tail
    this.key.fill(0)
  }

  private enqueue(
    operation: MailSyncProjectionWorkerOperationV1
  ): Promise<MailSyncProjectionWorkerSuccessV1> {
    if (this.destroyed || this.pending >= MAX_PENDING_OPERATIONS) {
      return Promise.reject(unavailable())
    }
    this.pending += 1
    const run = this.tail.then(() => this.execute(operation))
    this.tail = run.then(() => undefined, () => undefined)
    return run.finally(() => { this.pending -= 1 })
  }

  private execute(
    operation: MailSyncProjectionWorkerOperationV1
  ): Promise<MailSyncProjectionWorkerSuccessV1> {
    return new Promise((resolve, reject) => {
      const workerKey = Uint8Array.from(this.key)
      let worker: Worker
      try {
        worker = new Worker(this.workerUrl, {
          name: 'posita-mail-sync-projection',
          ...(this.workerUrl.protocol === 'file:' && this.workerUrl.pathname.endsWith('.ts')
            ? {
              execArgv: [
                '--no-warnings', '--experimental-strip-types', '--experimental-transform-types'
              ]
            }
            : {}),
          workerData: {
            version: 1,
            databasePath: this.databasePath,
            key: workerKey,
            operation
          },
          transferList: [workerKey.buffer as ArrayBuffer]
        })
      } catch {
        workerKey.fill(0)
        reject(unavailable())
        return
      }

      let response: MailSyncProjectionWorkerResponseV1 | undefined
      let settled = false
      const fail = (): void => {
        if (settled) return
        settled = true
        reject(unavailable())
      }
      worker.once('message', (message: unknown) => {
        if (!isMailSyncProjectionWorkerResponseV1(message)) {
          fail()
          return
        }
        response = message
      })
      worker.once('error', fail)
      worker.once('exit', (code) => {
        if (settled) return
        settled = true
        if (code !== 0 || response === undefined) {
          reject(unavailable())
          return
        }
        if (!response.ok) {
          if (response.code === 'SYNC_CHECKPOINT_CONFLICT') {
            reject(new MailSyncError(
              'SYNC_CHECKPOINT_CONFLICT',
              'The mail sync checkpoint changed before commit.',
              true
            ))
            return
          }
          reject(response.code === 'INVALID_REQUEST' ? invalidRequest() : unavailable())
          return
        }
        resolve(response)
      })
    })
  }
}
