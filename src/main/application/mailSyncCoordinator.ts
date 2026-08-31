import { isAccountId } from './accountState'
import {
  INITIAL_SYNC_DAYS,
  MAX_BATCHES_PER_SYNC,
  MailSyncError,
  ProviderMailAdapterError,
  SYNC_BATCH_SIZE,
  isCommitProviderMailBatchResultV1,
  isMailSyncCheckpointV1,
  isProviderMailBatchRequestV1,
  isProviderMailBatchV1,
  isSyncAccountRequestV1,
  type CommitProviderMailBatchResultV1,
  type MailSyncCheckpointV1,
  type MailSyncProjection,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type SyncAccountRequestV1,
  type SyncAccountResultV1
} from './mailSync'

const DAY_MS = 24 * 60 * 60 * 1000

const invalidRequest = (): MailSyncError => new MailSyncError(
  'INVALID_SYNC_REQUEST',
  'The mail synchronization request is invalid.',
  false
)

const cancelled = (): MailSyncError => new MailSyncError(
  'SYNC_CANCELLED',
  'Mail synchronization was cancelled.',
  true
)

interface WaitingSlot {
  signal: AbortSignal
  resolve: () => void
  reject: (error: MailSyncError) => void
  onAbort: () => void
}

class BoundedConcurrencyGate {
  private active = 0
  private readonly waiting: WaitingSlot[] = []

  constructor(private readonly limit: number) {}

  async enter(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw cancelled()
    if (this.active < this.limit) {
      this.active += 1
      return this.releaseOnce()
    }
    await new Promise<void>((resolve, reject) => {
      const slot: WaitingSlot = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = this.waiting.indexOf(slot)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(cancelled())
        }
      }
      signal.addEventListener('abort', slot.onAbort, { once: true })
      this.waiting.push(slot)
    })
    if (signal.aborted) throw cancelled()
    return this.releaseOnce()
  }

  private releaseOnce(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next !== undefined) {
        next.signal.removeEventListener('abort', next.onAbort)
        next.resolve()
        return
      }
      this.active -= 1
    }
  }
}

interface ActiveSync {
  controller: AbortController
  promise: Promise<SyncAccountResultV1>
}

/**
 * The single application-owned provider I/O coordinator. It is deliberately not
 * composed into Electron startup, IPC, or UI in this credential-free milestone.
 */
export class MailSyncCoordinator {
  private readonly active = new Map<string, ActiveSync>()
  private readonly concurrency: BoundedConcurrencyGate
  private shuttingDown = false

  constructor(
    private readonly provider: ProviderMailAdapter,
    private readonly projection: MailSyncProjection,
    private readonly clock: { now(): Date },
    maximumConcurrentAccounts = 2
  ) {
    if (!Number.isSafeInteger(maximumConcurrentAccounts) ||
        maximumConcurrentAccounts < 1 || maximumConcurrentAccounts > 8) throw invalidRequest()
    this.concurrency = new BoundedConcurrencyGate(maximumConcurrentAccounts)
  }

  syncAccount(request: SyncAccountRequestV1): Promise<SyncAccountResultV1> {
    if (!isSyncAccountRequestV1(request)) return Promise.reject(invalidRequest())
    if (this.shuttingDown) return Promise.reject(cancelled())
    const existing = this.active.get(request.accountId)
    if (existing !== undefined) return existing.promise

    const controller = new AbortController()
    const promise = this.run(request, controller.signal).finally(() => {
      if (this.active.get(request.accountId)?.promise === promise) {
        this.active.delete(request.accountId)
      }
    })
    this.active.set(request.accountId, { controller, promise })
    return promise
  }

  async supersedeAccount(request: SyncAccountRequestV1): Promise<SyncAccountResultV1> {
    if (!isSyncAccountRequestV1(request)) throw invalidRequest()
    const current = this.active.get(request.accountId)
    if (current !== undefined) {
      current.controller.abort()
      await Promise.allSettled([current.promise])
    }
    return this.syncAccount(request)
  }

  cancelAccount(accountId: string): boolean {
    if (!isAccountId(accountId)) return false
    const active = this.active.get(accountId)
    if (active === undefined) return false
    active.controller.abort()
    return true
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    const active = [...this.active.values()]
    for (const sync of active) sync.controller.abort()
    await Promise.allSettled(active.map((sync) => sync.promise))
  }

  private async run(
    request: SyncAccountRequestV1,
    signal: AbortSignal
  ): Promise<SyncAccountResultV1> {
    const release = await this.concurrency.enter(signal)
    try {
      return await this.runWithSlot(request, signal)
    } finally {
      release()
    }
  }

  private async runWithSlot(
    request: SyncAccountRequestV1,
    signal: AbortSignal
  ): Promise<SyncAccountResultV1> {
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime())) throw invalidRequest()

    let checkpoint: MailSyncCheckpointV1 | undefined
    try {
      checkpoint = await this.projection.loadCheckpoint(request.accountId)
    } catch (error) {
      throw this.storageFailure(error)
    }
    if (checkpoint !== undefined && (!isMailSyncCheckpointV1(checkpoint) ||
        checkpoint.accountId !== request.accountId || checkpoint.provider !== request.provider)) {
      throw this.storageFailure()
    }

    let expectedCursor = checkpoint?.cursor
    let providerCursor = checkpoint?.cursor
    let receivedAfter = checkpoint === undefined
      ? new Date(now.getTime() - INITIAL_SYNC_DAYS * DAY_MS).toISOString()
      : undefined
    let mode: SyncAccountResultV1['mode'] = checkpoint === undefined ? 'initial' : 'incremental'
    let usedCursorRecovery = false
    let batchesCommitted = 0
    let totals = { insertedMessages: 0, updatedMessages: 0, replayedMessages: 0 }

    for (let index = 0; index < MAX_BATCHES_PER_SYNC; index += 1) {
      if (signal.aborted) throw cancelled()
      const batchRequest: ProviderMailBatchRequestV1 = {
        version: 1,
        accountId: request.accountId,
        provider: request.provider,
        limit: SYNC_BATCH_SIZE,
        ...(providerCursor === undefined ? { receivedAfter } : { cursor: providerCursor })
      }
      if (!isProviderMailBatchRequestV1(batchRequest)) throw invalidRequest()

      let unknownBatch: unknown
      try {
        unknownBatch = await this.provider.fetchBatch(batchRequest, signal)
      } catch (error) {
        if (signal.aborted) throw cancelled()
        if (error instanceof ProviderMailAdapterError && error.code === 'INVALID_CURSOR' &&
            providerCursor !== undefined && !usedCursorRecovery) {
          providerCursor = undefined
          receivedAfter = new Date(now.getTime() - INITIAL_SYNC_DAYS * DAY_MS).toISOString()
          mode = 'bounded-resync'
          usedCursorRecovery = true
          continue
        }
        throw this.providerFailure(error)
      }
      if (!isProviderMailBatchV1(unknownBatch) ||
          unknownBatch.accountId !== request.accountId ||
          unknownBatch.provider !== request.provider ||
          (!unknownBatch.complete && unknownBatch.nextCursor === providerCursor)) {
        throw new MailSyncError(
          'MALFORMED_PAYLOAD',
          'The mail provider returned an invalid normalized batch.',
          false
        )
      }

      let committed: CommitProviderMailBatchResultV1
      try {
        committed = await this.projection.commitBatch({
          version: 1,
          accountId: request.accountId,
          provider: request.provider,
          ...(expectedCursor === undefined ? {} : { expectedCursor }),
          nextCursor: unknownBatch.nextCursor,
          reconciliation: mode === 'bounded-resync' ? 'bounded-resync' : 'incremental',
          messages: unknownBatch.messages,
          threads: unknownBatch.threads
        })
      } catch (error) {
        if (error instanceof MailSyncError) throw error
        throw this.storageFailure(error)
      }
      if (!isCommitProviderMailBatchResultV1(committed) ||
          committed.accountId !== request.accountId ||
          committed.nextCursor !== unknownBatch.nextCursor) throw this.storageFailure()
      totals = {
        insertedMessages: totals.insertedMessages + committed.insertedMessages,
        updatedMessages: totals.updatedMessages + committed.updatedMessages,
        replayedMessages: totals.replayedMessages + committed.replayedMessages
      }
      batchesCommitted += 1
      expectedCursor = unknownBatch.nextCursor
      providerCursor = unknownBatch.nextCursor
      if (unknownBatch.complete) {
        return {
          version: 1,
          accountId: request.accountId,
          provider: request.provider,
          mode,
          batchesCommitted,
          ...totals,
          cursor: unknownBatch.nextCursor
        }
      }
    }
    throw new MailSyncError(
      'SYNC_BATCH_LIMIT_REACHED',
      'Mail synchronization reached its safe batch limit.',
      true
    )
  }

  private providerFailure(error: unknown): MailSyncError {
    if (error instanceof ProviderMailAdapterError) {
      return new MailSyncError(error.code, error.message, error.retryable, { cause: error })
    }
    return new MailSyncError(
      'PROVIDER_UNAVAILABLE',
      'The mail provider is temporarily unavailable.',
      true,
      { cause: error }
    )
  }

  private storageFailure(error?: unknown): MailSyncError {
    return new MailSyncError(
      'SYNC_STORAGE_FAILED',
      'The encrypted mail projection could not be updated.',
      true,
      { cause: error }
    )
  }
}
