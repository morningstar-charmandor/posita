import { describe, expect, it, vi } from 'vitest'
import { googleExternalTextBodyIds, normalizeGoogleMessage } from './googleMailNormalizer'

const source = (payload: unknown) => ({
  id: 'synthetic-message', threadId: 'synthetic-thread', historyId: '101',
  internalDate: '1788256800000', payload,
  sizeEstimate: 1234, unknownProviderField: { ignored: true }
})
const headers = [{ name: 'From', value: 'sender@example.test' }]

describe('Gmail standards edge audit', () => {
  it('accepts absent optional fields, an empty body and unknown documented/provider fields', () => {
    expect(normalizeGoogleMessage(source({ headers, mimeType: 'text/plain', body: { data: '', size: 0 } }),
      'account-work-1')?.message).toMatchObject({
      subject: '', recipients: [], labels: [], attachments: [], body: { plain: '' }
    })
  })

  it('accepts multipart containers without data and an empty externally retrieved text body', () => {
    const value = source({ headers, mimeType: 'multipart/mixed', body: { size: 0 }, parts: [{
      mimeType: 'multipart/alternative', parts: [{
        mimeType: 'text/plain', body: { attachmentId: 'external', data: '', size: 0 }
      }]
    }] })
    expect(googleExternalTextBodyIds(value)).toEqual(['external'])
    expect(normalizeGoogleMessage(value, 'account-work-1', new Map([['external', '']]))
      ?.message.body.plain).toBe('')
  })

  it('keeps named attachment references as metadata without requesting their bytes', () => {
    const value = source({ headers, mimeType: 'multipart/mixed', parts: [{
      mimeType: 'application/pdf', filename: 'synthetic.pdf',
      body: { attachmentId: 'binary-reference', size: 12 }
    }] })
    expect(googleExternalTextBodyIds(value)).toEqual([])
    expect(normalizeGoogleMessage(value, 'account-work-1')?.message.attachments)
      .toMatchObject([{ providerAttachmentId: 'binary-reference', sizeBytes: 12 }])
  })

  // These valid source forms remain unsupported, not evidence of malformed Gmail.
  it.each([
    ['empty recipient group', [...headers, { name: 'To', value: 'undisclosed-recipients:;' }]],
    ['address comment', [{ name: 'From', value: 'sender@example.test (Sender)' }]],
    ['folded display name', [{ name: 'From', value: 'Sender\r\n <sender@example.test>' }]],
    ['unfinished senderless draft', []]
  ])('classifies the existing unsupported %s without inventing identity', (_name, mailHeaders) => {
    const report = vi.fn()
    expect(normalizeGoogleMessage({ ...source({ headers: mailHeaders }), labelIds: ['DRAFT'] },
      'account-work-1', new Map(), report)).toBeUndefined()
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-headers')
  })

  it('distinguishes an unsupported legacy charset from invalid base64', () => {
    const report = vi.fn()
    const value = source({ headers: [...headers, {
      name: 'Content-Type', value: 'text/plain; charset=iso-8859-1'
    }], mimeType: 'text/plain', body: { data: '6Q==', size: 1 } })
    expect(normalizeGoogleMessage(value, 'account-work-1', new Map(), report)).toBeUndefined()
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-text-decoding')
  })

  it('classifies canonical subject limits without silently truncating source text', () => {
    const report = vi.fn()
    expect(normalizeGoogleMessage(source({ headers: [...headers, {
      name: 'Subject', value: 'x'.repeat(999)
    }] }), 'account-work-1', new Map(), report)).toBeUndefined()
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-contract')
  })

  it('bounds deep and broad MIME traversal before recursion or external reads', () => {
    let payload: unknown = { mimeType: 'text/plain', body: { attachmentId: 'external' } }
    for (let index = 0; index < 64; index += 1) payload = { parts: [payload] }
    for (const value of [source(payload), source({ parts: Array.from({ length: 2049 }, () => ({})) })]) {
      const report = vi.fn()
      expect(googleExternalTextBodyIds(value)).toEqual([])
      expect(normalizeGoogleMessage(value, 'account-work-1', new Map(), report)).toBeUndefined()
      expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-mime')
    }
  })
})
