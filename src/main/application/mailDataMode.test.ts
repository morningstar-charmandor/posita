import { describe, expect, it } from 'vitest'
import type {
  AccountConnectionConsistencyInspector,
  AccountConnectionConsistencyV1
} from './accountConnection'
import {
  MailDataModeService,
  type MailDataModeRepository,
  type MailDataModeStateV1
} from './mailDataMode'
import type { StorageSanitizer } from './storageSanitizer'

class MemoryModeRepository implements MailDataModeRepository {
  state: MailDataModeStateV1 = { version: 1, mode: 'sample' }
  sanitizationRequired = false
  readonly events: string[] = []

  load(): MailDataModeStateV1 {
    this.events.push('mode:load')
    return this.state
  }

  activateLive() {
    this.events.push('mode:activate')
    const changed = this.state.mode === 'sample'
    this.state = { version: 1, mode: 'live' }
    this.sanitizationRequired = this.sanitizationRequired || changed
    return { changed, sanitizationRequired: this.sanitizationRequired }
  }
}

const harness = (status: AccountConnectionConsistencyV1['status'] = 'connected') => {
  const repository = new MemoryModeRepository()
  const events = repository.events
  let inspections = 0
  const connections: AccountConnectionConsistencyInspector = {
    inspect: async (accountId) => {
      inspections += 1
      events.push('connection:inspect')
      return { version: 1, accountId, status }
    }
  }
  const sanitizer: StorageSanitizer = {
    sanitize: async () => {
      events.push('storage:sanitize')
      repository.sanitizationRequired = false
    }
  }
  return {
    repository,
    events,
    inspections: () => inspections,
    service: new MailDataModeService(repository, connections, sanitizer)
  }
}

describe('MailDataModeService', () => {
  it('requires a complete connected account before the one-way transition', async () => {
    const { service, repository, events } = harness('credential-only')

    await expect(service.activateLive({ version: 1, accountId: 'work' }))
      .rejects.toMatchObject({ code: 'CONNECTED_ACCOUNT_REQUIRED', retryable: false })
    expect(repository.state.mode).toBe('sample')
    expect(events).toEqual(['mode:load', 'connection:inspect'])
  })

  it('activates live mode before sanitizing removed sample bytes', async () => {
    const { service, repository, events } = harness()

    await expect(service.activateLive({ version: 1, accountId: 'work' })).resolves.toEqual({
      version: 1,
      mode: 'live',
      changed: true
    })
    expect(repository.state.mode).toBe('live')
    expect(events).toEqual([
      'mode:load',
      'connection:inspect',
      'mode:activate',
      'storage:sanitize'
    ])
  })

  it('retries pending sanitization in live mode without requiring an account', async () => {
    const { service, repository, inspections, events } = harness('absent')
    repository.state = { version: 1, mode: 'live' }
    repository.sanitizationRequired = true

    await expect(service.activateLive({ version: 1, accountId: 'disconnected' }))
      .resolves.toEqual({ version: 1, mode: 'live', changed: false })
    expect(inspections()).toBe(0)
    expect(events).toEqual(['mode:load', 'mode:activate', 'storage:sanitize'])
  })

  it('keeps live mode durable when sanitization fails so cleanup can retry', async () => {
    const repository = new MemoryModeRepository()
    let sanitizeAttempts = 0
    const service = new MailDataModeService(
      repository,
      { inspect: async (accountId) => ({ version: 1, accountId, status: 'connected' }) },
      {
        sanitize: async () => {
          sanitizeAttempts += 1
          if (sanitizeAttempts === 1) throw new Error('test-only compaction failure')
          repository.sanitizationRequired = false
        }
      }
    )

    await expect(service.activateLive({ version: 1, accountId: 'work' }))
      .rejects.toMatchObject({ code: 'MAIL_DATA_MODE_SANITIZATION_FAILED', retryable: true })
    expect(repository.state.mode).toBe('live')
    await expect(service.activateLive({ version: 1, accountId: 'work' }))
      .resolves.toEqual({ version: 1, mode: 'live', changed: false })
    expect(sanitizeAttempts).toBe(2)
  })

  it('rejects malformed requests before reading local state', async () => {
    const { service, events } = harness()

    await expect(service.activateLive({
      version: 1,
      accountId: '../unsafe',
      extra: true
    } as never)).rejects.toMatchObject({ code: 'INVALID_MAIL_DATA_MODE_REQUEST' })
    await expect(service.activateLive(null as never))
      .rejects.toMatchObject({ code: 'INVALID_MAIL_DATA_MODE_REQUEST' })
    expect(events).toEqual([])
  })
})
