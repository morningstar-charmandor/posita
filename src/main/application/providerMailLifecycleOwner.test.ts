import { describe, expect, it } from 'vitest'
import type { DisconnectAccountRequestV1 } from './disconnectAccount'
import type {
  ActivateLiveMailModeRequestV1,
  ActivateLiveMailModeResultV1,
  MailDataModeStateV1
} from './mailDataMode'
import { MailSyncError, type SyncAccountRequestV1, type SyncAccountResultV1 } from './mailSync'
import {
  ProviderMailLifecycleOwner,
  type ProviderMailDisconnectLifecycle,
  type ProviderMailProjectionKeyLifecycle,
  type ProviderMailRetentionLifecycle,
  type ProviderMailSyncLifecycle,
  type ProviderMailSyncStatusLifecycle
} from './providerMailLifecycleOwner'

const request = (accountId = 'work'): SyncAccountRequestV1 => ({
  version: 1,
  accountId,
  provider: 'google'
})

const result = (accountId: string): SyncAccountResultV1 => ({
  version: 1,
  accountId,
  provider: 'google',
  mode: 'initial',
  batchesCommitted: 1,
  insertedMessages: 1,
  updatedMessages: 0,
  replayedMessages: 0,
  cursor: `cursor-${accountId}`
})

class FakeSync implements ProviderMailSyncLifecycle {
  readonly behavior = new Map<string, 'success' | 'offline' | 'blocked'>()
  private readonly blocked = new Map<string, {
    promise: Promise<SyncAccountResultV1>
    reject: (error: MailSyncError) => void
  }>()

  constructor(private readonly events: string[]) {}

  syncAccount(syncRequest: SyncAccountRequestV1): Promise<SyncAccountResultV1> {
    this.events.push(`sync:start:${syncRequest.accountId}`)
    const behavior = this.behavior.get(syncRequest.accountId) ?? 'success'
    if (behavior === 'offline') {
      return Promise.reject(new MailSyncError('OFFLINE', 'Test-only offline.', true))
    }
    if (behavior === 'blocked') {
      let reject!: (error: MailSyncError) => void
      const promise = new Promise<SyncAccountResultV1>((_resolve, rejectPromise) => {
        reject = rejectPromise
      }).finally(() => {
        this.blocked.delete(syncRequest.accountId)
        this.events.push(`sync:settled:${syncRequest.accountId}`)
      })
      this.blocked.set(syncRequest.accountId, { promise, reject })
      return promise
    }
    this.events.push(`sync:settled:${syncRequest.accountId}`)
    return Promise.resolve(result(syncRequest.accountId))
  }

  cancelAccount(accountId: string): boolean {
    const active = this.blocked.get(accountId)
    if (active === undefined) return false
    active.reject(new MailSyncError('SYNC_CANCELLED', 'Test-only cancellation.', true))
    return true
  }

  async suspend(): Promise<void> {
    this.events.push('sync:suspend')
    const active = [...this.blocked.values()]
    for (const item of active) {
      item.reject(new MailSyncError('SYNC_CANCELLED', 'Test-only cancellation.', true))
    }
    await Promise.allSettled(active.map((item) => item.promise))
  }

  resume(): void { this.events.push('sync:resume') }

  async shutdown(): Promise<void> { this.events.push('sync:shutdown') }
}

class FakeMailMode {
  state: MailDataModeStateV1

  constructor(private readonly events: string[], mode: MailDataModeStateV1['mode']) {
    this.state = { version: 1, mode }
  }

  load(): MailDataModeStateV1 {
    this.events.push('mode:load')
    return this.state
  }

  async activateLive(
    activateRequest: ActivateLiveMailModeRequestV1
  ): Promise<ActivateLiveMailModeResultV1> {
    this.events.push(`mode:activate:${activateRequest.accountId}`)
    const changed = this.state.mode === 'sample'
    this.state = { version: 1, mode: 'live' }
    return { version: 1, mode: 'live', changed }
  }
}

class FakeRetention implements ProviderMailRetentionLifecycle {
  constructor(private readonly events: string[]) {}
  start(): void { this.events.push('retention:start') }
  async suspend(): Promise<void> { this.events.push('retention:suspend') }
  resume(): void { this.events.push('retention:resume') }
  async stop(): Promise<void> { this.events.push('retention:stop') }
}

class FakeDisconnect implements ProviderMailDisconnectLifecycle {
  constructor(private readonly events: string[]) {}
  async disconnect(requestValue: DisconnectAccountRequestV1) {
    this.events.push(`disconnect:${requestValue.accountId}`)
    return { ...requestValue, status: 'completed' as const }
  }
}

class FakeProjectionKey implements ProviderMailProjectionKeyLifecycle {
  failOnce = false
  useAsyncShutdown = false
  constructor(private readonly events: string[]) {}
  destroyEncryptionContext(): void {
    this.events.push('projection:destroy-key')
    if (this.failOnce) {
      this.failOnce = false
      throw new Error('test-only projection teardown failure')
    }
  }

  async shutdown(): Promise<void> {
    if (!this.useAsyncShutdown) return this.destroyEncryptionContext()
    this.events.push('projection:shutdown')
  }
}

class FakeSyncStatus implements ProviderMailSyncStatusLifecycle {
  readonly states = new Map<string, string>()
  fail = false
  recordStarted(syncRequest: SyncAccountRequestV1): void {
    if (this.fail) throw new Error('test-only sync-status failure')
    this.states.set(syncRequest.accountId, 'syncing')
  }
  recordSucceeded(syncRequest: SyncAccountRequestV1): void {
    if (this.fail) throw new Error('test-only sync-status failure')
    this.states.set(syncRequest.accountId, 'idle')
  }
  recordFailed(syncRequest: SyncAccountRequestV1, errorCode: string): void {
    if (this.fail) throw new Error('test-only sync-status failure')
    this.states.set(syncRequest.accountId, errorCode === 'SYNC_CANCELLED' ? 'idle' : `error:${errorCode}`)
  }
}

const harness = (mode: MailDataModeStateV1['mode'] = 'sample') => {
  const events: string[] = []
  const sync = new FakeSync(events)
  const mailMode = new FakeMailMode(events, mode)
  const retention = new FakeRetention(events)
  const projectionKey = new FakeProjectionKey(events)
  const syncStatus = new FakeSyncStatus()
  const owner = new ProviderMailLifecycleOwner(
    sync,
    mailMode,
    retention,
    new FakeDisconnect(events),
    projectionKey,
    syncStatus
  )
  return { events, sync, mailMode, retention, projectionKey, syncStatus, owner }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('ProviderMailLifecycleOwner', () => {
  it('recovers a persisted connection by entering live mode before startup sync', async () => {
    const { owner, events, mailMode } = harness('sample')

    await expect(owner.start([request('work'), request('personal')])).resolves.toMatchObject({
      version: 1,
      mode: 'live',
      accounts: [
        { accountId: 'work', status: 'synced' },
        { accountId: 'personal', status: 'synced' }
      ]
    })
    expect(mailMode.state.mode).toBe('live')
    expect(events).toEqual([
      'mode:load',
      'mode:activate:work',
      'sync:start:work',
      'sync:settled:work',
      'sync:start:personal',
      'sync:settled:personal',
      'retention:start'
    ])
  })

  it('starts live-empty without activating samples or starting provider work', async () => {
    const { owner, events } = harness('live')

    await expect(owner.start([])).resolves.toEqual({
      version: 1,
      mode: 'live',
      accounts: []
    })
    expect(events).toEqual(['mode:load', 'retention:start'])
  })

  it('keeps offline startup truthful and retryable after durable live activation', async () => {
    const { owner, sync, mailMode, events, syncStatus } = harness('sample')
    sync.behavior.set('work', 'offline')

    await expect(owner.start([request('work')])).resolves.toEqual({
      version: 1,
      mode: 'live',
      accounts: [{
        version: 1,
        accountId: 'work',
        provider: 'google',
        status: 'retry-required',
        errorCode: 'OFFLINE',
        retryable: true
      }]
    })
    expect(mailMode.state.mode).toBe('live')
    expect(events.at(-1)).toBe('retention:start')
    expect(syncStatus.states.get('work')).toBe('error:OFFLINE')
  })

  it('fails closed before provider work when durable sync status is unavailable', async () => {
    const { owner, syncStatus, events } = harness('live')
    await owner.start([])
    events.length = 0
    syncStatus.fail = true

    await expect(owner.syncAccounts([request('work')])).resolves.toEqual([{
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'retry-required',
      errorCode: 'SYNC_STORAGE_FAILED',
      retryable: true
    }])
    expect(events).toEqual(['retention:suspend', 'retention:resume'])
    expect(events.some((event) => event.startsWith('sync:start:'))).toBe(false)
  })

  it('pauses retention around connection activation and its first sync', async () => {
    const { owner, events, syncStatus } = harness('sample')
    await owner.start([])
    events.length = 0

    await expect(owner.activateConnectedAccount(request('work'))).resolves.toMatchObject({
      accountId: 'work',
      status: 'synced'
    })
    expect(events).toEqual([
      'retention:suspend',
      'mode:activate:work',
      'sync:start:work',
      'sync:settled:work',
      'retention:resume'
    ])
    expect(syncStatus.states.get('work')).toBe('idle')
  })

  it('cancels and settles provider work before disconnect mutates local state', async () => {
    const { owner, sync, events, syncStatus } = harness('live')
    await owner.start([])
    events.length = 0
    sync.behavior.set('work', 'blocked')
    const syncing = owner.syncAccounts([request('work')])
    await flush()

    const disconnecting = owner.disconnectAccount({
      version: 1,
      operationId: 'disconnect-work-1',
      accountId: 'work'
    })
    await expect(syncing).resolves.toMatchObject([{ status: 'retry-required' }])
    await expect(disconnecting).resolves.toMatchObject({ status: 'completed' })

    expect(events.indexOf('sync:settled:work')).toBeLessThan(events.indexOf('disconnect:work'))
    expect(events.indexOf('retention:suspend')).toBeLessThan(events.indexOf('disconnect:work'))
    expect(events.slice(-2)).toEqual(['sync:resume', 'retention:resume'])
    expect(syncStatus.states.get('work')).toBe('idle')
  })

  it('cancels a bounded manual attempt and records a retryable timeout', async () => {
    const { owner, sync, events, syncStatus } = harness('live')
    await owner.start([])
    events.length = 0
    sync.behavior.set('work', 'blocked')
    const controller = new AbortController()

    const syncing = owner.syncAccounts([request('work')], controller.signal)
    await flush()
    controller.abort()

    await expect(syncing).resolves.toEqual([{
      version: 1,
      accountId: 'work',
      provider: 'google',
      status: 'retry-required',
      errorCode: 'SYNC_ATTEMPT_TIMED_OUT',
      retryable: true
    }])
    expect(events).toEqual([
      'retention:suspend',
      'sync:start:work',
      'sync:settled:work',
      'retention:resume'
    ])
    expect(syncStatus.states.get('work')).toBe('error:SYNC_ATTEMPT_TIMED_OUT')
  })

  it('acts as the quiescence gate for separately confirmed full deletion', async () => {
    const { owner, events } = harness('live')
    await owner.start([])
    events.length = 0

    await owner.suspend()
    expect(events).toEqual(['sync:suspend', 'retention:suspend'])
    owner.resume()
    expect(events.slice(-2)).toEqual(['sync:resume', 'retention:resume'])
  })

  it('settles both workers and destroys the projection key exactly once on shutdown', async () => {
    const { owner, events } = harness('live')
    await owner.start([])
    events.length = 0

    await owner.shutdown()
    await owner.shutdown()
    expect(events).toEqual([
      'sync:suspend',
      'retention:stop',
      'sync:shutdown',
      'projection:destroy-key'
    ])
  })

  it('retries only projection-key teardown after workers are already stopped', async () => {
    const { owner, events, projectionKey } = harness('live')
    await owner.start([])
    events.length = 0
    projectionKey.failOnce = true

    await expect(owner.shutdown()).rejects.toMatchObject({
      code: 'MAIL_LIFECYCLE_TEARDOWN_FAILED',
      retryable: true
    })
    await expect(owner.shutdown()).resolves.toBeUndefined()
    expect(events).toEqual([
      'sync:suspend',
      'retention:stop',
      'sync:shutdown',
      'projection:destroy-key',
      'projection:destroy-key'
    ])
  })

  it('awaits an asynchronous projection shutdown when the worker provides one', async () => {
    const { owner, events, projectionKey } = harness('live')
    await owner.start([])
    events.length = 0
    projectionKey.useAsyncShutdown = true

    await owner.shutdown()
    await owner.shutdown()
    expect(events).toEqual([
      'sync:suspend',
      'retention:stop',
      'sync:shutdown',
      'projection:shutdown'
    ])
  })

  it('rejects malformed, duplicate, and out-of-order lifecycle requests safely', async () => {
    const { owner, events } = harness()

    await expect(owner.start([request('work'), request('work')]))
      .rejects.toMatchObject({ code: 'INVALID_MAIL_LIFECYCLE_REQUEST' })
    await expect(owner.syncAccounts([request('work')]))
      .rejects.toMatchObject({ code: 'MAIL_LIFECYCLE_STATE_CONFLICT' })
    await expect(owner.disconnectAccount({
      version: 1,
      operationId: '../unsafe',
      accountId: 'work'
    })).rejects.toMatchObject({ code: 'INVALID_MAIL_LIFECYCLE_REQUEST' })
    expect(events).toEqual([])
  })
})
