import { createHash, randomBytes } from 'node:crypto'
import { GOOGLE_CONNECT_SCOPES } from '../../../shared/contracts'
import {
  AccountAuthorizationError,
  isAccountAuthorizationLaunchV1,
  isAuthorizationSessionId,
  isAuthorizedAccountGrantV2,
  isBeginAccountAuthorizationRequestV1,
  isCompleteAccountAuthorizationRequestV1,
  type AccountAuthorizationAdapter,
  type AccountAuthorizationLaunchV1,
  type AuthorizedAccountGrantV2,
  type BeginAccountAuthorizationRequestV1,
  type CompleteAccountAuthorizationRequestV1
} from '../../application/accountAuthorization'
import { MAX_SECRET_LENGTH } from '../../application/secretVault'
import type { GoogleOAuthRedirectUriSource } from './googleOAuthLoopbackRedirectServer'
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_OAUTH_CLIENT_ID_PATTERN,
  isExactGoogleLoopbackRedirect,
  parseBoundedGoogleOAuthUrl,
  safelyEqualGoogleOAuthValue
} from './googleOAuthProtocol'
import {
  GoogleTokenExchangeFailure,
  parseGoogleTokenExchangeFailure
} from './googleOAuthTokenExchangeFailure'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_GMAIL_PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
const SESSION_LIFETIME_MS = 5 * 60 * 1_000
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 32 * 1_024
const MAX_REFRESH_TOKEN_LIFETIME_SECONDS = 10 * 365 * 24 * 60 * 60
const OPAQUE_VALUE_PATTERN = /^[\u0021-\u007E]+$/
const PROVIDER_SUBJECT_PATTERN = /^[A-Za-z0-9._:@+-]{1,255}$/
const MAILBOX_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+$/
const GOOGLE_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const GOOGLE_CALLBACK_ISSUER = 'https://accounts.google.com'
const GOOGLE_CALLBACK_AUTHUSER_PATTERN = /^\d{1,3}$/
const GOOGLE_CALLBACK_HOSTED_DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

type JsonRecord = Record<string, unknown>

export interface GoogleOAuthRandomSource {
  bytes(length: number): Uint8Array
}

export interface GoogleOAuthClock {
  now(): Date
}

export interface GoogleOAuthHttpResponse {
  status: number
  body: ReadableStream<Uint8Array> | null
}

export type GoogleAccountAuthorizationFetch = (
  url: string,
  init: {
    method: 'GET' | 'POST'
    headers: Readonly<Record<string, string>>
    body?: string
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<GoogleOAuthHttpResponse>

interface ActiveSession {
  launch: AccountAuthorizationLaunchV1
  state: string
  verifier: string
  redirectUri: string
  controller: AbortController
  completing: boolean
  released: boolean
}

interface GoogleTokenGrant {
  accessToken: string
  refreshToken: string
}

type GoogleAuthorizationVerificationStage = 'token exchange' | 'Google identity' | 'Gmail profile'

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonRecord, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key))

const invalidRequest = (cause?: unknown): AccountAuthorizationError =>
  new AccountAuthorizationError(
    'INVALID_AUTHORIZATION_REQUEST',
    'The authorization request is invalid.',
    false,
    cause === undefined ? undefined : { cause }
  )

const providerUnavailable = (cause?: unknown): AccountAuthorizationError =>
  new AccountAuthorizationError(
    'AUTHORIZATION_PROVIDER_UNAVAILABLE',
    'The authorization provider is temporarily unavailable.',
    true,
    cause === undefined ? undefined : { cause }
  )

const restartRequired = (
  retryable: boolean,
  cause?: unknown
): AccountAuthorizationError => new AccountAuthorizationError(
  'AUTHORIZATION_RESTART_REQUIRED',
  'Google authorization could not be completed. Start again.',
  retryable,
  cause === undefined ? undefined : { cause }
)

const callbackRejected = (): AccountAuthorizationError => new AccountAuthorizationError(
  'AUTHORIZATION_CALLBACK_REJECTED',
  'The authorization callback could not be verified.',
  false
)

const restartRequiredAt = (
  stage: GoogleAuthorizationVerificationStage,
  cause: unknown
): AccountAuthorizationError => {
  if (stage === 'token exchange' && cause instanceof GoogleTokenExchangeFailure) {
    return new AccountAuthorizationError(
      'AUTHORIZATION_RESTART_REQUIRED',
      cause.message,
      cause.retryable,
      { cause }
    )
  }
  return new AccountAuthorizationError(
    'AUTHORIZATION_RESTART_REQUIRED',
    `The ${stage} response could not be verified. Start again.`,
    cause instanceof AccountAuthorizationError ? cause.retryable : true,
    { cause }
  )
}

const randomValue = (source: GoogleOAuthRandomSource, length: number): string => {
  const value = source.bytes(length)
  if (!(value instanceof Uint8Array) || value.byteLength !== length) throw invalidRequest()
  return Buffer.from(value).toString('base64url')
}

const hasExactReviewedScopes = (value: unknown): boolean => {
  if (typeof value !== 'string' || value.length > 1_024) return false
  const scopes = value.split(' ').filter((scope) => scope.length > 0)
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return false
  const normalized = new Set(scopes.map((scope) =>
    scope === GOOGLE_EMAIL_SCOPE ? 'email' : scope))
  return normalized.size === GOOGLE_CONNECT_SCOPES.length &&
    GOOGLE_CONNECT_SCOPES.every((scope) => normalized.has(scope))
}

const hasValidCallbackMetadata = (callback: URL): boolean => {
  const optionalKeys = ['iss', 'scope', 'authuser', 'hd', 'prompt'] as const
  const allowedKeys = new Set(['state', 'code', 'error', ...optionalKeys])
  const keys = [...callback.searchParams.keys()]
  if (keys.some((key) => !allowedKeys.has(key)) ||
      optionalKeys.some((key) => callback.searchParams.getAll(key).length > 1)) return false

  const issuer = callback.searchParams.get('iss')
  const scopes = callback.searchParams.get('scope')
  const authuser = callback.searchParams.get('authuser')
  const hostedDomain = callback.searchParams.get('hd')
  const prompt = callback.searchParams.get('prompt')
  return (issuer === null || issuer === GOOGLE_CALLBACK_ISSUER) &&
    (scopes === null || hasExactReviewedScopes(scopes)) &&
    (authuser === null || GOOGLE_CALLBACK_AUTHUSER_PATTERN.test(authuser)) &&
    (hostedDomain === null || GOOGLE_CALLBACK_HOSTED_DOMAIN_PATTERN.test(hostedDomain)) &&
    (prompt === null || prompt === 'consent')
}

const readBoundedBody = async (body: ReadableStream<Uint8Array> | null): Promise<string> => {
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
        throw restartRequired(false)
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw restartRequired(false, error)
  }
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw restartRequired(false, error)
  }
}

const parseTokenGrant = (value: unknown): GoogleTokenGrant => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'access_token', 'expires_in', 'refresh_token', 'refresh_token_expires_in',
    'scope', 'token_type', 'id_token'
  ]) || typeof value.access_token !== 'string' || value.access_token.length === 0 ||
      value.access_token.length > MAX_SECRET_LENGTH ||
      !OPAQUE_VALUE_PATTERN.test(value.access_token) ||
      typeof value.refresh_token !== 'string' || value.refresh_token.length === 0 ||
      value.refresh_token.length > MAX_SECRET_LENGTH ||
      !OPAQUE_VALUE_PATTERN.test(value.refresh_token) ||
      !Number.isSafeInteger(value.expires_in) || (value.expires_in as number) < 1 ||
      (value.expires_in as number) > 24 * 60 * 60 ||
      value.token_type !== 'Bearer' ||
      (value.scope !== undefined && !hasExactReviewedScopes(value.scope)) ||
      (value.refresh_token_expires_in !== undefined &&
        (!Number.isSafeInteger(value.refresh_token_expires_in) ||
          (value.refresh_token_expires_in as number) < 1 ||
          (value.refresh_token_expires_in as number) > MAX_REFRESH_TOKEN_LIFETIME_SECONDS)) ||
      (value.id_token !== undefined &&
        (typeof value.id_token !== 'string' || value.id_token.length === 0 ||
          value.id_token.length > MAX_SECRET_LENGTH ||
          !OPAQUE_VALUE_PATTERN.test(value.id_token)))) {
    throw restartRequired(false)
  }
  return { accessToken: value.access_token, refreshToken: value.refresh_token }
}

const parseVerifiedIdentity = (value: unknown): { subject: string; email: string } => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'sub', 'email', 'email_verified', 'hd', 'name', 'given_name', 'family_name',
    'picture', 'locale'
  ]) || typeof value.sub !== 'string' || !PROVIDER_SUBJECT_PATTERN.test(value.sub) ||
      typeof value.email !== 'string' || value.email.length > 320 ||
      !MAILBOX_ADDRESS_PATTERN.test(value.email) || value.email_verified !== true) {
    throw restartRequired(false)
  }
  return { subject: value.sub, email: value.email }
}

const parseMailboxAddress = (value: unknown): string => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'emailAddress', 'messagesTotal', 'threadsTotal', 'historyId'
  ]) || typeof value.emailAddress !== 'string' || value.emailAddress.length > 320 ||
      !MAILBOX_ADDRESS_PATTERN.test(value.emailAddress) ||
      !Number.isSafeInteger(value.messagesTotal) || (value.messagesTotal as number) < 0 ||
      !Number.isSafeInteger(value.threadsTotal) || (value.threadsTotal as number) < 0 ||
      typeof value.historyId !== 'string' || !/^\d+$/.test(value.historyId)) {
    throw restartRequired(false)
  }
  return value.emailAddress
}

/**
 * Real Google Authorization Code + PKCE protocol adapter with injected loopback
 * and HTTP boundaries. Production constructs it behind an inactive command boundary;
 * it cannot open a browser by itself.
 */
export class GoogleDesktopAccountAuthorizationAdapter implements AccountAuthorizationAdapter {
  private active?: ActiveSession

  constructor(
    private readonly clientId: string,
    private readonly redirects: GoogleOAuthRedirectUriSource,
    private readonly fetchRequest: GoogleAccountAuthorizationFetch = (url, init) =>
      fetch(url, init),
    private readonly clock: GoogleOAuthClock = { now: () => new Date() },
    private readonly random: GoogleOAuthRandomSource = {
      bytes: (length) => randomBytes(length)
    },
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    if (!GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(clientId) ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000 ||
        !Number.isFinite(clock.now().getTime())) throw invalidRequest()
  }

  async begin(request: BeginAccountAuthorizationRequestV1): Promise<AccountAuthorizationLaunchV1> {
    if (!isBeginAccountAuthorizationRequestV1(request)) throw invalidRequest()
    if (this.active !== undefined) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_IN_PROGRESS',
        'An account authorization session is already pending.',
        false
      )
    }
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime())) throw invalidRequest()
    const sessionId = randomValue(this.random, 32)
    const state = randomValue(this.random, 32)
    const verifier = randomValue(this.random, 64)
    if (!isAuthorizationSessionId(sessionId) || verifier.length < 43 || verifier.length > 128) {
      throw invalidRequest()
    }
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url')
    let redirectUri: string
    try {
      redirectUri = await this.redirects.prepare(sessionId, state)
    } catch (error) {
      throw providerUnavailable(error)
    }
    if (!isExactGoogleLoopbackRedirect(redirectUri)) {
      try { await this.redirects.release(sessionId) } catch { /* Preserve invalid boundary. */ }
      throw invalidRequest()
    }
    const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT)
    authorizationUrl.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CONNECT_SCOPES.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent'
    }).toString()
    const launch: AccountAuthorizationLaunchV1 = {
      version: 1,
      sessionId,
      accountId: request.accountId,
      provider: 'google',
      consentVersion: request.consentVersion,
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString()
    }
    if (!isAccountAuthorizationLaunchV1(launch)) {
      try { await this.redirects.release(sessionId) } catch { /* Preserve invalid boundary. */ }
      throw invalidRequest()
    }
    this.active = {
      launch,
      state,
      verifier,
      redirectUri,
      controller: new AbortController(),
      completing: false,
      released: false
    }
    return launch
  }

  async complete(request: CompleteAccountAuthorizationRequestV1): Promise<AuthorizedAccountGrantV2> {
    if (!isCompleteAccountAuthorizationRequestV1(request)) throw invalidRequest()
    const session = this.active
    if (session === undefined || session.launch.sessionId !== request.sessionId) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_NOT_FOUND',
        'The authorization session is unavailable.',
        false
      )
    }
    if (session.completing) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_IN_PROGRESS',
        'Authorization completion is already in progress.',
        false
      )
    }
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime())) throw invalidRequest()
    if (now.getTime() >= Date.parse(session.launch.expiresAt)) {
      this.clearActive(session)
      session.controller.abort()
      await this.release(session)
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_EXPIRED',
        'The authorization session expired. Start again.',
        true
      )
    }
    const callback = this.parseCallback(request.callbackUrl, session)
    if (callback.type === 'rejected') throw callbackRejected()
    if (callback.type === 'declined') {
      this.clearActive(session)
      session.controller.abort()
      await this.release(session)
      throw new AccountAuthorizationError(
        'AUTHORIZATION_DECLINED',
        'Google authorization was not approved.',
        false
      )
    }

    session.completing = true
    try {
      const token = await this.verifyStage(
        'token exchange',
        () => this.exchangeCode(callback.code, session)
      )
      const identity = await this.verifyStage(
        'Google identity',
        () => this.loadIdentity(token.accessToken, session.controller.signal)
      )
      const mailboxAddress = await this.verifyStage(
        'Gmail profile',
        () => this.loadMailboxAddress(token.accessToken, session.controller.signal)
      )
      if (identity.email.toLowerCase() !== mailboxAddress.toLowerCase()) {
        throw restartRequired(false)
      }
      const connectedAt = this.clock.now()
      const grant: AuthorizedAccountGrantV2 = {
        version: 2,
        sessionId: session.launch.sessionId,
        accountId: session.launch.accountId,
        provider: 'google',
        providerAccountId: identity.subject,
        mailboxAddress,
        consentVersion: session.launch.consentVersion,
        connectedAt: connectedAt.toISOString(),
        refreshToken: token.refreshToken
      }
      if (!Number.isFinite(connectedAt.getTime()) || !isAuthorizedAccountGrantV2(grant)) {
        throw restartRequired(false)
      }
      this.clearActive(session)
      await this.release(session)
      return grant
    } catch (error) {
      this.clearActive(session)
      session.controller.abort()
      try {
        await this.release(session)
      } catch (releaseError) {
        throw restartRequired(false, new AggregateError([error, releaseError]))
      }
      if (error instanceof AccountAuthorizationError) throw error
      throw restartRequired(true, error)
    }
  }

  async cancel(sessionId: string): Promise<boolean> {
    if (!isAuthorizationSessionId(sessionId)) throw invalidRequest()
    const session = this.active
    if (session === undefined || session.launch.sessionId !== sessionId) return false
    this.clearActive(session)
    session.controller.abort()
    try {
      await this.release(session)
    } catch (error) {
      throw providerUnavailable(error)
    }
    return true
  }

  private parseCallback(
    value: string,
    session: ActiveSession
  ): { type: 'code'; code: string } | { type: 'declined' } | { type: 'rejected' } {
    const callback = parseBoundedGoogleOAuthUrl(value)
    const expected = parseBoundedGoogleOAuthUrl(session.redirectUri)
    if (callback === undefined || expected === undefined || callback.hash !== '' ||
        callback.origin !== expected.origin || callback.pathname !== expected.pathname ||
        callback.username !== '' || callback.password !== '') return { type: 'rejected' }
    const stateValues = callback.searchParams.getAll('state')
    if (stateValues.length !== 1 ||
        !safelyEqualGoogleOAuthValue(stateValues[0]!, session.state)) {
      return { type: 'rejected' }
    }
    const codeValues = callback.searchParams.getAll('code')
    const errorValues = callback.searchParams.getAll('error')
    if (errorValues.length === 1 && errorValues[0] === 'access_denied' &&
        codeValues.length === 0 && hasValidCallbackMetadata(callback)) {
      return { type: 'declined' }
    }
    if (codeValues.length !== 1 || errorValues.length !== 0 ||
        !hasValidCallbackMetadata(callback) ||
        codeValues[0]!.length === 0 || codeValues[0]!.length > 2_048 ||
        !OPAQUE_VALUE_PATTERN.test(codeValues[0]!)) return { type: 'rejected' }
    return { type: 'code', code: codeValues[0]! }
  }

  private async exchangeCode(code: string, session: ActiveSession): Promise<GoogleTokenGrant> {
    const value = await this.requestJson(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: session.verifier,
        redirect_uri: session.redirectUri,
        grant_type: 'authorization_code'
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.any([
        session.controller.signal,
        AbortSignal.timeout(this.timeoutMs)
      ])
    })
    return parseTokenGrant(value)
  }

  private async verifyStage<T>(
    stage: GoogleAuthorizationVerificationStage,
    action: () => Promise<T>
  ): Promise<T> {
    try {
      return await action()
    } catch (error) {
      throw restartRequiredAt(stage, error)
    }
  }

  private async loadIdentity(accessToken: string, signal: AbortSignal): Promise<{
    subject: string
    email: string
  }> {
    const value = await this.requestJson(GOOGLE_USERINFO_ENDPOINT, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
    })
    return parseVerifiedIdentity(value)
  }

  private async loadMailboxAddress(accessToken: string, signal: AbortSignal): Promise<string> {
    const value = await this.requestJson(GOOGLE_GMAIL_PROFILE_ENDPOINT, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
    })
    return parseMailboxAddress(value)
  }

  private async requestJson(
    url: string,
    init: Parameters<GoogleAccountAuthorizationFetch>[1]
  ): Promise<unknown> {
    let response: GoogleOAuthHttpResponse
    try {
      response = await this.fetchRequest(url, init)
    } catch (error) {
      if (init.signal.aborted) throw restartRequired(true, error)
      throw restartRequired(true, error)
    }
    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      try { await response.body?.cancel() } catch { /* Preserve safe classification. */ }
      throw restartRequired(false)
    }
    const text = await readBoundedBody(response.body)
    if (response.status !== 200) {
      if (url === GOOGLE_TOKEN_ENDPOINT) {
        throw parseGoogleTokenExchangeFailure(text, response.status)
      }
      throw restartRequired(response.status === 429 || response.status >= 500)
    }
    return parseJson(text)
  }

  private clearActive(session: ActiveSession): void {
    if (this.active === session) this.active = undefined
  }

  private async release(session: ActiveSession): Promise<void> {
    if (session.released) return
    await this.redirects.release(session.launch.sessionId)
    session.released = true
  }
}
