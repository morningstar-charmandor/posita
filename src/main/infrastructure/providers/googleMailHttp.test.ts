import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleMailJson, GoogleMissingMessageError, type GoogleMailFetch } from './googleMailHttp'

afterEach(() => vi.useRealTimers())

const read = (fetch: GoogleMailFetch, report = vi.fn(), signal = new AbortController().signal) =>
  getGoogleMailJson(fetch, '/gmail/v1/users/me/messages/synthetic?format=full',
    'synthetic-token', signal, 64, 20, 'missing-message', report)

describe('bounded Google mail HTTP boundary', () => {
  it.each([
    [400, 'bad-request', 'PROVIDER_UNAVAILABLE', false],
    [401, 'unauthorized', 'AUTHENTICATION_EXPIRED', false],
    [403, 'forbidden', 'PERMISSION_REVOKED', false],
    [429, 'rate-limited', 'QUOTA_EXHAUSTED', true],
    [500, 'server-error', 'PROVIDER_UNAVAILABLE', true],
    [502, 'server-error', 'PROVIDER_UNAVAILABLE', true],
    [503, 'server-error', 'PROVIDER_UNAVAILABLE', true],
    [504, 'server-error', 'PROVIDER_UNAVAILABLE', true],
    [302, 'unexpected-status', 'PROVIDER_UNAVAILABLE', false],
    [204, 'unexpected-status', 'PROVIDER_UNAVAILABLE', false],
    [418, 'unexpected-status', 'PROVIDER_UNAVAILABLE', false]
  ] as const)('distinguishes HTTP %s without changing its safe error policy', async (status, category, code, retryable) => {
    const report = vi.fn()
    await expect(read(async () => new Response(null, { status }), report))
      .rejects.toMatchObject({ code, retryable })
    expect(report.mock.calls).toEqual([
      [`gmail-message-http-${category}`], ['gmail-message-http-reason-unclassified'], ['gmail-message-http']
    ])
  })

  it.each([
    ['badRequest', 400, 'bad-request', 'PROVIDER_UNAVAILABLE'],
    ['authError', 401, 'auth-error', 'AUTHENTICATION_EXPIRED'],
    ['domainPolicy', 403, 'domain-policy', 'PERMISSION_REVOKED'],
    ['dailyLimitExceeded', 403, 'daily-limit', 'QUOTA_EXHAUSTED'],
    ['rateLimitExceeded', 403, 'rate-limit', 'QUOTA_EXHAUSTED'],
    ['userRateLimitExceeded', 403, 'user-rate-limit', 'QUOTA_EXHAUSTED'],
    ['backendError', 500, 'backend-error', 'PROVIDER_UNAVAILABLE']
  ] as const)('maps the documented %s reason to a fixed non-reflective label', async (reason, status, category, code) => {
    const report = vi.fn()
    const payload = { error: { message: 'private-message', errors: [
      { reason, message: 'private-body', domain: 'private-domain', location: 'private-location' }
    ], credential: 'private-credential', messageId: 'private-id' } }
    await expect(read(async () => new Response(JSON.stringify(payload), { status }), report))
      .rejects.toMatchObject({ code })
    expect(report).toHaveBeenCalledWith(`gmail-message-http-reason-${category}`)
    expect(report).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/private-|messageId|credential|location/)
  })

  it.each([
    'private-not-json',
    JSON.stringify({ error: { errors: [{ reason: 'private-unknown-reason' }] } }),
    JSON.stringify({ error: { errors: [{ reason: 'domainPolicy' }, { reason: 'authError' }] } }),
    JSON.stringify({ error: { errors: Array.from({ length: 17 }, () => ({ reason: 'domainPolicy' })) } }),
    JSON.stringify({ error: { errors: [{ reason: { private: 'value' } }] } }),
    JSON.stringify({ error: { errors: [null] } }),
    JSON.stringify({ error: { errors: [] } })
  ])('keeps ambiguous, malformed and unrecognized reasons unclassified', async (payload) => {
    const report = vi.fn()
    await expect(read(async () => new Response(payload, { status: 403 }), report))
      .rejects.toMatchObject({ code: 'PERMISSION_REVOKED', retryable: false })
    expect(report.mock.calls).toEqual([
      ['gmail-message-http-forbidden'], ['gmail-message-http-reason-unclassified'], ['gmail-message-http']
    ])
  })

  it('does not confuse a failed error-body read with a parsed provider reason', async () => {
    const report = vi.fn()
    await expect(read(async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private-error-body')) }
    }), { status: 403 }), report)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(report.mock.calls).toEqual([
      ['gmail-message-http-forbidden'], ['gmail-message-response-body']
    ])
  })

  it('keeps known HTTP status when an error body exceeds the existing bound', async () => {
    const report = vi.fn()
    await expect(read(async () => new Response('x'.repeat(512 * 1024 + 1), { status: 429 }), report))
      .rejects.toMatchObject({ code: 'MALFORMED_PAYLOAD' })
    expect(report.mock.calls).toEqual([
      ['gmail-message-http-rate-limited'], ['gmail-message-response-limit']
    ])
  })

  it.each(['provider-failure', 'invalid-cursor'] as const)('preserves the %s 404 rule without reading error detail', async (meaning) => {
    const report = vi.fn()
    const cancel = vi.fn()
    await expect(getGoogleMailJson(async () => new Response(new ReadableStream({ cancel }), { status: 404 }),
      '/synthetic', 'synthetic', new AbortController().signal, 64, 20, meaning, report))
      .rejects.toMatchObject({ code: meaning === 'invalid-cursor' ? 'INVALID_CURSOR' : 'PROVIDER_UNAVAILABLE' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(report.mock.calls).toEqual([['gmail-message-http-not-found'], ['gmail-message-http']])
  })

  it('isolates a diagnostic exception for each HTTP marker without changing the rejection', async () => {
    const report = vi.fn(() => { throw new Error('private-sink-error') })
    await expect(read(async () => new Response(null, { status: 401 }), report))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_EXPIRED', retryable: false })
    expect(report).toHaveBeenCalledTimes(3)
  })

  it('suppresses HTTP diagnostics if the caller cancels during an error-body read', async () => {
    const controller = new AbortController()
    const report = vi.fn()
    let fetched!: () => void
    const ready = new Promise<void>((resolve) => { fetched = resolve })
    const result = read(async () => {
      fetched()
      return new Response(new ReadableStream(), { status: 403 })
    }, report, controller.signal)
    await ready
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(report).not.toHaveBeenCalled()
  })

  it('accepts unknown JSON fields and cancels its deadline after success', async () => {
    vi.useFakeTimers()
    const report = vi.fn()
    await expect(read(async () => new Response('{"unused":true}'), report))
      .resolves.toEqual({ unused: true })
    expect(report).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a transport that ignores cancellation and cleans up a late response', async () => {
    vi.useFakeTimers()
    const report = vi.fn()
    let deliver!: (response: Response) => void
    const cancel = vi.fn()
    const result = read(() => new Promise((resolve) => { deliver = resolve }), report)
    const assertion = expect(result).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
    await vi.advanceTimersByTimeAsync(20)
    await assertion
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-transport')
    deliver(new Response(new ReadableStream({ cancel })))
    await Promise.resolve()
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('bounds a stalled body even when its cancellation hook never settles', async () => {
    vi.useFakeTimers()
    const report = vi.fn()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const result = read(async () => new Response(new ReadableStream({ cancel })), report)
    const assertion = expect(result).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    await vi.advanceTimersByTimeAsync(20)
    await assertion
    expect(cancel).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-response-body')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles caller cancellation without claiming a provider failure', async () => {
    const controller = new AbortController()
    const report = vi.fn()
    const result = read(() => new Promise(() => undefined), report, controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(report).not.toHaveBeenCalled()
  })

  it('does not fetch when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn(async () => new Response('{}'))
    await expect(read(fetch, vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['oversized', () => new Response('x'.repeat(65)), 'gmail-message-response-limit'],
    ['invalid UTF-8', () => new Response(Uint8Array.of(255)), 'gmail-message-response-encoding'],
    ['invalid JSON', () => new Response('private-invalid-json'), 'gmail-message-json']
  ] as const)('classifies %s without reflecting response data', async (_name, response, stage) => {
    const report = vi.fn()
    await expect(read(async () => response(), report)).rejects.toMatchObject({
      code: 'MALFORMED_PAYLOAD', retryable: false,
      message: 'Google returned an invalid mail response.'
    })
    expect(report).toHaveBeenCalledExactlyOnceWith(stage)
  })

  it('classifies body transport failure without retaining the thrown provider detail', async () => {
    const report = vi.fn()
    const result = read(async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private-transport-detail')) }
    })), report)
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE', message: 'Google mail is temporarily unavailable.'
    })
    await expect(result).rejects.not.toHaveProperty('cause')
    expect(report).toHaveBeenCalledExactlyOnceWith('gmail-message-response-body')
  })

  it('preserves vanished-message handling without waiting for body cleanup', async () => {
    const report = vi.fn()
    await expect(read(async () => new Response(new ReadableStream({
      cancel: () => new Promise<void>(() => undefined)
    }), { status: 404 }), report)).rejects.toBeInstanceOf(GoogleMissingMessageError)
    expect(report).not.toHaveBeenCalled()
  })

  it('isolates failure of the diagnostic sink', async () => {
    await expect(read(async () => new Response('bad'), vi.fn(() => {
      throw new Error('sink unavailable')
    }))).rejects.toMatchObject({ code: 'MALFORMED_PAYLOAD' })
  })
})
