import { timingSafeEqual } from 'node:crypto'
import { GOOGLE_CONNECT_SCOPES } from '../../../shared/contracts'

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_OAUTH_CALLBACK_PATH = '/oauth/google/callback'
export const GOOGLE_OAUTH_MAX_URL_LENGTH = 4_096
export const GOOGLE_OAUTH_CLIENT_ID_PATTERN =
  /^[A-Za-z0-9._-]{1,480}\.apps\.googleusercontent\.com$/
export const GOOGLE_OAUTH_CLIENT_SECRET_PATTERN = /^[\u0021-\u007E]{16,256}$/
export const GOOGLE_OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const GOOGLE_OAUTH_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const parseBoundedGoogleOAuthUrl = (value: string): URL | undefined => {
  if (value.length === 0 || value.length > GOOGLE_OAUTH_MAX_URL_LENGTH) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

export const isExactGoogleLoopbackRedirect = (value: string): boolean => {
  const url = parseBoundedGoogleOAuthUrl(value)
  return url !== undefined && url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' && url.port.length > 0 &&
    url.pathname === GOOGLE_OAUTH_CALLBACK_PATH && url.search === '' && url.hash === '' &&
    url.username === '' && url.password === ''
}

export const safelyEqualGoogleOAuthValue = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8')
  const rightBytes = Buffer.from(right, 'utf8')
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

const hasOneExactValue = (url: URL, key: string, expected: string): boolean => {
  const values = url.searchParams.getAll(key)
  return values.length === 1 && values[0] === expected
}

export const isExactGoogleAuthorizationUrl = (value: string, clientId: string): boolean => {
  if (!GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(clientId)) return false
  const url = parseBoundedGoogleOAuthUrl(value)
  if (url === undefined || `${url.origin}${url.pathname}` !== GOOGLE_AUTHORIZATION_ENDPOINT ||
      url.port !== '' ||
      url.username !== '' || url.password !== '' || url.hash !== '') return false
  const allowedKeys = [
    'client_id', 'redirect_uri', 'response_type', 'scope', 'state',
    'code_challenge', 'code_challenge_method', 'access_type', 'prompt'
  ]
  const keys = [...url.searchParams.keys()]
  if (keys.length !== allowedKeys.length ||
      new Set(keys).size !== allowedKeys.length ||
      keys.some((key) => !allowedKeys.includes(key))) return false
  const state = url.searchParams.get('state')
  const challenge = url.searchParams.get('code_challenge')
  const redirectUri = url.searchParams.get('redirect_uri')
  return state !== null && GOOGLE_OAUTH_STATE_PATTERN.test(state) &&
    challenge !== null && GOOGLE_OAUTH_CHALLENGE_PATTERN.test(challenge) &&
    redirectUri !== null && isExactGoogleLoopbackRedirect(redirectUri) &&
    hasOneExactValue(url, 'client_id', clientId) &&
    hasOneExactValue(url, 'redirect_uri', redirectUri) &&
    hasOneExactValue(url, 'response_type', 'code') &&
    hasOneExactValue(url, 'scope', GOOGLE_CONNECT_SCOPES.join(' ')) &&
    hasOneExactValue(url, 'state', state) &&
    hasOneExactValue(url, 'code_challenge', challenge) &&
    hasOneExactValue(url, 'code_challenge_method', 'S256') &&
    hasOneExactValue(url, 'access_type', 'offline') &&
    hasOneExactValue(url, 'prompt', 'consent')
}
