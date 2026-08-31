import { describe, expect, it } from 'vitest'
import {
  isProviderMailMessageV1,
  isProviderMailThreadV1,
  type ProviderMailMessageV1,
  type ProviderMailThreadV1
} from './providerMail'

const message: ProviderMailMessageV1 = {
  version: 1,
  id: 'message-internal-1',
  threadId: 'thread-internal-1',
  accountId: 'account-work-1',
  source: {
    provider: 'google',
    accountId: 'account-work-1',
    providerMessageId: 'provider-message-1',
    providerThreadId: 'provider-thread-1'
  },
  sender: { address: 'sender@example.test', displayName: 'Sample Sender' },
  recipients: [
    { role: 'to', mailbox: { address: 'owner@example.test', displayName: 'Sample Owner' } },
    { role: 'cc', mailbox: { address: 'reviewer@example.test' } }
  ],
  sentAt: '2026-08-30T10:00:00.000Z',
  receivedAt: '2026-08-30T10:00:02.000Z',
  subject: 'Deterministic contract fixture',
  body: {
    plain: 'Credential-free sample body.',
    html: {
      sanitization: 'reviewed-html-v1',
      content: '<p>Credential-free sample body.</p>'
    }
  },
  labels: ['inbox', 'important'],
  isRead: false,
  attachments: [{
    providerAttachmentId: 'provider-attachment-1',
    filename: 'sample.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 1024,
    inline: false
  }]
}

const thread: ProviderMailThreadV1 = {
  version: 1,
  id: 'thread-internal-1',
  accountId: 'account-work-1',
  provider: 'google',
  providerThreadId: 'provider-thread-1',
  messageIds: ['message-internal-1']
}

describe('provider-independent mail contracts', () => {
  it('accepts a bounded message and thread with complete provenance', () => {
    expect(isProviderMailMessageV1(message)).toBe(true)
    expect(isProviderMailThreadV1(thread)).toBe(true)
  })

  it('rejects provider payload leakage and mismatched account provenance', () => {
    expect(isProviderMailMessageV1({ ...message, rawGmailPayload: { id: 'unsafe' } })).toBe(false)
    expect(isProviderMailMessageV1({
      ...message,
      source: { ...message.source, accountId: 'account-personal-1' }
    })).toBe(false)
  })

  it('rejects unreviewed HTML, display timestamps, and duplicate source metadata', () => {
    expect(isProviderMailMessageV1({
      ...message,
      body: { plain: message.body.plain, html: { content: '<script>unsafe</script>' } }
    })).toBe(false)
    expect(isProviderMailMessageV1({ ...message, receivedAt: 'Yesterday at 10' })).toBe(false)
    expect(isProviderMailMessageV1({
      ...message,
      labels: ['inbox', 'inbox']
    })).toBe(false)
    expect(isProviderMailMessageV1({
      ...message,
      attachments: [message.attachments[0]!, message.attachments[0]!]
    })).toBe(false)
  })

  it('requires account-scoped provider threading with unique canonical messages', () => {
    expect(isProviderMailThreadV1({ ...thread, accountId: '../other-account' })).toBe(false)
    expect(isProviderMailThreadV1({
      ...thread,
      messageIds: ['message-internal-1', 'message-internal-1']
    })).toBe(false)
  })
})
