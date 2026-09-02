import { describe, expect, it } from 'vitest'
import { normalizeGoogleMessage } from './googleMailNormalizer'

const encoded = (value: string): string => Buffer.from(value).toString('base64url')

const gmailMessage = () => ({
  id: 'google-message-1',
  threadId: 'google-thread-1',
  historyId: '501',
  internalDate: String(Date.parse('2026-09-01T09:30:00.000Z')),
  labelIds: ['INBOX', 'UNREAD', 'INBOX'],
  snippet: 'Safe snippet fallback',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: '"Example, Sender" <sender@example.test>' },
      { name: 'To', value: 'Owner <owner@example.test>, second@example.test' },
      { name: 'Cc', value: 'copy@example.test' },
      { name: 'Reply-To', value: 'reply@example.test' },
      { name: 'Subject', value: 'A deterministic Gmail message' },
      { name: 'Date', value: 'Tue, 01 Sep 2026 09:29:00 +0000' }
    ],
    body: { size: 0 },
    parts: [
      {
        mimeType: 'text/plain',
        filename: '',
        headers: [],
        body: { size: 19, data: encoded('Plain source body.') }
      },
      {
        mimeType: 'application/pdf',
        filename: 'brief.pdf',
        headers: [
          { name: 'Content-Disposition', value: 'attachment; filename="brief.pdf"' },
          { name: 'Content-ID', value: '<content-1>' }
        ],
        body: { attachmentId: 'attachment-1', size: 2048 }
      }
    ]
  }
})

describe('normalizeGoogleMessage', () => {
  it('creates one bounded canonical source without retaining provider HTML', () => {
    const result = normalizeGoogleMessage(gmailMessage(), 'account-work-1')

    expect(result).toMatchObject({
      historyId: '501',
      message: {
        version: 1,
        accountId: 'account-work-1',
        source: {
          provider: 'google',
          providerMessageId: 'google-message-1',
          providerThreadId: 'google-thread-1'
        },
        sender: { address: 'sender@example.test', displayName: 'Example, Sender' },
        recipients: [
          { role: 'to', mailbox: { address: 'owner@example.test', displayName: 'Owner' } },
          { role: 'to', mailbox: { address: 'second@example.test' } },
          { role: 'cc', mailbox: { address: 'copy@example.test' } },
          { role: 'reply-to', mailbox: { address: 'reply@example.test' } }
        ],
        sentAt: '2026-09-01T09:29:00.000Z',
        receivedAt: '2026-09-01T09:30:00.000Z',
        body: { plain: 'Plain source body.' },
        labels: ['INBOX', 'UNREAD'],
        isRead: false,
        attachments: [{
          providerAttachmentId: 'attachment-1',
          filename: 'brief.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 2048,
          inline: false,
          contentId: 'content-1'
        }]
      }
    })
    expect(result?.message.id).toMatch(/^gm_[A-Za-z0-9_-]{43}$/)
    expect(result?.thread.id).toMatch(/^gt_[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(result)).not.toContain('<html')
  })

  it('uses Gmail internal time and snippet when optional source fields are unavailable', () => {
    const value = gmailMessage()
    value.payload.headers = value.payload.headers.filter(({ name }) => name !== 'Date')
    value.payload.parts = []
    expect(normalizeGoogleMessage(value, 'account-work-1')?.message).toMatchObject({
      sentAt: '2026-09-01T09:30:00.000Z',
      receivedAt: '2026-09-01T09:30:00.000Z',
      body: { plain: 'Safe snippet fallback' }
    })
  })

  it('derives plain source text from HTML and requires external MIME text bodies', () => {
    const htmlOnly = gmailMessage()
    htmlOnly.payload.parts = [{
      mimeType: 'text/html',
      filename: '',
      headers: [],
      body: { size: 42, data: encoded('<style>x{}</style><p>Hello &amp; goodbye</p>') }
    }]
    expect(normalizeGoogleMessage(htmlOnly, 'account-work-1')?.message.body.plain)
      .toBe('Hello & goodbye')

    htmlOnly.payload.parts[0]!.body = { size: 42, attachmentId: 'text-body-1' }
    expect(normalizeGoogleMessage(htmlOnly, 'account-work-1')).toBeUndefined()
    expect(normalizeGoogleMessage(
      htmlOnly,
      'account-work-1',
      new Map([['text-body-1', encoded('<p>External body</p>')]])
    )?.message.body.plain).toBe('External body')
  })

  it('fails closed for missing identity, invalid time, oversized body, and invalid UTF-8', () => {
    const missingSender = gmailMessage()
    missingSender.payload.headers = missingSender.payload.headers.filter(({ name }) => name !== 'From')
    expect(normalizeGoogleMessage(missingSender, 'account-work-1')).toBeUndefined()

    expect(normalizeGoogleMessage({ ...gmailMessage(), internalDate: 'not-time' },
      'account-work-1')).toBeUndefined()

    const invalidBody = gmailMessage()
    invalidBody.payload.parts[0]!.body.data = Buffer.from([0xff]).toString('base64url')
    expect(normalizeGoogleMessage(invalidBody, 'account-work-1')).toBeUndefined()

    const oversizedBody = gmailMessage()
    oversizedBody.payload.parts[0]!.body.data = Buffer.alloc(2_000_001, 97).toString('base64url')
    expect(normalizeGoogleMessage(oversizedBody, 'account-work-1')).toBeUndefined()
  })

  it('keeps account scopes in deterministic IDs', () => {
    const work = normalizeGoogleMessage(gmailMessage(), 'account-work-1')
    const personal = normalizeGoogleMessage(gmailMessage(), 'account-personal-1')
    expect(work?.message.id).not.toBe(personal?.message.id)
    expect(work?.thread.id).not.toBe(personal?.thread.id)
  })
})
