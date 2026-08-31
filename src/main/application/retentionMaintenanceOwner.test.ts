import { describe, expect, it, vi } from 'vitest'
import type { Clock } from './mailApplicationService'
import type { RetentionResult } from './retentionMaintenance'
import {
  RETENTION_MAINTENANCE_INTERVAL_MS,
  RETENTION_MAINTENANCE_RETRY_MS,
  RetentionMaintenanceOwner,
  type RetentionMaintenanceRunner,
  type RetentionMaintenanceScheduler,
  type ScheduledRetentionTask
} from './retentionMaintenanceOwner'

class FakeClock implements Clock {
  constructor(private value: Date) {}
  now(): Date { return new Date(this.value) }
  advance(milliseconds: number): void {
    this.value = new Date(this.value.getTime() + milliseconds)
  }
}

class FakeScheduler implements RetentionMaintenanceScheduler {
  tasks: Array<{ delayMs: number; task: () => void; cancelled: boolean }> = []

  schedule(delayMs: number, task: () => void): ScheduledRetentionTask {
    const scheduled = { delayMs, task, cancelled: false }
    this.tasks.push(scheduled)
    return { cancel: () => { scheduled.cancelled = true } }
  }

  runNext(): void {
    const scheduled = this.tasks.find((task) => !task.cancelled)
    if (!scheduled) throw new Error('No scheduled retention task.')
    scheduled.cancelled = true
    scheduled.task()
  }
}

const unchangedResult: RetentionResult = {
  cutoffAt: '2026-06-02T12:00:00.000Z',
  changed: false,
  removed: { messages: 0, topics: 0, briefItems: 0, people: 0 }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('RetentionMaintenanceOwner', () => {
  it('runs once after startup and schedules the next bounded daily pass', async () => {
    const clock = new FakeClock(new Date('2026-08-31T12:00:00.000Z'))
    const scheduler = new FakeScheduler()
    const runner: RetentionMaintenanceRunner = { run: vi.fn().mockResolvedValue(unchangedResult) }
    const changed = vi.fn()
    const owner = new RetentionMaintenanceOwner(runner, clock, scheduler, changed)

    owner.start()
    expect(owner.status()).toEqual({
      version: 1,
      retentionDays: 90,
      status: 'scheduled',
      nextRunAt: '2026-08-31T12:00:00.000Z'
    })
    expect(scheduler.tasks[0]?.delayMs).toBe(0)

    scheduler.runNext()
    expect(owner.status()).toMatchObject({ status: 'running' })
    await flush()

    expect(runner.run).toHaveBeenCalledExactlyOnceWith(
      new Date('2026-08-31T12:00:00.000Z')
    )
    expect(owner.status()).toEqual({
      version: 1,
      retentionDays: 90,
      status: 'scheduled',
      nextRunAt: '2026-09-01T12:00:00.000Z',
      lastRun: {
        completedAt: '2026-08-31T12:00:00.000Z',
        ...unchangedResult
      }
    })
    expect(scheduler.tasks.at(-1)?.delayMs).toBe(RETENTION_MAINTENANCE_INTERVAL_MS)
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('reports a safe failure and schedules a bounded automatic retry', async () => {
    const clock = new FakeClock(new Date('2026-08-31T12:00:00.000Z'))
    const scheduler = new FakeScheduler()
    const owner = new RetentionMaintenanceOwner(
      { run: vi.fn().mockRejectedValue(new Error('/private/database/path')) },
      clock,
      scheduler
    )

    owner.start()
    scheduler.runNext()
    await flush()

    expect(owner.status()).toEqual({
      version: 1,
      retentionDays: 90,
      status: 'attention-required',
      nextRunAt: '2026-08-31T13:00:00.000Z',
      errorCode: 'RETENTION_MAINTENANCE_FAILED',
      message: 'Posita could not finish encrypted local cleanup. It will retry automatically.'
    })
    expect(JSON.stringify(owner.status())).not.toContain('/private/database/path')
    expect(scheduler.tasks.at(-1)?.delayMs).toBe(RETENTION_MAINTENANCE_RETRY_MS)
  })

  it('waits for active work while suspended and resumes from the existing due time', async () => {
    const clock = new FakeClock(new Date('2026-08-31T12:00:00.000Z'))
    const scheduler = new FakeScheduler()
    let finish: ((result: RetentionResult) => void) | undefined
    const pending = new Promise<RetentionResult>((resolve) => { finish = resolve })
    const owner = new RetentionMaintenanceOwner({ run: () => pending }, clock, scheduler)
    owner.start()
    scheduler.runNext()

    let suspended = false
    const suspension = owner.suspend().then(() => { suspended = true })
    await flush()
    expect(suspended).toBe(false)
    finish?.(unchangedResult)
    await suspension
    expect(scheduler.tasks.filter((task) => !task.cancelled)).toHaveLength(0)

    clock.advance(RETENTION_MAINTENANCE_INTERVAL_MS)
    owner.resume()
    expect(scheduler.tasks.at(-1)?.delayMs).toBe(0)
  })

  it('destroys the runner key context only after active work has settled on stop', async () => {
    const clock = new FakeClock(new Date('2026-08-31T12:00:00.000Z'))
    const scheduler = new FakeScheduler()
    const destroyEncryptionContext = vi.fn()
    const owner = new RetentionMaintenanceOwner({
      run: vi.fn().mockResolvedValue(unchangedResult),
      destroyEncryptionContext
    }, clock, scheduler)
    owner.start()
    scheduler.runNext()
    await owner.stop()

    expect(destroyEncryptionContext).toHaveBeenCalledTimes(1)
  })
})
