import { isOperationId } from './accountLifecycle'
import { isAccountId } from './accountState'
import type {
  DisconnectAccountRequestV1,
  DisconnectAccountResultV1
} from './disconnectAccount'
import type {
  MailDataModeService,
  MailDataModeStateV1
} from './mailDataMode'
import {
  MailSyncError,
  isSyncAccountRequestV1,
  type MailSyncErrorCode,
  type SyncAccountRequestV1,
  type SyncAccountResultV1
} from './mailSync'

const MAX_STARTUP_ACCOUNTS = 8

export interface ProviderMailSyncLifecycle {
  syncAccount(request: SyncAccountRequestV1): Promise<SyncAccountResultV1>
  suspend(): Promise<void>
  resume(): void
  shutdown(): Promise<void>
}

export interface ProviderMailRetentionLifecycle {
  start(): void
  suspend(): Promise<void>
  resume(): void
  stop(): Promise<void>
}

export interface ProviderMailDisconnectLifecycle {
  disconnect(request: DisconnectAccountRequestV1): Promise<DisconnectAccountResultV1>
}

export interface ProviderMailProjectionKeyLifecycle {
  destroyEncryptionContext(): void
}

export interface ProviderMailSyncStatusLifecycle {
  recordStarted(request: SyncAccountRequestV1): unknown
  recordSucceeded(request: SyncAccountRequestV1, result: SyncAccountResultV1): unknown
  recordFailed(request: SyncAccountRequestV1, errorCode: MailSyncErrorCode): unknown
}

export type ProviderMailLifecycleAccountOutcomeV1 = {
  version: 1
  accountId: string
  provider: 'google'
} & ({
  status: 'synced'
  result: SyncAccountResultV1
} | {
  status: 'retry-required' | 'failed'
  errorCode: MailSyncErrorCode
  retryable: boolean
})

export interface ProviderMailLifecycleStartupResultV1 {
  version: 1
  mode: MailDataModeStateV1['mode']
  accounts: ProviderMailLifecycleAccountOutcomeV1[]
}

export type ProviderMailLifecycleErrorCode =
  | 'INVALID_MAIL_LIFECYCLE_REQUEST'
  | 'MAIL_LIFECYCLE_STATE_CONFLICT'
  | 'MAIL_LIFECYCLE_TEARDOWN_FAILED'

export class ProviderMailLifecycleError extends Error {
  constructor(
    readonly code: ProviderMailLifecycleErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ProviderMailLifecycleError'
  }
}

type LifecycleState = 'created' | 'starting' | 'running' | 'suspended' | 'stopped'

const invalidRequest = (): ProviderMailLifecycleError => new ProviderMailLifecycleError(
  'INVALID_MAIL_LIFECYCLE_REQUEST',
  'The provider-mail lifecycle request is invalid.',
  false
)

const stateConflict = (): ProviderMailLifecycleError => new ProviderMailLifecycleError(
  'MAIL_LIFECYCLE_STATE_CONFLICT',
  'Provider-mail lifecycle work is unavailable in the current state.',
  true
)

const isDisconnectRequest = (value: unknown): value is DisconnectAccountRequestV1 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  return Object.keys(request).length === 3 &&
    Object.keys(request).every((key) => ['version', 'operationId', 'accountId'].includes(key)) &&
    request.version === 1 && isOperationId(request.operationId) && isAccountId(request.accountId)
}

const validateAccounts = (value: unknown, allowEmpty: boolean): SyncAccountRequestV1[] => {
  if (!Array.isArray(value) || value.length > MAX_STARTUP_ACCOUNTS ||
      (!allowEmpty && value.length === 0) || !value.every(isSyncAccountRequestV1)) {
    throw invalidRequest()
  }
  const accounts = value.map((request) => structuredClone(request))
  if (new Set(accounts.map((request) => request.accountId)).size !== accounts.length) {
    throw invalidRequest()
  }
  return accounts
}

/**
 * The sole trusted owner for coordinating provider sync with retention and
 * destructive local lifecycle work. It is credential-free and intentionally
 * uncomposed from Electron startup, preload, IPC, UI, and provider adapters.
 */
export class ProviderMailLifecycleOwner {
  private state: LifecycleState = 'created'
  private tail: Promise<void> = Promise.resolve()
  private projectionKeyDestroyed = false

  constructor(
    private readonly sync: ProviderMailSyncLifecycle,
    private readonly mailMode: Pick<MailDataModeService, 'load' | 'activateLive'>,
    private readonly retention: ProviderMailRetentionLifecycle,
    private readonly disconnect: ProviderMailDisconnectLifecycle,
    private readonly projectionKey: ProviderMailProjectionKeyLifecycle,
    private readonly syncStatus: ProviderMailSyncStatusLifecycle
  ) {}

  start(accountsValue: unknown): Promise<ProviderMailLifecycleStartupResultV1> {
    let accounts: SyncAccountRequestV1[]
    try {
      accounts = validateAccounts(accountsValue, true)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.enqueue(async () => {
      if (this.state !== 'created') throw stateConflict()
      this.state = 'starting'
      try {
        let mode = this.mailMode.load().mode
        if (accounts.length > 0) {
          await this.mailMode.activateLive({ version: 1, accountId: accounts[0]!.accountId })
          mode = 'live'
        }
        const outcomes = await this.runSyncBatch(accounts)
        this.state = 'running'
        this.retention.start()
        return { version: 1, mode, accounts: outcomes }
      } catch (error) {
        this.state = 'created'
        throw error
      }
    })
  }

  activateConnectedAccount(
    requestValue: unknown
  ): Promise<ProviderMailLifecycleAccountOutcomeV1> {
    let request: SyncAccountRequestV1
    try {
      request = validateAccounts([requestValue], false)[0]!
    } catch (error) {
      return Promise.reject(error)
    }
    return this.enqueue(async () => {
      this.assertRunning()
      await this.retention.suspend()
      try {
        await this.mailMode.activateLive({ version: 1, accountId: request.accountId })
        return await this.runSync(request)
      } finally {
        if (this.state === 'running') this.retention.resume()
      }
    })
  }

  syncAccounts(accountsValue: unknown): Promise<ProviderMailLifecycleAccountOutcomeV1[]> {
    let accounts: SyncAccountRequestV1[]
    try {
      accounts = validateAccounts(accountsValue, false)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.enqueue(async () => {
      this.assertRunning()
      await this.retention.suspend()
      try {
        return await this.runSyncBatch(accounts)
      } finally {
        if (this.state === 'running') this.retention.resume()
      }
    })
  }

  disconnectAccount(requestValue: unknown): Promise<DisconnectAccountResultV1> {
    if (!isDisconnectRequest(requestValue)) return Promise.reject(invalidRequest())
    if (this.state !== 'running') return Promise.reject(stateConflict())
    const request = structuredClone(requestValue)
    const syncSuspension = this.sync.suspend()
    return this.enqueue(async () => {
      this.assertRunning()
      await syncSuspension
      let retentionSuspended = false
      try {
        await this.retention.suspend()
        retentionSuspended = true
        return await this.disconnect.disconnect(request)
      } finally {
        if (this.state === 'running') {
          this.sync.resume()
          if (retentionSuspended) this.retention.resume()
        }
      }
    })
  }

  /** Gate used before a separately confirmed installation-wide deletion. */
  suspend(): Promise<void> {
    if (this.state === 'suspended') return Promise.resolve()
    if (this.state !== 'running') return Promise.reject(stateConflict())
    const syncSuspension = this.sync.suspend()
    return this.enqueue(async () => {
      if (this.state === 'suspended') return
      this.assertRunning()
      await syncSuspension
      try {
        await this.retention.suspend()
      } catch (error) {
        this.sync.resume()
        throw error
      }
      this.state = 'suspended'
    })
  }

  /** Resumes only after an attempted deletion failed before terminal completion. */
  resume(): void {
    if (this.state !== 'suspended') return
    this.state = 'running'
    this.sync.resume()
    this.retention.resume()
  }

  shutdown(): Promise<void> {
    if (this.state === 'stopped' && this.projectionKeyDestroyed) return Promise.resolve()
    const workersAlreadyStopped = this.state === 'stopped'
    const syncSuspension = workersAlreadyStopped ? Promise.resolve() : this.sync.suspend()
    return this.enqueue(async () => {
      if (this.state === 'stopped' && this.projectionKeyDestroyed) return
      let teardownFailure: unknown
      try {
        await syncSuspension
      } catch (error) {
        teardownFailure = error
      }
      if (!workersAlreadyStopped) {
        try {
          await this.retention.stop()
        } catch (error) {
          teardownFailure ??= error
        }
        try {
          await this.sync.shutdown()
        } catch (error) {
          teardownFailure ??= error
        }
      }
      try {
        if (!this.projectionKeyDestroyed) {
          this.destroyEncryptionContext()
        }
      } catch (error) {
        teardownFailure ??= error
      } finally {
        this.state = 'stopped'
      }
      if (teardownFailure !== undefined) {
        throw new ProviderMailLifecycleError(
          'MAIL_LIFECYCLE_TEARDOWN_FAILED',
          'Provider-mail lifecycle teardown failed.',
          true,
          { cause: teardownFailure }
        )
      }
    })
  }

  /** Included with every retained worker key in full-deletion composition. */
  destroyEncryptionContext(): void {
    if (this.projectionKeyDestroyed) return
    this.projectionKey.destroyEncryptionContext()
    this.projectionKeyDestroyed = true
  }

  private assertRunning(): void {
    if (this.state !== 'running') throw stateConflict()
  }

  private runSyncBatch(
    accounts: readonly SyncAccountRequestV1[]
  ): Promise<ProviderMailLifecycleAccountOutcomeV1[]> {
    return Promise.all(accounts.map((request) => this.runSync(request)))
  }

  private async runSync(
    request: SyncAccountRequestV1
  ): Promise<ProviderMailLifecycleAccountOutcomeV1> {
    try {
      this.syncStatus.recordStarted(request)
      const result = await this.sync.syncAccount(request)
      this.syncStatus.recordSucceeded(request, result)
      return {
        version: 1,
        accountId: request.accountId,
        provider: request.provider,
        status: 'synced',
        result
      }
    } catch (error) {
      let failure = error instanceof MailSyncError
        ? error
        : new MailSyncError(
          'SYNC_STORAGE_FAILED',
          'Provider-mail synchronization failed safely.',
          true,
          { cause: error }
        )
      try {
        this.syncStatus.recordFailed(request, failure.code)
      } catch (statusError) {
        failure = new MailSyncError(
          'SYNC_STORAGE_FAILED',
          'Provider-mail synchronization status failed safely.',
          true,
          { cause: statusError }
        )
      }
      return {
        version: 1,
        accountId: request.accountId,
        provider: request.provider,
        status: failure.retryable ? 'retry-required' : 'failed',
        errorCode: failure.code,
        retryable: failure.retryable
      }
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work)
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }
}
