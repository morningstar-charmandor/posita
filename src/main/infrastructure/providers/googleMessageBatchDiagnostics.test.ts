import { describe, expect, it, vi } from 'vitest'
import { GoogleMessageBatchStageTracker } from './googleMessageBatchDiagnostics'
import { SafeConsoleProviderMailSyncStageReporter } from '../../application/providerMailSyncDiagnostics'

describe('fixed message-batch failure categories', () => {
  it('deduplicates failures across messages and retains only the existing safe event fields', () => {
    const write = vi.fn()
    const stages = new GoogleMessageBatchStageTracker(
      new SafeConsoleProviderMailSyncStageReporter(write), 'account-work-1')
    for (let index = 0; index < 100; index += 1) {
      stages.startRetrieval()
      stages.failure('gmail-message-response-limit')
      stages.failRetrieval()
    }
    stages.complete()
    expect(write.mock.calls.map(([line]) => line)).toEqual([
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1","stage":"gmail-message-retrieval","phase":"started"}',
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1","stage":"gmail-message-response-limit","phase":"failed"}',
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1","stage":"gmail-message-retrieval","phase":"failed"}'
    ])
  })

  it('isolates reporter failure for new classifications', () => {
    const stages = new GoogleMessageBatchStageTracker({ report: () => { throw new Error('unavailable') } },
      'account-work-1')
    expect(() => stages.failure('gmail-message-base64')).not.toThrow()
  })

  it('deduplicates HTTP status and reason across a batch through the production allow-list', () => {
    const write = vi.fn()
    const tracker = new GoogleMessageBatchStageTracker(new SafeConsoleProviderMailSyncStageReporter(write),
      'account-work-1')
    for (let index = 0; index < 100; index += 1) {
      tracker.failure('gmail-message-http-forbidden')
      tracker.failure('gmail-message-http-reason-domain-policy')
      tracker.failure('gmail-message-http')
    }
    expect(write).toHaveBeenCalledTimes(3)
    expect(write.mock.calls.map(([line]) => JSON.parse(line.slice('[posita-sync-stage] '.length)))).toEqual([
      'gmail-message-http-forbidden', 'gmail-message-http-reason-domain-policy', 'gmail-message-http'
    ].map((stage) => ({ version: 1, accountId: 'account-work-1', stage, phase: 'failed' })))
  })
})
