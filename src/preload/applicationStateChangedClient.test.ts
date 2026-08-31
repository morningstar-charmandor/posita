import { describe, expect, it, vi } from 'vitest'
import { createApplicationStateChangedClient } from './applicationStateChangedClient'

describe('application-state change preload client', () => {
  it('forwards only the exact bounded event and returns cleanup', () => {
    let receive: ((payload: unknown) => void) | undefined
    const cleanup = vi.fn()
    const listener = vi.fn()
    const client = createApplicationStateChangedClient((candidate) => {
      receive = candidate
      return cleanup
    })

    expect(client(listener)).toBe(cleanup)
    receive?.({ version: 1, reason: 'retention-maintenance' })
    receive?.({ version: 1, reason: 'send-mail', token: 'hidden' })

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      reason: 'retention-maintenance'
    })
    expect(Object.isFrozen(listener.mock.calls[0]?.[0])).toBe(true)
  })
})
