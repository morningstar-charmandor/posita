import { describe, expect, it, vi } from 'vitest'
import {
  SafeConsoleProviderMailSyncStageReporter,
  observeProviderMailSyncStage
} from './providerMailSyncDiagnostics'

describe('provider-mail sync diagnostics', () => {
  it('writes only the bounded stage event', () => {
    const write = vi.fn()
    const reporter = new SafeConsoleProviderMailSyncStageReporter(write)

    reporter.report({
      version: 1,
      accountId: 'account-work-1',
      stage: 'gmail-list',
      phase: 'started'
    })

    expect(write).toHaveBeenCalledExactlyOnceWith(
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1",' +
      '"stage":"gmail-list","phase":"started"}'
    )

    reporter.report({
      version: 1,
      accountId: 'account-work-1',
      stage: 'gmail-list',
      phase: 'completed',
      token: 'must-not-be-logged'
    } as never)
    expect(write).toHaveBeenLastCalledWith(
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1",' +
      '"stage":"gmail-list","phase":"completed"}'
    )
    expect(write.mock.calls.flat().join(' ')).not.toContain('must-not-be-logged')
  })

  it('cannot change provider behavior when the diagnostic writer fails', async () => {
    const reporter = new SafeConsoleProviderMailSyncStageReporter(() => {
      throw new Error('diagnostic unavailable')
    })

    await expect(observeProviderMailSyncStage(
      reporter,
      'account-work-1',
      'token-request',
      async () => 'access-result'
    )).resolves.toBe('access-result')
  })

  it('records a safe failed phase without logging the thrown value', async () => {
    const write = vi.fn()
    const reporter = new SafeConsoleProviderMailSyncStageReporter(write)

    await expect(observeProviderMailSyncStage(
      reporter,
      'account-work-1',
      'token-response',
      async () => { throw new Error('private provider detail') }
    )).rejects.toThrow('private provider detail')

    expect(write).toHaveBeenLastCalledWith(
      '[posita-sync-stage] {"version":1,"accountId":"account-work-1",' +
      '"stage":"token-response","phase":"failed"}'
    )
    expect(write.mock.calls.flat().join(' ')).not.toContain('private provider detail')
  })
})
