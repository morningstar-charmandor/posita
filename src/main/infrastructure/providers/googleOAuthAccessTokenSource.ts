import { isAccountId } from '../../application/accountState'
import {
  MAX_SECRET_LENGTH,
  googleRefreshTokenName,
  type SecretVault
} from '../../application/secretVault'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const MAX_RESPONSE_BYTES = 16 * 1024
const DEFAULT_TIMEOUT_MS = 15_000
const EXPIRY_SKEW_MS = 60_000
const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,480}\.apps\.googleusercontent\.com$/

type JsonRecord = Record<string, unknown>

export interface GoogleAccessTokenSource {
  getAccessToken(accountId: string, signal: AbortSignal): Promise<string | undefined>
}

export interface GoogleOAuthClientConfiguration {
  clientId: string
}

export interface GoogleAccessTokenClock {
  now(): Date
}

export interface GoogleAccessTokenHttpResponse {
  status: number
  body: ReadableStream<Uint8Array> | null
}

export type GoogleAccessTokenFetch = (
  url: string,
  init: {
    method: 'POST'
    headers: Readonly<Record<string, string>>
    body: string
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<GoogleAccessTokenHttpResponse>

export type GoogleAccessTokenErrorCode =
  | 'INVALID_ACCESS_TOKEN_REQUEST'
  | 'ACCESS_TOKEN_STORAGE_FAILED'
  | 'ACCESS_TOKEN_AUTHORIZATION_EXPIRED'
  | 'ACCESS_TOKEN_PROVIDER_UNAVAILABLE'
  | 'ACCESS_TOKEN_RESPONSE_INVALID'

export class GoogleAccessTokenError extends Error {
  constructor(
    readonly code: GoogleAccessTokenErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'GoogleAccessTokenError'
  }
}

interface CachedAccessToken {
  token: string
  expiresAtMs: number
}

interface PendingRefresh {
  controller: AbortController
  promise: Promise<string | undefined>
  waiters: number
  settled: boolean
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key))

const invalidRequest = (cause?: unknown): GoogleAccessTokenError =>
  new GoogleAccessTokenError(
    'INVALID_ACCESS_TOKEN_REQUEST',
    'The Google access-token request is invalid.',
    false,
    cause === undefined ? undefined : { cause }
  )

const storageFailure = (cause?: unknown): GoogleAccessTokenError =>
  new GoogleAccessTokenError(
    'ACCESS_TOKEN_STORAGE_FAILED',
    'The protected Google authorization could not be read.',
    true,
    cause === undefined ? undefined : { cause }
  )

const authorizationExpired = (cause?: unknown): GoogleAccessTokenError =>
  new GoogleAccessTokenError(
    'ACCESS_TOKEN_AUTHORIZATION_EXPIRED',
    'The Google authorization has expired.',
    false,
    cause === undefined ? undefined : { cause }
  )

const providerUnavailable = (
  retryable: boolean,
  cause?: unknown
): GoogleAccessTokenError => new GoogleAccessTokenError(
  'ACCESS_TOKEN_PROVIDER_UNAVAILABLE',
  'Google authorization is temporarily unavailable.',
  retryable,
  cause === undefined ? undefined : { cause }
)

const invalidResponse = (cause?: unknown): GoogleAccessTokenError =>
  new GoogleAccessTokenError(
    'ACCESS_TOKEN_RESPONSE_INVALID',
    'Google returned an invalid authorization response.',
    false,
    cause === undefined ? undefined : { cause }
  )

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError')

const readBoundedBody = async (
  body: ReadableStream<Uint8Array> | null
): Promise<string> => {
  if (body === null) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw invalidResponse()
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(joined)
  } catch (error) {
    throw invalidResponse(error)
  }
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw invalidResponse(error)
  }
}

const isExpiredGrant = (value: unknown): boolean =>
  isRecord(value) && hasOnlyKeys(value, ['error', 'error_description']) &&
  value.error === 'invalid_grant' &&
  (value.error_description === undefined ||
    (typeof value.error_description === 'string' && value.error_description.length <= 1_024))

const parseTokenResponse = (
  value: unknown,
  issuedAtMs: number
): CachedAccessToken => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'access_token', 'expires_in', 'scope', 'token_type'
  ]) || typeof value.access_token !== 'string' ||
      !/^[\u0021-\u007E]+$/.test(value.access_token) ||
      value.access_token.length > MAX_SECRET_LENGTH ||
      !Number.isSafeInteger(value.expires_in) ||
      (value.expires_in as number) < 1 ||
      (value.expires_in as number) > MAX_TOKEN_LIFETIME_SECONDS ||
      (value.token_type !== undefined && value.token_type !== 'Bearer') ||
      (value.scope !== undefined && value.scope !== GOOGLE_GMAIL_READONLY_SCOPE)) {
    throw invalidResponse()
  }
  return {
    token: value.access_token,
    expiresAtMs: issuedAtMs + (value.expires_in as number) * 1_000
  }
}

/**
 * Trusted-main, memory-only refresh-token exchange for the Gmail read adapter.
 * It is deliberately uncomposed until OAuth configuration and activation are approved.
 */
export class GoogleOAuthAccessTokenSource implements GoogleAccessTokenSource {
  private readonly cache = new Map<string, CachedAccessToken>()
  private readonly pending = new Map<string, PendingRefresh>()
  private destroyed = false

  constructor(
    private readonly vault: Pick<SecretVault, 'get'>,
    private readonly configuration: GoogleOAuthClientConfiguration,
    private readonly fetchRequest: GoogleAccessTokenFetch = (url, init) => fetch(url, init),
    private readonly clock: GoogleAccessTokenClock = { now: () => new Date() },
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    if (!CLIENT_ID_PATTERN.test(configuration.clientId) ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000 ||
        !Number.isFinite(clock.now().getTime())) {
      throw invalidRequest()
    }
  }

  async getAccessToken(accountId: string, signal: AbortSignal): Promise<string | undefined> {
    if (this.destroyed || !isAccountId(accountId)) throw invalidRequest()
    if (signal.aborted) throw abortError()
    const now = this.clock.now().getTime()
    if (!Number.isFinite(now)) throw invalidRequest()
    const cached = this.cache.get(accountId)
    if (cached !== undefined && now < cached.expiresAtMs - EXPIRY_SKEW_MS) {
      return cached.token
    }
    this.cache.delete(accountId)
    let pending = this.pending.get(accountId)
    if (pending === undefined) {
      const controller = new AbortController()
      pending = {
        controller,
        waiters: 0,
        settled: false,
        promise: Promise.resolve(undefined)
      }
      const active = pending
      active.promise = this.refresh(accountId, controller.signal).finally(() => {
        active.settled = true
        if (this.pending.get(accountId) === active) this.pending.delete(accountId)
      })
      this.pending.set(accountId, active)
    }
    return this.waitForRefresh(pending, signal)
  }

  invalidate(accountId: string): void {
    if (!isAccountId(accountId)) throw invalidRequest()
    this.cache.delete(accountId)
    const refresh = this.pending.get(accountId)
    if (refresh !== undefined) {
      this.pending.delete(accountId)
      refresh.controller.abort()
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.cache.clear()
    for (const refresh of this.pending.values()) refresh.controller.abort()
    this.pending.clear()
  }

  private waitForRefresh(refresh: PendingRefresh, signal: AbortSignal): Promise<string | undefined> {
    refresh.waiters += 1
    return new Promise((resolve, reject) => {
      let released = false
      const release = (): void => {
        if (released) return
        released = true
        signal.removeEventListener('abort', onAbort)
        refresh.waiters -= 1
        if (refresh.waiters === 0 && !refresh.settled) refresh.controller.abort()
      }
      const onAbort = (): void => {
        release()
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
        return
      }
      void refresh.promise.then(
        (token) => { release(); resolve(token) },
        (error: unknown) => { release(); reject(error) }
      )
    })
  }

  private async refresh(accountId: string, signal: AbortSignal): Promise<string | undefined> {
    let refreshToken: string | undefined
    try {
      refreshToken = await this.vault.get(googleRefreshTokenName(accountId))
    } catch (error) {
      throw storageFailure(error)
    }
    if (signal.aborted) throw abortError()
    if (refreshToken === undefined) return undefined
    if (refreshToken.length === 0 || refreshToken.length > MAX_SECRET_LENGTH) {
      throw authorizationExpired()
    }
    const issuedAtMs = this.clock.now().getTime()
    if (!Number.isFinite(issuedAtMs)) throw invalidRequest()
    let response: GoogleAccessTokenHttpResponse
    try {
      response = await this.fetchRequest(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: new URLSearchParams({
          client_id: this.configuration.clientId,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }).toString(),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      })
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (error instanceof GoogleAccessTokenError) throw error
      throw providerUnavailable(true, error)
    }
    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      try { await response.body?.cancel() } catch { /* Preserve safe classification. */ }
      throw invalidResponse()
    }
    const text = await readBoundedBody(response.body)
    if (response.status !== 200) {
      if (response.status === 400) {
        const payload = text.length === 0 ? undefined : parseJson(text)
        if (isExpiredGrant(payload)) throw authorizationExpired()
      }
      throw providerUnavailable(response.status === 429 || response.status >= 500)
    }
    const token = parseTokenResponse(parseJson(text), issuedAtMs)
    if (!this.destroyed && !signal.aborted) this.cache.set(accountId, token)
    return token.token
  }
}
