import { describe, expect, it } from 'vitest'
import { fixtures } from './fixtures'
import {
  isAppSnapshot,
  isLoadApplicationStateRequest,
  isLoadApplicationStateResponse,
  isLoadSnapshotResponse,
  isMailDataset
} from './validation'

describe('shared contract validation', () => {
  it('accepts the complete fixture dataset and a valid snapshot', () => {
    expect(isMailDataset(fixtures)).toBe(true)
    expect(isAppSnapshot({
      version: 1,
      dataMode: 'fixture-seeded',
      loadedAt: '2026-08-24T05:30:00.000Z',
      dataset: fixtures
    })).toBe(true)
  })

  it('requires an exact versioned request shape', () => {
    expect(isLoadApplicationStateRequest({ version: 1 })).toBe(true)
    expect(isLoadApplicationStateRequest({ version: 2 })).toBe(false)
    expect(isLoadApplicationStateRequest({ version: 1, channel: 'arbitrary' })).toBe(false)
  })

  it('accepts only coherent application and lifecycle states', () => {
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted' }
    })).toBe(true)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: {
          version: 1,
          dataMode: 'fixture-seeded',
          loadedAt: '2026-08-24T05:30:00.000Z',
          dataset: fixtures
        },
        lifecycle: {
          version: 1,
          state: 'pending',
          operations: [{
            version: 1,
            operationId: 'disconnect-work-1',
            operationType: 'disconnect-account',
            accountId: 'work',
            status: 'pending',
            stage: 'removing-mail-data',
            completedSteps: 3,
            totalSteps: 5,
            message: 'Account disconnection is pending.'
          }]
        }
      }
    })).toBe(true)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: {
        version: 1,
        mode: 'ready',
        snapshot: { version: 1 },
        lifecycle: { version: 1, state: 'idle', operations: [{ status: 'pending' }] }
      }
    })).toBe(false)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'local-data-deleted', retryOperationId: 'hidden-command' }
    })).toBe(false)
  })

  it('rejects malformed success and error responses', () => {
    expect(isLoadSnapshotResponse({ ok: true, value: { version: 1 } })).toBe(false)
    expect(isLoadSnapshotResponse({
      ok: false,
      error: {
        version: 1,
        code: 'RAW_SQL_ERROR',
        message: 'leaked',
        retryable: true
      }
    })).toBe(false)
  })

  it('rejects derived claims that reference a missing source message', () => {
    const invalid = structuredClone(fixtures)
    invalid.topics[0]!.events[0]!.citationMessageId = 'missing-message'

    expect(isMailDataset(invalid)).toBe(false)
  })

  it('rejects undeclared fields anywhere in the renderer payload', () => {
    const invalid = structuredClone(fixtures) as typeof fixtures & { providerPayload?: unknown }
    invalid.providerPayload = { raw: 'must not cross the bridge' }

    expect(isMailDataset(invalid)).toBe(false)
    expect(isLoadApplicationStateResponse({
      ok: true,
      value: { version: 1, mode: 'recovery-required', databasePath: '/private/path' }
    })).toBe(false)
  })

  it('rejects a display label in the absolute source timestamp field', () => {
    const invalid = structuredClone(fixtures)
    invalid.messages[0]!.receivedAtIso = 'Today · 10:42 AM'

    expect(isMailDataset(invalid)).toBe(false)
  })
})
