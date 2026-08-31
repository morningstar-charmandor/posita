import {
  POSITA_PROTOCOL_VERSION,
  RETENTION_MAINTENANCE_FAILURE_MESSAGE,
  type RetentionMaintenanceRunV1,
  type RetentionMaintenanceStatusV1
} from '../../shared/contracts'
import type { Clock } from './mailApplicationService'
import {
  PRIVATE_ALPHA_RETENTION_DAYS,
  type RetentionResult
} from './retentionMaintenance'

export const RETENTION_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000
export const RETENTION_MAINTENANCE_RETRY_MS = 60 * 60 * 1000

export interface RetentionMaintenanceRunner {
  run(now: Date): Promise<RetentionResult>
  destroyEncryptionContext?(): void
}

export interface ScheduledRetentionTask {
  cancel(): void
}

export interface RetentionMaintenanceScheduler {
  schedule(delayMs: number, task: () => void): ScheduledRetentionTask
}

export const systemRetentionMaintenanceScheduler: RetentionMaintenanceScheduler = {
  schedule(delayMs, task) {
    const handle = setTimeout(task, delayMs)
    handle.unref()
    return { cancel: () => clearTimeout(handle) }
  }
}

const safeDate = (date: Date): string => date.toISOString()

const runSummary = (
  result: RetentionResult,
  completedAt: Date
): RetentionMaintenanceRunV1 => ({
  completedAt: safeDate(completedAt),
  cutoffAt: result.cutoffAt,
  changed: result.changed,
  removed: result.removed
})

export class RetentionMaintenanceOwner {
  private active?: Promise<void>
  private scheduled?: ScheduledRetentionTask
  private paused = false
  private stopped = false
  private started = false
  private state: RetentionMaintenanceStatusV1

  constructor(
    private readonly runner: RetentionMaintenanceRunner,
    private readonly clock: Clock,
    private readonly scheduler: RetentionMaintenanceScheduler =
      systemRetentionMaintenanceScheduler,
    private readonly onStatusChange: () => void = () => undefined
  ) {
    this.state = {
      version: POSITA_PROTOCOL_VERSION,
      retentionDays: PRIVATE_ALPHA_RETENTION_DAYS,
      status: 'scheduled',
      nextRunAt: safeDate(clock.now())
    }
  }

  start(): void {
    if (this.started || this.stopped) return
    this.started = true
    this.schedule(0)
  }

  status(): RetentionMaintenanceStatusV1 {
    return structuredClone(this.state)
  }

  async suspend(): Promise<void> {
    this.paused = true
    this.scheduled?.cancel()
    this.scheduled = undefined
    await this.active
  }

  resume(): void {
    if (!this.started || this.stopped || !this.paused) return
    this.paused = false
    const now = this.clock.now().getTime()
    const next = this.state.status === 'running'
      ? now
      : Date.parse(this.state.nextRunAt)
    this.schedule(Math.max(0, next - now))
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.paused = true
    this.scheduled?.cancel()
    this.scheduled = undefined
    await this.active
    this.runner.destroyEncryptionContext?.()
  }

  private schedule(delayMs: number): void {
    if (this.paused || this.stopped || this.scheduled) return
    this.scheduled = this.scheduler.schedule(delayMs, () => {
      this.scheduled = undefined
      void this.run()
    })
  }

  private run(): Promise<void> {
    if (this.active) return this.active
    const startedAt = this.clock.now()
    const previousRun = this.state.lastRun
    this.state = {
      version: POSITA_PROTOCOL_VERSION,
      retentionDays: PRIVATE_ALPHA_RETENTION_DAYS,
      status: 'running',
      startedAt: safeDate(startedAt),
      ...(previousRun === undefined ? {} : { lastRun: previousRun })
    }
    this.onStatusChange()

    const promise = this.runner.run(startedAt).then((result) => {
      const completedAt = this.clock.now()
      this.state = {
        version: POSITA_PROTOCOL_VERSION,
        retentionDays: PRIVATE_ALPHA_RETENTION_DAYS,
        status: 'scheduled',
        nextRunAt: safeDate(new Date(completedAt.getTime() + RETENTION_MAINTENANCE_INTERVAL_MS)),
        lastRun: runSummary(result, completedAt)
      }
    }).catch(() => {
      const failedAt = this.clock.now()
      this.state = {
        version: POSITA_PROTOCOL_VERSION,
        retentionDays: PRIVATE_ALPHA_RETENTION_DAYS,
        status: 'attention-required',
        nextRunAt: safeDate(new Date(failedAt.getTime() + RETENTION_MAINTENANCE_RETRY_MS)),
        errorCode: 'RETENTION_MAINTENANCE_FAILED',
        message: RETENTION_MAINTENANCE_FAILURE_MESSAGE,
        ...(previousRun === undefined ? {} : { lastRun: previousRun })
      }
    }).finally(() => {
      if (this.active === promise) this.active = undefined
      this.onStatusChange()
      if (!this.paused && !this.stopped) {
        const nextRunAt = this.state.status === 'running'
          ? this.clock.now().getTime()
          : Date.parse(this.state.nextRunAt)
        this.schedule(Math.max(0, nextRunAt - this.clock.now().getTime()))
      }
    })
    this.active = promise
    return promise
  }
}
