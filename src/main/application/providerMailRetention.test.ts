import { describe, expect, it } from 'vitest'
import type { ProviderMailMessageV1, ProviderMailThreadV1 } from '../../shared/providerMail'
import {
  applyProviderMailRetentionPolicy,
  includeProviderMailRetention
} from './providerMailRetention'

const message = (id: string, receivedAt: string): ProviderMailMessageV1 => ({
  version: 1,
  id,
  threadId: 'thread-1',
  accountId: 'account-work-1',
  source: {
    provider: 'google',
    accountId: 'account-work-1',
    providerMessageId: `provider-${id}`,
    providerThreadId: 'provider-thread-1'
  },
  sender: { address: 'sender@example.test' },
  recipients: [{ role: 'to', mailbox: { address: 'owner@example.test' } }],
  sentAt: receivedAt,
  receivedAt,
  subject: id,
  body: { plain: '' },
  labels: ['inbox'],
  isRead: false,
  attachments: []
})

const thread = (messageIds: string[]): ProviderMailThreadV1 => ({
  version: 1,
  id: 'thread-1',
  accountId: 'account-work-1',
  provider: 'google',
  providerThreadId: 'provider-thread-1',
  messageIds
})

describe('canonical provider-mail retention', () => {
  it('retains the exact 90-day boundary and removes an older source from its thread', () => {
    const planned = applyProviderMailRetentionPolicy([
      message('expired', '2026-06-02T09:59:59.999Z'),
      message('boundary', '2026-06-02T10:00:00.000Z')
    ], [thread(['expired', 'boundary'])], new Date('2026-08-31T10:00:00.000Z'))

    expect(planned.messages.map(({ id }) => id)).toEqual(['boundary'])
    expect(planned.threads).toEqual([thread(['boundary'])])
    expect(planned.result).toEqual({
      cutoffAt: '2026-06-02T10:00:00.000Z',
      changed: true,
      removedMessages: 1,
      removedThreads: 0,
      updatedThreads: 1
    })
  })

  it('removes a thread when all of its locally retained sources expire', () => {
    const planned = applyProviderMailRetentionPolicy([
      message('expired', '2026-01-01T00:00:00.000Z')
    ], [thread(['expired'])], new Date('2026-08-31T10:00:00.000Z'))

    expect(planned.messages).toEqual([])
    expect(planned.threads).toEqual([])
    expect(planned.result).toMatchObject({
      changed: true,
      removedMessages: 1,
      removedThreads: 1,
      updatedThreads: 0
    })
  })

  it('adds canonical removals to the existing bounded maintenance result', () => {
    expect(includeProviderMailRetention({
      cutoffAt: '2026-06-02T10:00:00.000Z',
      changed: false,
      removed: { messages: 0, topics: 0, briefItems: 0, people: 0 }
    }, {
      cutoffAt: '2026-06-02T10:00:00.000Z',
      changed: true,
      removedMessages: 2,
      removedThreads: 1,
      updatedThreads: 0
    })).toEqual({
      cutoffAt: '2026-06-02T10:00:00.000Z',
      changed: true,
      removed: { messages: 2, topics: 0, briefItems: 0, people: 0 }
    })
  })
})
