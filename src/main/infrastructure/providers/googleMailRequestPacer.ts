import { googleMailFailure } from './googleMailHttp'

// Conservative shared budget: 50 units/second, without saved burst credit.
// Google quota reference (2026-09-09): profile=1, list=5, history=2,
// message and external text body=20. See ADR-067 for scope and tradeoffs.
const METHOD_UNITS = { profile: 1, list: 5, history: 2, message: 20, externalText: 20 } as const
export type GoogleMailReadMethod = keyof typeof METHOD_UNITS
const MS_PER_UNIT = 20
const MAX_PENDING = 64

export interface GoogleMailPacingRuntime {
  nowMs(): number
  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  cancel(timer: ReturnType<typeof setTimeout>): void
}

const runtime: GoogleMailPacingRuntime = {
  nowMs: () => performance.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (timer) => clearTimeout(timer)
}

interface PendingAdmission {
  units: number
  signal: AbortSignal
  abort: () => void
  resolve: () => void
  reject: (error: unknown) => void
}

/** Local admission only: owns no provider calls, account state, payloads or retries. */
export class GoogleMailRequestPacer {
  private readonly pending: PendingAdmission[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private nextAllowed = 0
  private lastNow = 0

  constructor(private readonly time: GoogleMailPacingRuntime = runtime) {}

  async acquire(method: GoogleMailReadMethod, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (this.pending.length >= MAX_PENDING) throw googleMailFailure('PROVIDER_UNAVAILABLE', true)
    return new Promise<void>((resolve, reject) => {
      const entry: PendingAdmission = {
        units: METHOD_UNITS[method], signal, resolve, reject,
        abort: () => {
          const index = this.pending.indexOf(entry)
          if (index < 0) return
          this.pending.splice(index, 1)
          signal.removeEventListener('abort', entry.abort)
          reject(new DOMException('Aborted', 'AbortError'))
          this.drain()
        }
      }
      this.pending.push(entry)
      signal.addEventListener('abort', entry.abort, { once: true })
      this.drain()
    })
  }

  private drain(): void {
    if (this.timer !== undefined) {
      this.time.cancel(this.timer)
      this.timer = undefined
    }
    if (this.pending.length === 0) return
    try {
      const now = this.time.nowMs()
      if (!Number.isFinite(now) || now < this.lastNow) throw new Error('Invalid pacing clock')
      this.lastNow = now
      const delay = this.nextAllowed - now
      if (delay > 0) {
        // Referenced timer: Electron main must wake even when no other work is ready.
        this.timer = this.time.schedule(() => { this.timer = undefined; this.drain() }, delay)
        return
      }
      const entry = this.pending.shift()!
      entry.signal.removeEventListener('abort', entry.abort)
      this.nextAllowed = now + entry.units * MS_PER_UNIT
      entry.resolve()
      // Charge from actual admission time, never catch up after slow I/O or sleep.
      this.drain()
    } catch {
      for (const entry of this.pending.splice(0)) {
        entry.signal.removeEventListener('abort', entry.abort)
        entry.reject(googleMailFailure('PROVIDER_UNAVAILABLE', true))
      }
    }
  }
}
