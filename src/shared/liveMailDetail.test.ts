import { describe, expect, it } from 'vitest'
import {
  LIVE_MAIL_DETAIL_BODY_LIMIT,
  isLiveMailMessageDetailRequestV1,
  isLiveMailMessageDetailResultV1,
  type LiveMailMessageDetailResultV1
} from './liveMailDetail'

const found = (): LiveMailMessageDetailResultV1 => ({
  version: 1,
  status: 'found',
  detail: {
    version: 1,
    accountId: 'account-work-1',
    messageId: 'message-1',
    threadId: 'thread-1',
    provider: 'google',
    accountIdentity: {
      status: 'available',
      mailboxAddress: 'owner.work@example.test',
      displayLabel: 'Work'
    },
    sender: { address: 'sender@example.test', displayName: 'Sender' },
    recipients: [{ role: 'to', mailbox: { address: 'owner.work@example.test' } }],
    sentAt: '2026-09-01T04:00:00.000Z',
    receivedAt: '2026-09-01T04:00:01.000Z',
    subject: 'Bounded source detail',
    body: { plainText: 'Reviewed plain text.', truncated: false },
    isRead: false,
    attachments: [{
      filename: 'brief.pdf',
      mediaType: 'application/pdf',
      sizeBytes: 2048,
      inline: false
    }]
  }
})

describe('live-mail source-detail contract', () => {
  it('accepts exact found and missing results with canonical provenance', () => {
    expect(isLiveMailMessageDetailResultV1(found())).toBe(true)
    expect(isLiveMailMessageDetailResultV1({
      version: 1,
      status: 'missing',
      accountId: 'account-work-1',
      messageId: 'message-1'
    })).toBe(true)
  })

  it('rejects provider IDs, HTML, unknown fields, and oversized body output', () => {
    expect(isLiveMailMessageDetailResultV1({
      ...found(),
      providerMessageId: 'remote-private-id'
    })).toBe(false)
    const result = found()
    const detail = result.status === 'found' ? result.detail : undefined
    expect(detail).toBeDefined()
    expect(isLiveMailMessageDetailResultV1({
      version: 1,
      status: 'found',
      detail: { ...detail, html: '<p>provider html</p>' }
    })).toBe(false)
    expect(isLiveMailMessageDetailResultV1({
      version: 1,
      status: 'found',
      detail: {
        ...detail,
        body: { plainText: 'x'.repeat(LIVE_MAIL_DETAIL_BODY_LIMIT + 1), truncated: true }
      }
    })).toBe(false)
  })

  it('accepts only exact opaque canonical lookup requests', () => {
    expect(isLiveMailMessageDetailRequestV1({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1'
    })).toBe(true)
    expect(isLiveMailMessageDetailRequestV1({
      version: 1,
      accountId: '../mail.sqlite',
      messageId: 'message-1'
    })).toBe(false)
    expect(isLiveMailMessageDetailRequestV1({
      version: 1,
      accountId: 'account-work-1',
      messageId: 'message-1',
      providerMessageId: 'remote-id'
    })).toBe(false)
  })
})
