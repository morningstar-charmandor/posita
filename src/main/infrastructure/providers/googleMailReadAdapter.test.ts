import { describe, expect, it, vi } from 'vitest'
import {
  SYNC_BATCH_SIZE,
  type ProviderMailBatchRequestV1,
  type ProviderMailBatchV2
} from '../../application/mailSync'
import {
  GoogleMailReadAdapter,
  type GoogleAccessTokenSource,
  type GoogleMailFetch
} from './googleMailReadAdapter'
import { MailSyncCoordinator } from '../../application/mailSyncCoordinator'
import { DeterministicFakeMailSyncProjection } from './deterministicFakeMailSync'

const body = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 })
const tokenSource = (token: string | null = 'access-token'): GoogleAccessTokenSource => ({
  getAccessToken: vi.fn(async () => token ?? undefined)
})
const request = (cursor?: string): ProviderMailBatchRequestV1 => ({
  version: 1 as const,
  accountId: 'account-work-1',
  provider: 'google' as const,
  limit: SYNC_BATCH_SIZE,
  ...(cursor === undefined
    ? { receivedAfter: '2026-06-04T12:00:00.000Z' }
    : { cursor })
})
const message = (id = 'message-1', threadId = 'thread-1') => ({
  id,
  threadId,
  historyId: '101',
  internalDate: String(Date.parse('2026-09-01T10:00:00.000Z')),
  labelIds: ['INBOX'],
  snippet: 'Snippet',
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: 'Sender <sender@example.test>' },
      { name: 'To', value: 'owner@example.test' },
      { name: 'Subject', value: 'Deterministic subject' }
    ],
    body: { data: Buffer.from('Message body').toString('base64url'), size: 12 }
  }
})

const queuedFetch = (...responses: Response[]): GoogleMailFetch & { calls: [string, unknown][] } => {
  const calls: [string, unknown][] = []
  const fetchRequest: GoogleMailFetch = async (url, init) => {
    calls.push([url, init])
    const response = responses.shift()
    if (response === undefined) throw new Error('Unexpected deterministic request.')
    return response
  }
  return Object.assign(fetchRequest, { calls })
}

describe('GoogleMailReadAdapter', () => {
  it('integrates credential-free with the single coordinator through initial and deletion sync', async () => {
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }),
      body({ messages: [{ id: 'message-1' }] }),
      body(message()),
      body({
        historyId: '102',
        history: [{ messagesDeleted: [{ message: { id: 'message-1' } }] }]
      })
    )
    const projection = new DeterministicFakeMailSyncProjection()
    const coordinator = new MailSyncCoordinator(
      new GoogleMailReadAdapter(tokenSource(), fetchRequest),
      projection,
      { now: () => new Date('2026-09-02T12:00:00.000Z') }
    )

    await expect(coordinator.syncAccount({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google'
    })).resolves.toMatchObject({ mode: 'initial', insertedMessages: 1 })
    await expect(coordinator.syncAccount({
      version: 1,
      accountId: 'account-work-1',
      provider: 'google'
    })).resolves.toMatchObject({ mode: 'incremental', cursor: expect.any(String) })
    expect(projection.snapshot('account-work-1')).toMatchObject({ messages: [], threads: [] })
  })

  it('performs a bounded 90-day full read and returns canonical batch v2', async () => {
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }),
      body({ messages: [{ id: 'message-1', threadId: 'thread-1' }] }),
      body(message())
    )
    const tokens = tokenSource()
    const adapter = new GoogleMailReadAdapter(tokens, fetchRequest)

    const batch = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2

    expect(batch).toMatchObject({
      version: 2,
      accountId: 'account-work-1',
      provider: 'google',
      complete: true,
      deletedProviderMessageIds: [],
      messages: [{ source: { providerMessageId: 'message-1' } }]
    })
    expect(fetchRequest.calls.map(([url]) => url)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=after%3A1780574400&includeSpamTrash=false',
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/message-1?format=FULL'
    ])
    expect(tokens.getAccessToken).toHaveBeenCalledWith('account-work-1')
    for (const [url, init] of fetchRequest.calls) {
      expect(url).not.toContain('access-token')
      expect(init).toMatchObject({
        method: 'GET',
        headers: { authorization: 'Bearer access-token', accept: 'application/json' },
        redirect: 'error'
      })
    }
  })

  it('resumes full pagination without repeating the profile request', async () => {
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }),
      body({ messages: [{ id: 'message-1' }], nextPageToken: 'page-2' }),
      body(message()),
      body({ messages: [{ id: 'message-2' }] }),
      body(message('message-2', 'thread-2'))
    )
    const adapter = new GoogleMailReadAdapter(tokenSource(), fetchRequest)
    const first = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2
    const second = await adapter.fetchBatch(request(first.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2

    expect(first.complete).toBe(false)
    expect(second.complete).toBe(true)
    expect(fetchRequest.calls.filter(([url]) => url.endsWith('/profile'))).toHaveLength(1)
    expect(fetchRequest.calls[3]?.[0]).toContain('pageToken=page-2')
  })

  it('loads an externally stored MIME text body without downloading binary attachments', async () => {
    const external = message()
    external.payload.mimeType = 'multipart/mixed'
    external.payload.body = { data: '', size: 0 }
    Object.assign(external.payload, {
      parts: [
        {
          mimeType: 'text/plain',
          filename: '',
          headers: [],
          body: { attachmentId: 'text-body-1', size: 18 }
        },
        {
          mimeType: 'application/pdf',
          filename: 'private.pdf',
          headers: [],
          body: { attachmentId: 'binary-1', size: 2048 }
        }
      ]
    })
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }),
      body({ messages: [{ id: 'message-1' }] }),
      body(external),
      body({ size: 18, data: Buffer.from('External text body').toString('base64url') })
    )
    const adapter = new GoogleMailReadAdapter(tokenSource(), fetchRequest)

    const batch = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2

    expect(batch.messages[0]?.body.plain).toBe('External text body')
    expect(fetchRequest.calls.map(([url]) => url)).toContain(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/message-1/attachments/text-body-1'
    )
    expect(fetchRequest.calls.map(([url]) => url).join('\n')).not.toContain('binary-1')
    expect(batch.messages[0]?.attachments).toMatchObject([{
      providerAttachmentId: 'binary-1',
      filename: 'private.pdf'
    }])
  })

  it('normalizes history updates and permanent or concurrent deletions', async () => {
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }),
      body({}),
      body({
        historyId: '105',
        history: [{
          id: '104',
          messagesAdded: [{ message: { id: 'message-current' } }],
          labelsAdded: [{ message: { id: 'message-missing' }, labelIds: ['STARRED'] }],
          messagesDeleted: [{ message: { id: 'message-deleted' } }]
        }]
      }),
      body(message('message-current')),
      new Response(null, { status: 404 })
    )
    const adapter = new GoogleMailReadAdapter(tokenSource(), fetchRequest)
    const full = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2
    const history = await adapter.fetchBatch(request(full.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2

    expect(history).toMatchObject({
      complete: true,
      messages: [{ source: { providerMessageId: 'message-current' } }],
      deletedProviderMessageIds: ['message-deleted', 'message-missing']
    })
  })

  it('keeps the original history anchor across partial history pages', async () => {
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }), body({}),
      body({ historyId: '105', history: [], nextPageToken: 'history-page-2' }),
      body({ historyId: '106', history: [] })
    )
    const adapter = new GoogleMailReadAdapter(tokenSource(), fetchRequest)
    const full = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2
    const first = await adapter.fetchBatch(request(full.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2
    const second = await adapter.fetchBatch(request(first.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2

    expect(first.complete).toBe(false)
    expect(second.complete).toBe(true)
    expect(fetchRequest.calls[3]?.[0]).toContain('startHistoryId=100')
    expect(fetchRequest.calls[3]?.[0]).toContain('pageToken=history-page-2')
  })

  it('resumes an oversized history record through bounded commits', async () => {
    const deleted = Array.from({ length: 101 }, (_, index) => ({
      message: { id: `deleted-${index + 1}` }
    }))
    const history = { historyId: '105', history: [{ id: '104', messagesDeleted: deleted }] }
    const fetchRequest = queuedFetch(
      body({ historyId: '100' }), body({}), body(history), body(history)
    )
    const adapter = new GoogleMailReadAdapter(tokenSource(), fetchRequest)
    const full = await adapter.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2
    const first = await adapter.fetchBatch(request(full.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2
    const second = await adapter.fetchBatch(request(first.nextCursor),
      new AbortController().signal) as ProviderMailBatchV2

    expect(first).toMatchObject({ complete: false })
    expect(first.deletedProviderMessageIds).toHaveLength(100)
    expect(second).toMatchObject({ complete: true, deletedProviderMessageIds: ['deleted-101'] })
    expect(fetchRequest.calls[2]?.[0]).toBe(fetchRequest.calls[3]?.[0])
  })

  it('maps stale history, authentication, permission, quota, and transport safely', async () => {
    const stale = new GoogleMailReadAdapter(tokenSource(), queuedFetch(
      body({ historyId: '100' }), body({}), new Response(null, { status: 404 })
    ))
    const full = await stale.fetchBatch(request(), new AbortController().signal) as ProviderMailBatchV2
    await expect(stale.fetchBatch(request(full.nextCursor), new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_CURSOR', retryable: true })

    await expect(new GoogleMailReadAdapter(tokenSource(null)).fetchBatch(
      request(), new AbortController().signal
    )).rejects.toMatchObject({ code: 'AUTHENTICATION_EXPIRED', retryable: false })

    for (const [response, expected] of [
      [new Response(null, { status: 401 }), { code: 'AUTHENTICATION_EXPIRED', retryable: false }],
      [new Response(null, { status: 403 }), { code: 'PERMISSION_REVOKED', retryable: false }],
      [new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }),
        { status: 403 }), { code: 'QUOTA_EXHAUSTED', retryable: true }]
    ] as const) {
      await expect(new GoogleMailReadAdapter(tokenSource(), queuedFetch(response)).fetchBatch(
        request(), new AbortController().signal
      )).rejects.toMatchObject(expected)
    }

    const offline = new GoogleMailReadAdapter(tokenSource(), async () => {
      throw new Error('private network detail')
    })
    await expect(offline.fetchBatch(request(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
  })

  it('rejects malformed cursors, payloads, and oversized responses without provider detail', async () => {
    const adapter = new GoogleMailReadAdapter(tokenSource(), queuedFetch())
    await expect(adapter.fetchBatch(request('not-a-google-cursor'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_CURSOR', retryable: true })

    await expect(new GoogleMailReadAdapter(tokenSource(), queuedFetch(body({ private: true })))
      .fetchBatch(request(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'MALFORMED_PAYLOAD', retryable: false })

    const oversized = new GoogleMailReadAdapter(tokenSource(), queuedFetch(
      new Response('x'.repeat(512 * 1024 + 1), { status: 200 })
    ))
    await expect(oversized.fetchBatch(request(), new AbortController().signal))
      .rejects.toMatchObject({
        code: 'MALFORMED_PAYLOAD',
        message: 'Google returned an invalid mail response.',
        retryable: false
      })
  })

  it('honors caller cancellation and never converts it into provider detail', async () => {
    const controller = new AbortController()
    const adapter = new GoogleMailReadAdapter(tokenSource(), async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true })
      }))
    const pending = adapter.fetchBatch(request(), controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
