type GoogleTokenExchangeFailureKind =
  | 'invalid_grant'
  | 'invalid_client'
  | 'redirect_uri_mismatch'
  | 'invalid_request'
  | 'invalid_request_client_secret'
  | 'invalid_request_client_id'
  | 'invalid_request_redirect_uri'
  | 'invalid_request_pkce'
  | 'invalid_request_code'
  | 'invalid_request_grant_type'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'temporary_failure'
  | 'unclassified_failure'

const FAILURE_MESSAGES: Readonly<Record<GoogleTokenExchangeFailureKind, string>> = {
  invalid_grant: 'Google rejected the one-time authorization grant. Start again.',
  invalid_client: 'Google rejected Posita\'s OAuth client configuration. Start again.',
  redirect_uri_mismatch: 'Google rejected Posita\'s loopback redirect configuration. Start again.',
  invalid_request: 'Google rejected Posita\'s token exchange request. Start again.',
  invalid_request_client_secret:
    'Google reports that Posita\'s client-secret configuration is incomplete.',
  invalid_request_client_id: 'Google rejected Posita\'s OAuth client identifier.',
  invalid_request_redirect_uri: 'Google rejected Posita\'s loopback redirect parameter.',
  invalid_request_pkce: 'Google rejected Posita\'s PKCE verification parameter. Start again.',
  invalid_request_code: 'Google rejected Posita\'s authorization-code parameter. Start again.',
  invalid_request_grant_type: 'Google rejected Posita\'s authorization grant type.',
  unauthorized_client: 'Google did not authorize this OAuth client for the token exchange.',
  unsupported_grant_type: 'Google did not accept Posita\'s authorization-code exchange.',
  invalid_scope: 'Google rejected the reviewed read-only scope set. Start again.',
  temporary_failure: 'Google\'s token service is temporarily unavailable. Start again.',
  unclassified_failure: 'Google rejected the token exchange. Start again.'
}

export class GoogleTokenExchangeFailure extends Error {
  constructor(
    readonly kind: GoogleTokenExchangeFailureKind,
    readonly retryable: boolean
  ) {
    super(FAILURE_MESSAGES[kind])
    this.name = 'GoogleTokenExchangeFailure'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const classifyInvalidRequestDescription = (value: unknown): GoogleTokenExchangeFailureKind => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return 'invalid_request'
  }
  const description = value.toLowerCase()
  if (description.includes('client_secret')) return 'invalid_request_client_secret'
  if (description.includes('client_id')) return 'invalid_request_client_id'
  if (description.includes('redirect_uri')) return 'invalid_request_redirect_uri'
  if (description.includes('code_verifier') || description.includes('code_challenge')) {
    return 'invalid_request_pkce'
  }
  if (description.includes('grant_type')) return 'invalid_request_grant_type'
  if (/\bauthorization code\b|\bcode\b/.test(description)) return 'invalid_request_code'
  return 'invalid_request'
}

export const parseGoogleTokenExchangeFailure = (
  text: string,
  status: number
): GoogleTokenExchangeFailure => {
  if (status === 429 || status >= 500) {
    return new GoogleTokenExchangeFailure('temporary_failure', true)
  }
  try {
    const value: unknown = JSON.parse(text)
    if (isRecord(value) && typeof value.error === 'string' &&
        Object.hasOwn(FAILURE_MESSAGES, value.error)) {
      return new GoogleTokenExchangeFailure(
        value.error === 'invalid_request'
          ? classifyInvalidRequestDescription(value.error_description)
          : value.error as GoogleTokenExchangeFailureKind,
        false
      )
    }
  } catch {
    // Provider text is intentionally discarded; only allow-listed error kinds are surfaced.
  }
  return new GoogleTokenExchangeFailure('unclassified_failure', false)
}
