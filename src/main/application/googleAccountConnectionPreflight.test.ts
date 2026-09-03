import { describe, expect, it } from 'vitest'
import { GoogleAccountConnectionPreflightService } from './googleAccountConnectionPreflight'

const request = { version: 1, action: 'prepare-google-account-connection' } as const

describe('GoogleAccountConnectionPreflightService', () => {
  it('reports trusted readiness without starting authorization', () => {
    const service = new GoogleAccountConnectionPreflightService(true)

    expect(service.prepare(request)).toMatchObject({
      ok: true,
      value: {
        provider: 'google',
        status: 'authorization-not-started',
        nextStep: 'explicit-google-authorization-required'
      }
    })
  })

  it('fails safely for unavailable composition and malformed requests', () => {
    expect(new GoogleAccountConnectionPreflightService().prepare(request)).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_UNAVAILABLE', retryable: true }
    })
    expect(new GoogleAccountConnectionPreflightService(true).prepare({
      ...request,
      startAuthorization: true
    })).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })
})
