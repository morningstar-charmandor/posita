import { describe, expect, it } from 'vitest'
import { isLiveMailSnapshotV4, type LiveMailSnapshotV4 } from './liveMail'

const snapshot = (): LiveMailSnapshotV4 => ({
  version: 4,
  dataMode: 'live-canonical',
  loadedAt: '2026-09-01T05:00:00.000Z',
  status: 'ready',
  accounts: [{
    accountId: 'account-work-1',
    provider: 'google',
    displayIdentity: {
      status: 'available',
      mailboxAddress: 'owner.work@example.test',
      displayLabel: 'Work'
    },
    status: 'ready',
    syncRetry: 'unavailable'
  }],
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
    expect(isLiveMailSnapshotV4(snapshot())).toBe(true)
    expect(JSON.stringify(snapshot())).not.toContain('providerMessageId')
    expect(JSON.stringify(snapshot())).not.toContain('recipients')
    expect(JSON.stringify(snapshot())).not.toContain('body')
  })

  it('rejects unknown fields, orphaned account provenance, and incoherent status', () => {
    expect(isLiveMailSnapshotV4({ ...snapshot(), version: 2 })).toBe(false)
    expect(isLiveMailSnapshotV4({ ...snapshot(), version: 3 })).toBe(false)
    expect(isLiveMailSnapshotV4({ ...snapshot(), cursor: 'private-cursor' })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: []
    })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      status: 'offline'
    })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: [{
        accountId: 'account-work-1',
        provider: 'google',
        status: 'ready'
      }]
    })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: [{
        ...snapshot().accounts[0],
        displayIdentity: {
          status: 'available',
          mailboxAddress: 'owner.work@example.test',
          displayLabel: ' Work '
        }
      }]
    })).toBe(false)
  })

  it('requires one bounded safe retry-availability projection', () => {
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: [{ ...snapshot().accounts[0]!, syncRetry: 'available' }]
    })).toBe(true)
    const { syncRetry: _syncRetry, ...accountWithoutRetry } = snapshot().accounts[0]!
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: [accountWithoutRetry]
    })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      accounts: [{ ...snapshot().accounts[0]!, syncRetry: 'provider-error-code' }]
    })).toBe(false)
  })

  it('allows a bounded unavailable identity only as an explicit safe state', () => {
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      status: 'attention-required',
      accounts: [{
        ...snapshot().accounts[0],
        displayIdentity: { status: 'unavailable' },
        status: 'attention-required'
      }]
    })).toBe(true)
  })

  it.each(['quota-setup', 'quota-waiting', 'quota-ready'])('bounds %s to paused accounts without private metadata', (syncRetry) => {
    const value = { ...snapshot(), status: 'attention-required',
      accounts: [{ ...snapshot().accounts[0]!, status: 'attention-required', syncRetry }] }
    expect(isLiveMailSnapshotV4(value)).toBe(true)
    expect(isLiveMailSnapshotV4({ ...value, accounts: [{ ...value.accounts[0], status: 'ready' }] })).toBe(false)
    expect(isLiveMailSnapshotV4({ ...value, accounts: [{ ...value.accounts[0], notBefore: 'private-timestamp' }] })).toBe(false)
  })

  it('requires newest-first summaries and enforces the fixed output limit', () => {
    const older = {
      ...snapshot().messages[0]!,
      id: 'message-older',
      receivedAt: '2026-08-31T04:00:00.000Z'
    }
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      messages: [older, snapshot().messages[0]!]
    })).toBe(false)
    expect(isLiveMailSnapshotV4({
      ...snapshot(),
      messages: Array.from({ length: 51 }, (_, index) => ({
        ...snapshot().messages[0]!,
        id: `message-${index + 1}`
      }))
    })).toBe(false)
  })
})
