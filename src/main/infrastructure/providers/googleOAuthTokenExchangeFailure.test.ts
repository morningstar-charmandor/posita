import { describe, expect, it } from 'vitest'
import { parseGoogleTokenExchangeFailure } from './googleOAuthTokenExchangeFailure'

describe('parseGoogleTokenExchangeFailure', () => {
  it.each([
    ['client_secret', 'Google reports that Posita\'s client-secret configuration is incomplete.'],
    ['client_id', 'Google rejected Posita\'s OAuth client identifier.'],
    ['redirect_uri', 'Google rejected Posita\'s loopback redirect parameter.'],
    ['code_verifier', 'Google rejected Posita\'s PKCE verification parameter. Start again.'],
    ['authorization code', 'Google rejected Posita\'s authorization-code parameter. Start again.'],
    ['grant_type', 'Google rejected Posita\'s authorization grant type.']
  ])('maps %s to fixed copy', (parameter, message) => {
    const failure = parseGoogleTokenExchangeFailure(JSON.stringify({
      error: 'invalid_request',
      error_description: `Provider detail about ${parameter} must not be reflected`
    }), 400)

    expect(failure).toMatchObject({ retryable: false, message })
    expect(failure.message).not.toContain('Provider detail')
  })

  it('discards unknown error kinds, descriptions, and malformed response text', () => {
    for (const text of [
      JSON.stringify({ error: 'unknown_provider_error', error_description: 'private detail' }),
      JSON.stringify({ error: 'invalid_request', error_description: 'private unknown detail' }),
      'not-json-private-detail'
    ]) {
      const failure = parseGoogleTokenExchangeFailure(text, 400)
      expect(failure.retryable).toBe(false)
      expect(failure.message).not.toContain('private')
    }
  })
})
