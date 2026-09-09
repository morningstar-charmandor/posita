import { ProviderMailAdapterError } from '../../application/mailSync'
import type {
  GoogleMessageHttpFailureStage,
  GoogleMessageRetrievalFailureStage
} from './googleMessageBatchDiagnostics'

export type GoogleMailFetch = (
  url: string,
  init: {
    method: 'GET'
    headers: Readonly<Record<string, string>>
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<{ status: number; body: ReadableStream<Uint8Array> | null }>

export type NotFoundMeaning = 'provider-failure' | 'invalid-cursor' | 'missing-message'
export class GoogleMissingMessageError extends Error {}

export const googleMailFailure = (
  code: ConstructorParameters<typeof ProviderMailAdapterError>[0],
  retryable: boolean
): ProviderMailAdapterError => new ProviderMailAdapterError(
  code,
  code === 'AUTHENTICATION_EXPIRED'
    ? 'The Google authorization has expired.'
    : code === 'PERMISSION_REVOKED'
      ? 'Google mail permission is no longer available.'
      : code === 'QUOTA_EXHAUSTED'
        ? 'Google mail access is temporarily rate limited.'
        : code === 'INVALID_CURSOR'
          ? 'The Google mail history checkpoint is no longer available.'
          : code === 'MALFORMED_PAYLOAD'
            ? 'Google returned an invalid mail response.'
            : 'Google mail is temporarily unavailable.',
  retryable
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const quotaReason = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.error) || !Array.isArray(value.error.errors)) return false
  return value.error.errors.some((item) => isRecord(item) &&
    (item.reason === 'rateLimitExceeded' || item.reason === 'userRateLimitExceeded' ||
      item.reason === 'dailyLimitExceeded'))
}

// Diagnostic-only: the existing error mapping below remains the retry-policy input.
const httpStatusStage = (status: number): GoogleMessageHttpFailureStage => {
  switch (status) {
    case 400: return 'gmail-message-http-bad-request'
    case 401: return 'gmail-message-http-unauthorized'
    case 403: return 'gmail-message-http-forbidden'
    case 404: return 'gmail-message-http-not-found'
    case 429: return 'gmail-message-http-rate-limited'
    default: return Number.isSafeInteger(status) && status >= 500 && status <= 599
      ? 'gmail-message-http-server-error' : 'gmail-message-http-unexpected-status'
  }
}

const httpReasonStage = (payload: unknown): GoogleMessageHttpFailureStage => {
  const unclassified = 'gmail-message-http-reason-unclassified'
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.errors) ||
      payload.error.errors.length === 0 || payload.error.errors.length > 16) return unclassified
  let result: GoogleMessageHttpFailureStage | undefined
  for (const item of payload.error.errors) {
    if (!isRecord(item)) return unclassified
    let next: GoogleMessageHttpFailureStage
    switch (item.reason) {
      case 'badRequest': next = 'gmail-message-http-reason-bad-request'; break
      case 'authError': next = 'gmail-message-http-reason-auth-error'; break
      case 'domainPolicy': next = 'gmail-message-http-reason-domain-policy'; break
      case 'dailyLimitExceeded': next = 'gmail-message-http-reason-daily-limit'; break
      case 'rateLimitExceeded': next = 'gmail-message-http-reason-rate-limit'; break
      case 'userRateLimitExceeded': next = 'gmail-message-http-reason-user-rate-limit'; break
      case 'backendError': next = 'gmail-message-http-reason-backend-error'; break
      default: return unclassified
    }
    if (result !== undefined && result !== next) return unclassified
    result = next
  }
  return result ?? unclassified
}

const cancelBody = (body: ReadableStream<Uint8Array> | null): void => {
  try { void body?.cancel().catch(() => undefined) } catch { /* Preserve the original outcome. */ }
}

const readBody = async (
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  signal: AbortSignal,
  setStage: (stage: GoogleMessageRetrievalFailureStage) => void
): Promise<string> => {
  if (signal.aborted) { cancelBody(body); throw new DOMException('Aborted', 'AbortError') }
  if (body === null) return ''
  const reader = body.getReader()
  const cancel = (): void => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (item.done) break
      length += item.value.byteLength
      if (length > maximumBytes) {
        setStage('gmail-message-response-limit')
        cancel()
        throw googleMailFailure('MALFORMED_PAYLOAD', false)
      }
      chunks.push(item.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch {
      setStage('gmail-message-response-encoding')
      throw googleMailFailure('MALFORMED_PAYLOAD', false)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

/** One referenced deadline covers headers and body, even for a non-cooperative transport. */
export const getGoogleMailJson = async (
  fetchRequest: GoogleMailFetch,
  path: string,
  token: string,
  signal: AbortSignal,
  maximumBytes: number,
  timeoutMs: number,
  notFoundMeaning: NotFoundMeaning,
  onFailure: (stage: GoogleMessageRetrievalFailureStage) => void
): Promise<unknown> => {
  const controller = new AbortController()
  let stage: GoogleMessageRetrievalFailureStage = 'gmail-message-transport'
  let httpStatus: GoogleMessageHttpFailureStage | undefined
  let httpReason: GoogleMessageHttpFailureStage | undefined
  const abort = (): void => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  let rejectAborted: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => reject(signal.aborted
      ? new DOMException('Aborted', 'AbortError')
      : googleMailFailure('PROVIDER_UNAVAILABLE', true))
    controller.signal.addEventListener('abort', rejectAborted, { once: true })
  })
  if (signal.aborted) abort()
  const work = async (): Promise<unknown> => {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await fetchRequest(`https://gmail.googleapis.com${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal
    })
    if (controller.signal.aborted) {
      cancelBody(response.body)
      throw new DOMException('Aborted', 'AbortError')
    }
    stage = 'gmail-message-http'
    if (response.status !== 200) httpStatus = httpStatusStage(response.status)
    if (response.status === 404) {
      cancelBody(response.body)
      if (notFoundMeaning === 'invalid-cursor') throw googleMailFailure('INVALID_CURSOR', true)
      if (notFoundMeaning === 'missing-message') throw new GoogleMissingMessageError()
      throw googleMailFailure('PROVIDER_UNAVAILABLE', false)
    }
    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      cancelBody(response.body)
      throw googleMailFailure('MALFORMED_PAYLOAD', false)
    }
    stage = 'gmail-message-response-body'
    const text = await readBody(response.body,
      response.status === 200 ? maximumBytes : 512 * 1024, controller.signal,
      (nextStage) => { stage = nextStage })
    if (response.status !== 200) {
      stage = 'gmail-message-http'
      let payload: unknown
      try { payload = JSON.parse(text) } catch { /* HTTP classification needs no raw detail. */ }
      httpReason = httpReasonStage(payload)
      if (response.status === 401) throw googleMailFailure('AUTHENTICATION_EXPIRED', false)
      if (response.status === 429 || quotaReason(payload)) throw googleMailFailure('QUOTA_EXHAUSTED', true)
      if (response.status === 403) throw googleMailFailure('PERMISSION_REVOKED', false)
      throw googleMailFailure('PROVIDER_UNAVAILABLE', response.status >= 500)
    }
    stage = 'gmail-message-json'
    try { return JSON.parse(text) }
    catch { throw googleMailFailure('MALFORMED_PAYLOAD', false) }
  }
  try {
    return await Promise.race([work(), aborted])
  } catch (error) {
    if (!(error instanceof GoogleMissingMessageError) && !signal.aborted) {
      for (const failureStage of [httpStatus, httpReason, stage]) {
        if (failureStage === undefined) continue
        try { onFailure(failureStage) } catch { /* Diagnostics cannot change behavior. */ }
      }
    }
    if (signal.aborted || error instanceof ProviderMailAdapterError ||
        error instanceof GoogleMissingMessageError) throw error
    throw googleMailFailure('PROVIDER_UNAVAILABLE', true)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAborted)
  }
}
