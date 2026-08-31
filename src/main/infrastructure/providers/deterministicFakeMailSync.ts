import { isDeepStrictEqual } from 'node:util'
import {
  MailSyncError,
  ProviderMailAdapterError,
  isProviderMailBatchRequestV1,
  type CommitProviderMailBatchResultV1,
  type CommitProviderMailBatchV1,
  type MailSyncCheckpointV1,
  type MailSyncProjection,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV1
} from '../../application/mailSync'
import type { SyncFailureCode } from '../../application/accountState'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../../shared/providerMail'

export interface DeterministicMailBatchFixture {
  accountId: string
  requestCursor?: string
  batch: ProviderMailBatchV1
}

const requestKey = (accountId: string, cursor: string | undefined): string =>
  `${accountId}\u0000${cursor ?? '<initial>'}`

/** Credential-free provider fake. Never compose this class into production startup. */
export class DeterministicFakeMailProviderAdapter implements ProviderMailAdapter {
  readonly requests: ProviderMailBatchRequestV1[] = []
  private readonly batches = new Map<string, ProviderMailBatchV1>()
  private readonly failures = new Map<string, SyncFailureCode>()

  constructor(fixtures: readonly DeterministicMailBatchFixture[]) {
    for (const fixture of fixtures) {
      this.batches.set(
        requestKey(fixture.accountId, fixture.requestCursor),
        structuredClone(fixture.batch)
      )
    }
  }

  failNext(accountId: string, code: SyncFailureCode): void {
    this.failures.set(accountId, code)
  }

  async fetchBatch(
    request: ProviderMailBatchRequestV1,
    signal: AbortSignal
  ): Promise<unknown> {
    if (!isProviderMailBatchRequestV1(request)) {
      throw new ProviderMailAdapterError(
        'MALFORMED_PAYLOAD',
        'The deterministic provider request is invalid.',
        false
      )
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    this.requests.push(structuredClone(request))
    const failure = this.failures.get(request.accountId)
    if (failure !== undefined) {
      this.failures.delete(request.accountId)
      throw new ProviderMailAdapterError(
        failure,
        `Deterministic provider failure: ${failure}.`,
        failure !== 'AUTHENTICATION_EXPIRED' && failure !== 'PERMISSION_REVOKED' &&
          failure !== 'MALFORMED_PAYLOAD'
      )
    }
    const batch = this.batches.get(requestKey(request.accountId, request.cursor))
    if (batch === undefined) {
      throw new ProviderMailAdapterError(
        request.cursor === undefined ? 'PROVIDER_UNAVAILABLE' : 'INVALID_CURSOR',
        'The deterministic provider page is unavailable.',
        true
      )
    }
    return structuredClone(batch)
  }
}

interface ProjectionAccountState {
  checkpoint?: MailSyncCheckpointV1
  messages: Map<string, ProviderMailMessageV1>
  threads: Map<string, ProviderMailThreadV1>
}

export interface DeterministicProjectionSnapshot {
  checkpoint?: MailSyncCheckpointV1
  messages: ProviderMailMessageV1[]
  threads: ProviderMailThreadV1[]
}

/** Deterministic atomic projection fake for coordinator and failure-path tests. */
export class DeterministicFakeMailSyncProjection implements MailSyncProjection {
  readonly commits: CommitProviderMailBatchV1[] = []
  private readonly accounts = new Map<string, ProjectionAccountState>()
  private failCommit = false

  seed(snapshot: DeterministicProjectionSnapshot): void {
    const accountId = snapshot.checkpoint?.accountId ??
      snapshot.messages[0]?.accountId ?? snapshot.threads[0]?.accountId
    if (accountId === undefined) throw new Error('A deterministic account scope is required.')
    this.accounts.set(accountId, {
      ...(snapshot.checkpoint === undefined
        ? {}
        : { checkpoint: structuredClone(snapshot.checkpoint) }),
      messages: new Map(snapshot.messages.map((message) => [
        message.source.providerMessageId,
        structuredClone(message)
      ])),
      threads: new Map(snapshot.threads.map((thread) => [
        thread.providerThreadId,
        structuredClone(thread)
      ]))
    })
  }

  failNextCommit(): void {
    this.failCommit = true
  }

  async loadCheckpoint(accountId: string): Promise<MailSyncCheckpointV1 | undefined> {
    const checkpoint = this.accounts.get(accountId)?.checkpoint
    return checkpoint === undefined ? undefined : structuredClone(checkpoint)
  }

  async commitBatch(
    batch: CommitProviderMailBatchV1
  ): Promise<CommitProviderMailBatchResultV1> {
    if (this.failCommit) {
      this.failCommit = false
      throw new Error('Deterministic commit failure.')
    }
    const current = this.accounts.get(batch.accountId) ?? {
      messages: new Map<string, ProviderMailMessageV1>(),
      threads: new Map<string, ProviderMailThreadV1>()
    }
    if (current.checkpoint?.cursor !== batch.expectedCursor) {
      throw new MailSyncError(
        'SYNC_CHECKPOINT_CONFLICT',
        'The mail sync checkpoint changed before commit.',
        true
      )
    }
    if (batch.messages.some((message) => message.accountId !== batch.accountId) ||
        batch.threads.some((thread) => thread.accountId !== batch.accountId)) {
      throw new MailSyncError('MALFORMED_PAYLOAD', 'The batch account scope is invalid.', false)
    }

    const messages = new Map(current.messages)
    const threads = new Map(current.threads)
    let insertedMessages = 0
    let updatedMessages = 0
    let replayedMessages = 0
    for (const message of batch.messages) {
      const key = message.source.providerMessageId
      const existing = messages.get(key)
      if (existing === undefined) insertedMessages += 1
      else if (isDeepStrictEqual(existing, message)) replayedMessages += 1
      else updatedMessages += 1
      messages.set(key, structuredClone(message))
    }
    for (const thread of batch.threads) {
      threads.set(thread.providerThreadId, structuredClone(thread))
    }

    const checkpoint: MailSyncCheckpointV1 = {
      version: 1,
      accountId: batch.accountId,
      provider: batch.provider,
      cursor: batch.nextCursor
    }
    this.accounts.set(batch.accountId, { checkpoint, messages, threads })
    this.commits.push(structuredClone(batch))
    return {
      version: 1,
      accountId: batch.accountId,
      nextCursor: batch.nextCursor,
      insertedMessages,
      updatedMessages,
      replayedMessages
    }
  }

  snapshot(accountId: string): DeterministicProjectionSnapshot {
    const state = this.accounts.get(accountId)
    if (state === undefined) return { messages: [], threads: [] }
    return {
      ...(state.checkpoint === undefined
        ? {}
        : { checkpoint: structuredClone(state.checkpoint) }),
      messages: [...state.messages.values()].map((message) => structuredClone(message)),
      threads: [...state.threads.values()].map((thread) => structuredClone(thread))
    }
  }
}
