import { describe, expect, it } from 'vitest'
import {
  isMailSyncProjectionWorkerRequestV1,
  isMailSyncProjectionWorkerResponseV1
} from './mailSyncProjectionWorkerProtocol'

const key = new Uint8Array(32)

describe('mail-sync projection worker read protocol', () => {
  it('accepts only an exact bounded live read request', () => {
    expect(isMailSyncProjectionWorkerRequestV1({
      version: 1,
      databasePath: '/tmp/posita.sqlite3',
      key,
      operation: { kind: 'load-read-model', loadedAt: '2026-09-01T05:00:00.000Z' }
    })).toBe(true)
    expect(isMailSyncProjectionWorkerRequestV1({
      version: 1,
      databasePath: '/tmp/posita.sqlite3',
      key,
      operation: {
        kind: 'load-read-model',
        loadedAt: '2026-09-01T05:00:00.000Z',
        accountId: 'renderer-selected-account'
      }
    })).toBe(false)
  })

  it('accepts a live-empty result and rejects private or unknown fields', () => {
    const response = {
      version: 1,
      ok: true,
      operation: 'load-read-model',
      snapshot: {
        version: 2,
        dataMode: 'live-canonical',
        loadedAt: '2026-09-01T05:00:00.000Z',
        status: 'empty',
        accounts: [],
        messages: [],
        hasMore: false
      }
    }
    expect(isMailSyncProjectionWorkerResponseV1(response)).toBe(true)
    expect(isMailSyncProjectionWorkerResponseV1({
      ...response,
      snapshot: { ...response.snapshot, cursor: 'private-cursor' }
    })).toBe(false)
  })
})
