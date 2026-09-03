import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import {
  AccountAuthorizationError,
  GOOGLE_AUTHORIZATION_SCOPES,
  type AccountAuthorizationLaunchV1,
  type BeginAccountAuthorizationRequestV1
} from './accountAuthorization'
import {
  AccountConnectionActivationService,
  type AccountAuthorizationBrowser,
  type AccountAuthorizationCallbackSource,
  type AccountConnectionActivationPort
} from './accountConnectionActivation'
import type { ProviderAccountRecordV2 } from './accountState'

const request: BeginAccountAuthorizationRequestV1 = {
  version: 1,
  accountId: 'account-work-1',
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  requestedScopes: GOOGLE_AUTHORIZATION_SCOPES
}
const launch: AccountAuthorizationLaunchV1 = {
  version: 1,
  sessionId: 'authorization-session-1',
  accountId: request.accountId,
  provider: 'google',
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  authorizationUrl: 'https://accounts.example.invalid/authorize?fixture=exact',
  expiresAt: '2026-09-02T12:05:00.000Z'
}
const connectedAccount: ProviderAccountRecordV2 = {
  version: 2,
  accountId: request.accountId,
  provider: 'google',
  providerAccountId: 'provider-subject-fixture-1',
  displayIdentity: { mailboxAddress: 'owner.work@example.test' },
  consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
  connectedAt: '2026-09-02T12:00:00.000Z'
}

class FakeConnection implements AccountConnectionActivationPort {
  readonly events: string[] = []
  callbackRejections = 0
  failCancel = false

  constructor(private readonly allEvents: string[] = []) {}

  async begin(_request: BeginAccountAuthorizationRequestV1): Promise<AccountAuthorizationLaunchV1> {
    this.events.push('connection:begin')
    this.allEvents.push('connection:begin')
    return launch
  }

  async complete(value: { callbackUrl: string }): Promise<ProviderAccountRecordV2> {
    this.events.push(`connection:complete:${value.callbackUrl}`)
    this.allEvents.push('connection:complete')
    if (this.callbackRejections > 0) {
      this.callbackRejections -= 1
      throw new AccountAuthorizationError(
        'AUTHORIZATION_CALLBACK_REJECTED',
        'The authorization callback could not be verified.',
        false
      )
    }
    return connectedAccount
  }

  async cancel(_sessionId: string): Promise<boolean> {
    this.events.push('connection:cancel')
    this.allEvents.push('connection:cancel')
    if (this.failCancel) throw new Error('/private/cancel-detail')
    return true
  }
}

type CallbackValue = string | Error | 'pending'

class FakeCallbacks implements AccountAuthorizationCallbackSource {
  readonly events: string[] = []

  constructor(
    private readonly values: CallbackValue[],
    private readonly allEvents: string[] = []
  ) {}

  nextCallback(sessionId: string, signal?: AbortSignal): Promise<string> {
    this.events.push(`callback:wait:${sessionId}`)
    this.allEvents.push('callback:wait')
    const value = this.values.shift()
    if (value instanceof Error) return Promise.reject(value)
    if (typeof value === 'string' && value !== 'pending') return Promise.resolve(value)
    return new Promise((resolve, reject) => {
      const onAbort = (): void => reject(new Error('deterministic callback cancellation'))
      signal?.addEventListener('abort', onAbort, { once: true })
      void resolve
    })
  }
}

class FakeBrowser implements AccountAuthorizationBrowser {
  readonly events: string[] = []
  fail = false

  constructor(private readonly allEvents: string[] = []) {}

  async open(url: string): Promise<void> {
    this.events.push(`browser:open:${url}`)
    this.allEvents.push('browser:open')
    if (this.fail) throw new Error('/private/browser-detail')
  }
}

const createHarness = (callbacks: CallbackValue[] = ['http://127.0.0.1:49152/callback']) => {
  const events: string[] = []
  const connection = new FakeConnection(events)
  const callbackSource = new FakeCallbacks(callbacks, events)
  const browser = new FakeBrowser(events)
  return {
    events,
    connection,
    callbacks: callbackSource,
    browser,
    service: new AccountConnectionActivationService(connection, callbackSource, browser)
  }
}

describe('AccountConnectionActivationService', () => {
  it('waits for the callback before browser handoff and returns only the connected account', async () => {
    const { service, connection, callbacks, browser, events } = createHarness()

    await expect(service.connect(request)).resolves.toEqual(connectedAccount)
    expect(callbacks.events).toEqual(['callback:wait:authorization-session-1'])
    expect(browser.events).toEqual([
      'browser:open:https://accounts.example.invalid/authorize?fixture=exact'
    ])
    expect(connection.events).toEqual([
      'connection:begin',
      'connection:complete:http://127.0.0.1:49152/callback'
    ])
    expect(events).toEqual([
      'connection:begin',
      'callback:wait',
      'browser:open',
      'connection:complete'
    ])
  })

  it('cancels the pending connection when browser handoff fails', async () => {
    const { service, connection, browser } = createHarness(['pending'])
    browser.fail = true

    await expect(service.connect(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_BROWSER_UNAVAILABLE',
      message: 'Posita could not open Google authorization. Start again.',
      retryable: true
    })
    expect(connection.events).toEqual(['connection:begin', 'connection:cancel'])
  })

  it('accepts a later callback after bounded non-consuming rejection', async () => {
    const harness = createHarness([
      'http://127.0.0.1:49152/rejected-1',
      'http://127.0.0.1:49152/rejected-2',
      'http://127.0.0.1:49152/accepted'
    ])
    harness.connection.callbackRejections = 2

    await expect(harness.service.connect(request)).resolves.toEqual(connectedAccount)
    expect(harness.callbacks.events).toHaveLength(3)
    expect(harness.connection.events.filter((event) => event.startsWith('connection:complete')))
      .toHaveLength(3)
    expect(harness.connection.events).not.toContain('connection:cancel')
  })

  it('stops and cancels after four rejected callback deliveries', async () => {
    const harness = createHarness(['one', 'two', 'three', 'four'])
    harness.connection.callbackRejections = 4

    await expect(harness.service.connect(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_CALLBACK_LIMIT_REACHED',
      retryable: false
    })
    expect(harness.callbacks.events).toHaveLength(4)
    expect(harness.connection.events.at(-1)).toBe('connection:cancel')
  })

  it('maps callback-receiver failure and cancels the connection', async () => {
    const { service, connection } = createHarness([
      new Error('/private/listener-detail')
    ])

    await expect(service.connect(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_CALLBACK_UNAVAILABLE',
      message: 'Posita could not receive the local authorization response. Start again.',
      retryable: true
    })
    expect(connection.events.at(-1)).toBe('connection:cancel')
  })

  it('observes cancellation while waiting but not after completion starts', async () => {
    const { service, connection } = createHarness(['pending'])
    const controller = new AbortController()
    const result = service.connect(request, controller.signal)
    await vi.waitFor(() => expect(connection.events).toContain('connection:begin'))
    controller.abort()

    await expect(result).rejects.toMatchObject({
      code: 'CONNECTION_ACTIVATION_CANCELLED',
      retryable: false
    })
    expect(connection.events.at(-1)).toBe('connection:cancel')
  })

  it('reports cleanup failure instead of hiding possible pending state', async () => {
    const { service, connection, browser } = createHarness(['pending'])
    connection.failCancel = true
    browser.fail = true

    await expect(service.connect(request)).rejects.toMatchObject({
      code: 'CONNECTION_ACTIVATION_CLEANUP_FAILED',
      message: 'Account connection cleanup requires review.',
      retryable: false
    })
  })

  it('serializes activation and rejects already-cancelled or malformed input', async () => {
    const { service } = createHarness(['pending'])
    const controller = new AbortController()
    const first = service.connect(request, controller.signal)
    await expect(service.connect(request)).rejects.toMatchObject({
      code: 'CONNECTION_ACTIVATION_IN_PROGRESS'
    })
    controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'CONNECTION_ACTIVATION_CANCELLED' })

    const alreadyCancelled = new AbortController()
    alreadyCancelled.abort()
    await expect(service.connect(request, alreadyCancelled.signal)).rejects.toMatchObject({
      code: 'CONNECTION_ACTIVATION_CANCELLED'
    })
    await expect(service.connect({
      ...request,
      requestedScopes: ['openid', 'email', 'gmail.modify']
    } as unknown as BeginAccountAuthorizationRequestV1)).rejects.toMatchObject({
      code: 'INVALID_CONNECTION_ACTIVATION_REQUEST'
    })
  })

  it('lets the connection owner preserve terminal completion and rollback errors', async () => {
    const connection = new FakeConnection()
    connection.complete = async () => {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_RESTART_REQUIRED',
        'Google authorization could not be completed. Start again.',
        true
      )
    }
    const service = new AccountConnectionActivationService(
      connection,
      new FakeCallbacks(['callback']),
      new FakeBrowser()
    )

    await expect(service.connect(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_RESTART_REQUIRED',
      retryable: true
    })
    expect(connection.events).not.toContain('connection:cancel')
  })
})
