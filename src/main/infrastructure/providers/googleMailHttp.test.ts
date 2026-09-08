import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleMailJson, GoogleMissingMessageError, type GoogleMailFetch } from './googleMailHttp'

afterEach(() => vi.useRealTimers())

const read = (fetch: GoogleMailFetch, report = vi.fn(), signal = new AbortController().signal) =>
  getGoogleMailJson(fetch, '/gmail/v1/users/me/messages/synthetic?format=full',
    'synthetic-token', signal, 64, 20, 'missing-message', report)

describe('bounded Google mail HTTP boundary', () => {
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
