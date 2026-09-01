import { describe, expect, it } from 'vitest'
import { isLiveMailSnapshotV1, type LiveMailSnapshotV1 } from './liveMail'

const snapshot = (): LiveMailSnapshotV1 => ({
  version: 1,
  dataMode: 'live-canonical',
  loadedAt: '2026-09-01T05:00:00.000Z',
  status: 'ready',
  accounts: [{ accountId: 'account-work-1', provider: 'google', status: 'ready' }],
  messages: [{
    id: 'message-1',
    threadId: 'thread-1',
    accountId: 'account-work-1',
    provider: 'google',
    sender: { address: 'sender@example.test', displayName: 'Sender' },
    receivedAt: '2026-09-01T04:00:00.000Z',
    subject: 'Bounded subject',
    preview: 'Bounded plain-text preview.',
    isRead: false,
    attachmentCount: 1
  }],
  hasMore: false
})

describe('live-mail presentation contract', () => {
  it('accepts one exact bounded canonical summary without private provider fields', () => {
    expect(isLiveMailSnapshotV1(snapshot())).toBe(true)
    expect(JSON.stringify(snapshot())).not.toContain('providerMessageId')
    expect(JSON.stringify(snapshot())).not.toContain('recipients')
    expect(JSON.stringify(snapshot())).not.toContain('body')
  })

  it('rejects unknown fields, orphaned account provenance, and incoherent status', () => {
    expect(isLiveMailSnapshotV1({ ...snapshot(), cursor: 'private-cursor' })).toBe(false)
    expect(isLiveMailSnapshotV1({
      ...snapshot(),
      accounts: []
    })).toBe(false)
    expect(isLiveMailSnapshotV1({
      ...snapshot(),
      status: 'offline'
    })).toBe(false)
  })

  it('requires newest-first summaries and enforces the fixed output limit', () => {
    const older = {
      ...snapshot().messages[0]!,
      id: 'message-older',
      receivedAt: '2026-08-31T04:00:00.000Z'
    }
    expect(isLiveMailSnapshotV1({
      ...snapshot(),
      messages: [older, snapshot().messages[0]!]
    })).toBe(false)
    expect(isLiveMailSnapshotV1({
      ...snapshot(),
      messages: Array.from({ length: 51 }, (_, index) => ({
        ...snapshot().messages[0]!,
        id: `message-${index + 1}`
      }))
    })).toBe(false)
  })
})
