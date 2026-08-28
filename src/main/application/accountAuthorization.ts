import { GOOGLE_CONNECT_CONSENT } from '../../shared/contracts'
import { isAccountId, type MailProvider } from './accountState'

export const GOOGLE_READONLY_SCOPES = Object.freeze(['gmail.readonly'] as const)

export interface BeginAccountAuthorizationRequestV1 {
  version: 1
  accountId: string
  provider: MailProvider
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
  requestedScopes: typeof GOOGLE_READONLY_SCOPES
}

export interface AccountAuthorizationLaunchV1 {
  version: 1
  sessionId: string
  accountId: string
  provider: MailProvider
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
  authorizationUrl: string
  expiresAt: string
}

export interface CompleteAccountAuthorizationRequestV1 {
  version: 1
  sessionId: string
  callbackUrl: string
}

/** Trusted main-process result. The refresh token must be moved directly to SecretVault. */
export interface AuthorizedAccountGrantV1 {
  version: 1
  sessionId: string
  accountId: string
  provider: MailProvider
  providerAccountId: string
  consentVersion: typeof GOOGLE_CONNECT_CONSENT.consentVersion
  connectedAt: string
  refreshToken: string
}

export interface AccountAuthorizationAdapter {
  begin(request: BeginAccountAuthorizationRequestV1): Promise<AccountAuthorizationLaunchV1>
  complete(request: CompleteAccountAuthorizationRequestV1): Promise<AuthorizedAccountGrantV1>
  cancel(sessionId: string): Promise<boolean>
}

export type AccountAuthorizationErrorCode =
  | 'INVALID_AUTHORIZATION_REQUEST'
  | 'AUTHORIZATION_IN_PROGRESS'
  | 'AUTHORIZATION_SESSION_NOT_FOUND'
  | 'AUTHORIZATION_SESSION_EXPIRED'
  | 'AUTHORIZATION_CALLBACK_REJECTED'
  | 'AUTHORIZATION_PROVIDER_UNAVAILABLE'

export class AccountAuthorizationError extends Error {
  constructor(
    readonly code: AccountAuthorizationErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AccountAuthorizationError'
  }
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const PROVIDER_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9._:@+-]{1,512}$/
const MAX_URL_LENGTH = 4096
const MAX_REFRESH_TOKEN_LENGTH = 16_384

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

export const isAuthorizationSessionId = (value: unknown): value is string =>
  typeof value === 'string' && SESSION_ID_PATTERN.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))

const parseUrl = (value: unknown): URL | undefined => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return undefined
  }
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

const isAuthorizationUrl = (value: unknown): value is string => {
  const url = parseUrl(value)
  return url !== undefined && url.protocol === 'https:' && url.hostname.length > 0 &&
    url.username === '' && url.password === '' && url.hash === ''
}

const isLoopbackCallbackUrl = (value: unknown): value is string => {
  const url = parseUrl(value)
  return url !== undefined && url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === 'localhost') &&
    url.port.length > 0 && url.username === '' && url.password === '' && url.hash === ''
}

export const isBeginAccountAuthorizationRequestV1 = (
  value: unknown
): value is BeginAccountAuthorizationRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'accountId', 'provider', 'consentVersion', 'requestedScopes'
  ]) && value.version === 1 && isAccountId(value.accountId) &&
  value.provider === 'google' &&
  value.consentVersion === GOOGLE_CONNECT_CONSENT.consentVersion &&
  Array.isArray(value.requestedScopes) && value.requestedScopes.length === 1 &&
  value.requestedScopes[0] === GOOGLE_READONLY_SCOPES[0]

export const isAccountAuthorizationLaunchV1 = (
  value: unknown
): value is AccountAuthorizationLaunchV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'sessionId', 'accountId', 'provider', 'consentVersion',
    'authorizationUrl', 'expiresAt'
  ]) && value.version === 1 && isAuthorizationSessionId(value.sessionId) &&
  isAccountId(value.accountId) && value.provider === 'google' &&
  value.consentVersion === GOOGLE_CONNECT_CONSENT.consentVersion &&
  isAuthorizationUrl(value.authorizationUrl) && isTimestamp(value.expiresAt)

export const isCompleteAccountAuthorizationRequestV1 = (
  value: unknown
): value is CompleteAccountAuthorizationRequestV1 =>
  isRecord(value) && hasOnlyKeys(value, ['version', 'sessionId', 'callbackUrl']) &&
  value.version === 1 && isAuthorizationSessionId(value.sessionId) &&
  isLoopbackCallbackUrl(value.callbackUrl)

export const isAuthorizedAccountGrantV1 = (
  value: unknown
): value is AuthorizedAccountGrantV1 =>
  isRecord(value) && hasOnlyKeys(value, [
    'version', 'sessionId', 'accountId', 'provider', 'providerAccountId',
    'consentVersion', 'connectedAt', 'refreshToken'
  ]) && value.version === 1 && isAuthorizationSessionId(value.sessionId) &&
  isAccountId(value.accountId) && value.provider === 'google' &&
  typeof value.providerAccountId === 'string' &&
  PROVIDER_ACCOUNT_ID_PATTERN.test(value.providerAccountId) &&
  value.consentVersion === GOOGLE_CONNECT_CONSENT.consentVersion &&
  isTimestamp(value.connectedAt) && typeof value.refreshToken === 'string' &&
  value.refreshToken.length > 0 && value.refreshToken.length <= MAX_REFRESH_TOKEN_LENGTH
