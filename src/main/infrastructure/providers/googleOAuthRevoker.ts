import { isAccountId } from '../../application/accountState'
import type { AccountAuthorizationRevoker } from '../../application/disconnectAccount'
import {
  MAX_SECRET_LENGTH,
  googleRefreshTokenName,
  type SecretVault
} from '../../application/secretVault'

const GOOGLE_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const MAX_RESPONSE_BYTES = 4_096
const DEFAULT_TIMEOUT_MS = 15_000

export interface GoogleOAuthHttpResponse {
  status: number
  body: ReadableStream<Uint8Array> | null
}

export type GoogleOAuthFetch = (
  url: string,
  init: {
    method: 'POST'
    headers: Readonly<Record<string, string>>
    body: string
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<GoogleOAuthHttpResponse>

export type GoogleOAuthRevocationErrorCode =
  | 'INVALID_REVOCATION_REQUEST'
  | 'REVOCATION_STORAGE_FAILED'
  | 'REVOCATION_PROVIDER_UNAVAILABLE'

export class GoogleOAuthRevocationError extends Error {
  constructor(
    readonly code: GoogleOAuthRevocationErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'GoogleOAuthRevocationError'
  }
}

const invalidRequest = (cause?: unknown): GoogleOAuthRevocationError =>
  new GoogleOAuthRevocationError(
    'INVALID_REVOCATION_REQUEST',
    'The Google authorization revocation request is invalid.',
    false,
    { cause }
  )

const providerUnavailable = (retryable: boolean, cause?: unknown): GoogleOAuthRevocationError =>
  new GoogleOAuthRevocationError(
    'REVOCATION_PROVIDER_UNAVAILABLE',
    'Google authorization revocation is unavailable.',
    retryable,
    { cause }
  )

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
        throw providerUnavailable(false)
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
  return new TextDecoder('utf-8', { fatal: true }).decode(joined)
}

const isInvalidTokenResponse = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const response = value as Record<string, unknown>
  return Object.keys(response).every((key) => key === 'error' || key === 'error_description') &&
    response.error === 'invalid_token' &&
    (response.error_description === undefined || typeof response.error_description === 'string')
}

/**
 * Main-process-only Google OAuth revocation adapter.
 *
 * Production constructs it inside the provider-inert lifecycle composition. An
 * absent or already invalid token is treated as the
 * idempotent success required by the disconnect journal.
 */
export class GoogleOAuthRevoker implements AccountAuthorizationRevoker {
  constructor(
    private readonly vault: Pick<SecretVault, 'get'>,
    private readonly fetchRequest: GoogleOAuthFetch = (url, init) => fetch(url, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw invalidRequest()
    }
  }

  async revoke(accountId: string): Promise<void> {
    if (!isAccountId(accountId)) throw invalidRequest()
    let token: string | undefined
    try {
      token = await this.vault.get(googleRefreshTokenName(accountId))
    } catch (error) {
      throw new GoogleOAuthRevocationError(
        'REVOCATION_STORAGE_FAILED',
        'The protected Google authorization could not be read.',
        true,
        { cause: error }
      )
    }
    if (token === undefined) return
    if (token.length === 0 || token.length > MAX_SECRET_LENGTH) throw invalidRequest()

    let response: GoogleOAuthHttpResponse
    try {
      response = await this.fetchRequest(GOOGLE_REVOCATION_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (error) {
      if (error instanceof GoogleOAuthRevocationError) throw error
      throw providerUnavailable(true, error)
    }

    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      throw providerUnavailable(false)
    }
    if (response.status === 200) {
      try { await response.body?.cancel() } catch { /* Revocation already succeeded. */ }
      return
    }
    if (response.status !== 400) {
      try { await response.body?.cancel() } catch { /* Preserve the HTTP failure classification. */ }
      throw providerUnavailable(response.status === 429 || response.status >= 500)
    }

    let errorPayload: unknown
    try {
      const text = await readBoundedBody(response.body)
      errorPayload = text.length === 0 ? undefined : JSON.parse(text)
    } catch (error) {
      if (error instanceof GoogleOAuthRevocationError) throw error
      throw providerUnavailable(false, error)
    }
    if (isInvalidTokenResponse(errorPayload)) return
    throw providerUnavailable(false)
  }
}
