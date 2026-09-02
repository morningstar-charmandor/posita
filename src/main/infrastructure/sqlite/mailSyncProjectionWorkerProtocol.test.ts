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

  it('accepts only exact canonical source-detail work and bounded results', () => {
    const request = {
      version: 1,
      databasePath: '/tmp/posita.sqlite3',
      key,
      operation: {
        kind: 'load-message-detail',
        request: { version: 1, accountId: 'account-work-1', messageId: 'message-1' }
      }
    }
    expect(isMailSyncProjectionWorkerRequestV1(request)).toBe(true)
    expect(isMailSyncProjectionWorkerRequestV1({
      ...request,
      operation: {
        ...request.operation,
        request: { ...request.operation.request, providerMessageId: 'remote-id' }
      }
    })).toBe(false)
    expect(isMailSyncProjectionWorkerResponseV1({
      version: 1,
      ok: true,
      operation: 'load-message-detail',
      result: {
        version: 1,
        status: 'missing',
        accountId: 'account-work-1',
        messageId: 'message-1'
      }
    })).toBe(true)
    expect(isMailSyncProjectionWorkerResponseV1({
      version: 1,
      ok: true,
      operation: 'load-message-detail',
      result: {
        version: 1,
        status: 'missing',
        accountId: 'account-work-1',
        messageId: 'message-1',
        databasePath: '/private/mail.sqlite'
      }
    })).toBe(false)
  })

  it('keeps original-source provider identity inside the trusted worker protocol', () => {
    const request = {
      version: 1,
      databasePath: '/tmp/posita.sqlite3',
      key,
      operation: {
        kind: 'load-original-source-locator',
        request: { version: 1, accountId: 'account-work-1', messageId: 'message-1' }
      }
    }
    expect(isMailSyncProjectionWorkerRequestV1(request)).toBe(true)
    const response = {
      version: 1,
      ok: true,
      operation: 'load-original-source-locator',
      result: {
        version: 1,
        status: 'found',
        accountId: 'account-work-1',
        messageId: 'message-1',
        provider: 'google',
        mailboxAddress: 'owner@example.test',
        providerMessageId: 'provider-message-1'
      }
    }
    expect(isMailSyncProjectionWorkerResponseV1(response)).toBe(true)
    expect(isMailSyncProjectionWorkerResponseV1({
      ...response,
      result: { ...response.result, url: 'https://mail.google.com/' }
    })).toBe(false)
  })
})
