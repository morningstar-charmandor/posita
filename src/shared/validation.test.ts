import { describe, expect, it } from 'vitest'
import { fixtures } from './fixtures'
import {
  isAppSnapshot,
  isLoadSnapshotRequest,
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
    expect(isLoadSnapshotRequest({ version: 1 })).toBe(true)
    expect(isLoadSnapshotRequest({ version: 2 })).toBe(false)
    expect(isLoadSnapshotRequest({ version: 1, channel: 'arbitrary' })).toBe(false)
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

  it('rejects a display label in the absolute source timestamp field', () => {
    const invalid = structuredClone(fixtures)
    invalid.messages[0]!.receivedAtIso = 'Today · 10:42 AM'

    expect(isMailDataset(invalid)).toBe(false)
  })
})
