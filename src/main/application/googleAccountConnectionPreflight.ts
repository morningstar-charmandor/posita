import {
  GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
  GOOGLE_CONNECT_CONSENT,
  POSITA_PROTOCOL_VERSION,
  type GoogleAccountConnectionPreflightErrorCodeV1,
  type PrepareGoogleAccountConnectionResponseV1
} from '../../shared/contracts'
import { isPrepareGoogleAccountConnectionRequest } from '../../shared/validation'

const errorResponse = (
  code: GoogleAccountConnectionPreflightErrorCodeV1,
  message: string,
  retryable = false
): PrepareGoogleAccountConnectionResponseV1 => ({
  ok: false,
  error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable }
})

/**
 * Read-only gate proving that trusted Google composition is locally available.
 * It creates no authorization session, browser action, account, or credential.
 */
export class GoogleAccountConnectionPreflightService {
  constructor(private readonly available = false) {}

  prepare(request: unknown): PrepareGoogleAccountConnectionResponseV1 {
    if (!isPrepareGoogleAccountConnectionRequest(request)) {
      return errorResponse('INVALID_REQUEST', 'The Gmail connection preparation request was invalid.')
    }
    if (!this.available) {
      return errorResponse(
        'CONNECTION_UNAVAILABLE',
        'Gmail connection preparation is unavailable on this installation.',
        true
      )
    }
    return {
      ok: true,
      value: {
        version: POSITA_PROTOCOL_VERSION,
        action: 'prepare-google-account-connection',
        provider: 'google',
        status: 'authorization-not-started',
        consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion,
        requestedScopes: GOOGLE_CONNECT_CONSENT.requestedScopes,
        notices: GOOGLE_ACCOUNT_CONNECTION_PREFLIGHT_NOTICES,
        nextStep: 'explicit-google-authorization-required'
      }
    }
  }
}
