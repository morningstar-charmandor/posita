import { describe, expect, it } from 'vitest'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../shared/providerMail'
import {
  MailSyncError,
  type ProviderMailAdapter,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV1
} from './mailSync'
import { MailSyncCoordinator } from './mailSyncCoordinator'
import {
  DeterministicFakeMailProviderAdapter,
  DeterministicFakeMailSyncProjection
} from '../infrastructure/providers/deterministicFakeMailSync'

const clock = { now: (): Date => new Date('2026-08-31T12:00:00.000Z') }

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
    subject: `Deterministic message ${suffix}`,
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

const batch = (
  accountId = 'account-work-1',
  suffix = '1',
  nextCursor = `cursor-${suffix}`,
  complete = true
): ProviderMailBatchV1 => {
  const record = source(accountId, suffix)
  return {
    version: 1,
    accountId,
    provider: 'google',
    messages: [record.message],
    threads: [record.thread],
    nextCursor,
    complete
  }
}

const request = (accountId = 'account-work-1') => ({
  version: 1 as const,
  accountId,
  provider: 'google' as const
})

describe('MailSyncCoordinator', () => {
  it('runs a bounded 90-day initial import and atomically advances its cursor', async () => {
    const provider = new DeterministicFakeMailProviderAdapter([{
      accountId: 'account-work-1',
      batch: batch()
    }])
    const projection = new DeterministicFakeMailSyncProjection()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await expect(coordinator.syncAccount(request())).resolves.toEqual({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      mode: 'initial',
      batchesCommitted: 1,
      insertedMessages: 1,
      updatedMessages: 0,
      replayedMessages: 0,
      cursor: 'cursor-1'
    })
    expect(provider.requests).toEqual([{
      version: 1,
      accountId: 'account-work-1',
      provider: 'google',
      limit: 100,
      receivedAfter: '2026-06-02T12:00:00.000Z'
    }])
    expect(projection.snapshot('account-work-1')).toMatchObject({
      checkpoint: { cursor: 'cursor-1' },
      messages: [{ source: { providerMessageId: 'provider-message-1' } }]
    })
  })

  it('shares one in-flight account sync and keeps different account scopes separate', async () => {
    const provider = new DeterministicFakeMailProviderAdapter([
      { accountId: 'account-work-1', batch: batch('account-work-1', 'work') },
      { accountId: 'account-personal-1', batch: batch('account-personal-1', 'personal') }
    ])
    const projection = new DeterministicFakeMailSyncProjection()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    const first = coordinator.syncAccount(request('account-work-1'))
    const duplicate = coordinator.syncAccount(request('account-work-1'))
    const other = coordinator.syncAccount(request('account-personal-1'))
    expect(duplicate).toBe(first)
    await Promise.all([first, duplicate, other])

    expect(provider.requests.filter((item) => item.accountId === 'account-work-1')).toHaveLength(1)
    expect(projection.snapshot('account-work-1').messages).toHaveLength(1)
    expect(projection.snapshot('account-personal-1').messages).toHaveLength(1)
    expect(projection.snapshot('account-work-1').messages[0]?.accountId).toBe('account-work-1')
    expect(projection.snapshot('account-personal-1').messages[0]?.accountId)
      .toBe('account-personal-1')
  })

  it('bounds cross-account provider work without creating another sync owner', async () => {
    const started: string[] = []
    let releaseWork: (() => void) | undefined
    class ControlledProvider implements ProviderMailAdapter {
      async fetchBatch(requestValue: ProviderMailBatchRequestV1): Promise<unknown> {
        started.push(requestValue.accountId)
        if (requestValue.accountId === 'account-work-1') {
          await new Promise<void>((resolve) => { releaseWork = resolve })
          return batch('account-work-1', 'work')
        }
        return batch('account-personal-1', 'personal')
      }
    }
    const coordinator = new MailSyncCoordinator(
      new ControlledProvider(),
      new DeterministicFakeMailSyncProjection(),
      clock,
      1
    )

    const work = coordinator.syncAccount(request('account-work-1'))
    const personal = coordinator.syncAccount(request('account-personal-1'))
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['account-work-1'])
    releaseWork?.()
    await work
    await personal
    expect(started).toEqual(['account-work-1', 'account-personal-1'])
  })

  it('deduplicates replay by account-scoped provider message identity', async () => {
    const firstBatch = batch()
    const replayBatch = { ...structuredClone(firstBatch), nextCursor: 'cursor-2' }
    const provider = new DeterministicFakeMailProviderAdapter([
      { accountId: 'account-work-1', batch: firstBatch },
      { accountId: 'account-work-1', requestCursor: 'cursor-1', batch: replayBatch }
    ])
    const projection = new DeterministicFakeMailSyncProjection()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await coordinator.syncAccount(request())
    await expect(coordinator.syncAccount(request())).resolves.toMatchObject({
      mode: 'incremental',
      insertedMessages: 0,
      updatedMessages: 0,
      replayedMessages: 1,
      cursor: 'cursor-2'
    })
    expect(projection.snapshot('account-work-1').messages).toHaveLength(1)
  })

  it('uses one bounded resync after an invalid cursor without erasing retained sources', async () => {
    const retained = source('account-work-1', 'retained')
    const provider = new DeterministicFakeMailProviderAdapter([{
      accountId: 'account-work-1',
      batch: batch('account-work-1', 'resynced', 'cursor-recovered')
    }])
    provider.failNext('account-work-1', 'INVALID_CURSOR')
    const projection = new DeterministicFakeMailSyncProjection()
    projection.seed({
      checkpoint: {
        version: 1,
        accountId: 'account-work-1',
        provider: 'google',
        cursor: 'cursor-stale'
      },
      messages: [retained.message],
      threads: [retained.thread]
    })
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await expect(coordinator.syncAccount(request())).resolves.toMatchObject({
      mode: 'bounded-resync',
      cursor: 'cursor-recovered'
    })
    expect(provider.requests.map((item) => item.cursor ?? item.receivedAfter)).toEqual([
      'cursor-stale',
      '2026-06-02T12:00:00.000Z'
    ])
    expect(projection.commits[0]).toMatchObject({
      expectedCursor: 'cursor-stale',
      reconciliation: 'bounded-resync'
    })
    expect(projection.snapshot('account-work-1').messages.map((item) =>
      item.source.providerMessageId)).toEqual([
      'provider-message-retained',
      'provider-message-resynced'
    ])
  })

  it('does not advance records or cursor when the atomic projection commit fails', async () => {
    const provider = new DeterministicFakeMailProviderAdapter([{
      accountId: 'account-work-1',
      batch: batch()
    }])
    const projection = new DeterministicFakeMailSyncProjection()
    projection.failNextCommit()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await expect(coordinator.syncAccount(request())).rejects.toMatchObject({
      code: 'SYNC_STORAGE_FAILED',
      retryable: true
    })
    expect(projection.snapshot('account-work-1')).toEqual({ messages: [], threads: [] })
    expect(projection.commits).toHaveLength(0)
  })

  it('rejects malformed or cross-account provider output before persistence', async () => {
    const provider = new DeterministicFakeMailProviderAdapter([{
      accountId: 'account-work-1',
      batch: { ...batch('account-other-1'), accountId: 'account-work-1' }
    }])
    const projection = new DeterministicFakeMailSyncProjection()
    const coordinator = new MailSyncCoordinator(provider, projection, clock)

    await expect(coordinator.syncAccount(request())).rejects.toMatchObject({
      code: 'MALFORMED_PAYLOAD',
      retryable: false
    })
    expect(projection.commits).toHaveLength(0)
  })

  it('preserves typed provider failures without exposing provider payloads', async () => {
    const provider = new DeterministicFakeMailProviderAdapter([])
    provider.failNext('account-work-1', 'OFFLINE')
    const coordinator = new MailSyncCoordinator(
      provider,
      new DeterministicFakeMailSyncProjection(),
      clock
    )

    await expect(coordinator.syncAccount(request())).rejects.toMatchObject({
      code: 'OFFLINE',
      retryable: true
    })
  })

  it('cancels active work for disconnect or shutdown boundaries', async () => {
    class BlockingProvider implements ProviderMailAdapter {
      fetchBatch(_request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true })
        })
      }
    }
    const coordinator = new MailSyncCoordinator(
      new BlockingProvider(),
      new DeterministicFakeMailSyncProjection(),
      clock
    )
    const running = coordinator.syncAccount(request())
    await Promise.resolve()
    expect(coordinator.cancelAccount('account-work-1')).toBe(true)
    await expect(running).rejects.toMatchObject({ code: 'SYNC_CANCELLED' })

    const second = coordinator.syncAccount(request('account-personal-1'))
    await Promise.resolve()
    await coordinator.shutdown()
    await expect(second).rejects.toBeInstanceOf(MailSyncError)
    await expect(coordinator.syncAccount(request())).rejects.toMatchObject({
      code: 'SYNC_CANCELLED'
    })
  })

  it('globally suspends new sync until the lifecycle owner resumes it', async () => {
    class BlockingProvider implements ProviderMailAdapter {
      fetchBatch(_request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true })
        })
      }
    }
    const coordinator = new MailSyncCoordinator(
      new BlockingProvider(),
      new DeterministicFakeMailSyncProjection(),
      clock
    )
    const running = coordinator.syncAccount(request())
    await Promise.resolve()

    await coordinator.suspend()
    await expect(running).rejects.toMatchObject({ code: 'SYNC_CANCELLED' })
    await expect(coordinator.syncAccount(request())).rejects.toMatchObject({
      code: 'SYNC_CANCELLED'
    })

    coordinator.resume()
    const resumable = coordinator.syncAccount(request())
    await Promise.resolve()
    await coordinator.suspend()
    await expect(resumable).rejects.toMatchObject({ code: 'SYNC_CANCELLED' })
  })

  it('cancels superseded account work before starting its replacement', async () => {
    class SupersedingProvider implements ProviderMailAdapter {
      calls = 0
      readonly started: Promise<void>
      private markStarted!: () => void

      constructor() {
        this.started = new Promise((resolve) => { this.markStarted = resolve })
      }

      fetchBatch(_request: ProviderMailBatchRequestV1, signal: AbortSignal): Promise<unknown> {
        this.calls += 1
        if (this.calls > 1) return Promise.resolve(batch())
        this.markStarted()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true })
        })
      }
    }
    const provider = new SupersedingProvider()
    const coordinator = new MailSyncCoordinator(
      provider,
      new DeterministicFakeMailSyncProjection(),
      clock
    )
    const original = coordinator.syncAccount(request())
    await provider.started
    const replacement = coordinator.supersedeAccount(request())

    await expect(original).rejects.toMatchObject({ code: 'SYNC_CANCELLED' })
    await expect(replacement).resolves.toMatchObject({ batchesCommitted: 1 })
    expect(provider.calls).toBe(2)
  })
})
