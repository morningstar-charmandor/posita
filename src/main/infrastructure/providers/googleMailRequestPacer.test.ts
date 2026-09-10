import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleMailRequestPacer, type GoogleMailPacingRuntime, type GoogleMailReadMethod } from './googleMailRequestPacer'

const signal = () => new AbortController().signal
afterEach(() => vi.useRealTimers())

describe('GoogleMailRequestPacer', () => {
  it('charges exact method weights in FIFO order with only one timer and no idle polling', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    const starts: number[] = []
    const methods: GoogleMailReadMethod[] = ['profile', 'list', 'history', 'message', 'externalText', 'profile']
    const pending = methods.map((method) => pacer.acquire(method, signal()).then(() => starts.push(performance.now())))
    expect(vi.getTimerCount()).toBe(1)
    await vi.runAllTimersAsync()
    await Promise.all(pending)
    expect(starts).toEqual([0, 20, 120, 160, 560, 960])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves admission debt across batches and does not accumulate idle burst credit', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    await pacer.acquire('message', signal())
    const next = vi.fn()
    const waiting = pacer.acquire('message', signal()).then(next)
    await vi.advanceTimersByTimeAsync(399)
    expect(next).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await waiting
    await vi.advanceTimersByTimeAsync(60_000)
    const times: number[] = []
    const admissions = [1, 2, 3].map(() => pacer.acquire('message', signal()).then(() => times.push(performance.now())))
    await vi.runAllTimersAsync()
    await Promise.all(admissions)
    expect(times).toEqual([60_400, 60_800, 61_200])
  })

  it('removes cancelled waiters immediately without refunding an admitted request or starving a survivor', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    const admitted = new AbortController()
    await pacer.acquire('message', admitted.signal)
    admitted.abort()
    const cancelled = new AbortController()
    const waiting = pacer.acquire('message', cancelled.signal)
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    const survivor = vi.fn()
    const remaining = pacer.acquire('profile', signal()).then(survivor)
    cancelled.abort()
    await rejected
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(399)
    expect(survivor).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await remaining
    expect(survivor).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its last timer on cancellation and rejects already cancelled work', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    await pacer.acquire('message', signal())
    const controller = new AbortController()
    const waiting = pacer.acquire('message', controller.signal)
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    await expect(pacer.acquire('message', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds queued work and releases capacity after cancellation', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    await pacer.acquire('message', signal())
    const controllers = Array.from({ length: 64 }, () => new AbortController())
    const waiting = controllers.map((controller) => pacer.acquire('message', controller.signal))
    const settled = Promise.allSettled(waiting)
    await expect(pacer.acquire('message', signal())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(vi.getTimerCount()).toBe(1)
    controllers.forEach((controller) => controller.abort())
    expect((await settled).every(({ status }) => status === 'rejected')).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const next = pacer.acquire('message', signal())
    await vi.runAllTimersAsync()
    await next
  })

  it.each([NaN, Infinity, -1])('fails closed for invalid or reversed monotonic time: %s', async (invalid) => {
    vi.useFakeTimers()
    let now = 0
    const time: GoogleMailPacingRuntime = {
      nowMs: () => now,
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer)
    }
    const pacer = new GoogleMailRequestPacer(time)
    await pacer.acquire('message', signal())
    const waiting = pacer.acquire('message', signal())
    const rejected = expect(waiting).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    now = invalid
    await vi.advanceTimersByTimeAsync(400)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not treat wall-clock changes as permission to burst', async () => {
    vi.useFakeTimers()
    const pacer = new GoogleMailRequestPacer()
    await pacer.acquire('message', signal())
    vi.setSystemTime(new Date('2099-01-01'))
    const done = vi.fn()
    const next = pacer.acquire('message', signal()).then(done)
    await vi.advanceTimersByTimeAsync(399)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await next
  })

  it('spaces admissions from a late wakeup instead of dispatching accumulated slots', async () => {
    vi.useFakeTimers()
    let now = 0
    const pacer = new GoogleMailRequestPacer({
      nowMs: () => now,
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer)
    })
    await pacer.acquire('message', signal())
    const times: number[] = []
    const pending = [1, 2].map(() => pacer.acquire('message', signal()).then(() => times.push(now)))
    now = 60_000
    await vi.advanceTimersByTimeAsync(400)
    expect(times).toEqual([60_000])
    now = 60_400
    await vi.advanceTimersByTimeAsync(400)
    await Promise.all(pending)
    expect(times).toEqual([60_000, 60_400])
  })

  it('settles scheduling failure with a fixed error rather than reflecting runtime details', async () => {
    const pacer = new GoogleMailRequestPacer({
      nowMs: () => 0,
      schedule: () => { throw new Error('synthetic-private-runtime-detail') },
      cancel: (timer) => clearTimeout(timer)
    })
    await pacer.acquire('message', signal())
    const error: unknown = await pacer.acquire('message', signal()).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(String(error)).not.toContain('synthetic-private-runtime-detail')
  })

  it('uses a referenced platform timer and cancels it without waiting for real time', async () => {
    const scheduled: ReturnType<typeof setTimeout>[] = []
    const pacer = new GoogleMailRequestPacer({
      nowMs: () => performance.now(),
      schedule: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        scheduled.push(timer)
        return timer
      },
      cancel: (timer) => clearTimeout(timer)
    })
    await pacer.acquire('message', signal())
    const controller = new AbortController()
    const next = pacer.acquire('message', controller.signal)
    const rejected = expect(next).rejects.toMatchObject({ name: 'AbortError' })
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]!.hasRef()).toBe(true)
    controller.abort()
    await rejected
  })
})
