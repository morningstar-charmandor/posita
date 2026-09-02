import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { isAuthorizationSessionId } from '../../application/accountAuthorization'
import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_MAX_URL_LENGTH,
  GOOGLE_OAUTH_STATE_PATTERN,
  safelyEqualGoogleOAuthValue
} from './googleOAuthProtocol'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_SESSION_LIFETIME_MS = 5 * 60 * 1_000
const MAX_HEADER_BYTES = 8 * 1_024
const REQUEST_TIMEOUT_MS = 5_000
const SAFE_SUCCESS_BODY = '<!doctype html><meta charset="utf-8"><title>Return to Posita</title><p>Posita received a response. Return to Posita to continue.</p>'
const SAFE_ERROR_BODY = 'The authorization response was not accepted. Return to Posita.'

export interface GoogleOAuthRedirectUriSource {
  prepare(sessionId: string, expectedState: string): Promise<string>
  release(sessionId: string): Promise<void>
}

export type GoogleOAuthLoopbackErrorCode =
  | 'INVALID_LOOPBACK_REQUEST'
  | 'LOOPBACK_IN_PROGRESS'
  | 'LOOPBACK_LISTEN_FAILED'
  | 'LOOPBACK_SESSION_NOT_FOUND'
  | 'LOOPBACK_CALLBACK_CANCELLED'
  | 'LOOPBACK_CALLBACK_EXPIRED'

export class GoogleOAuthLoopbackError extends Error {
  constructor(
    readonly code: GoogleOAuthLoopbackErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'GoogleOAuthLoopbackError'
  }
}

interface CallbackWaiter {
  resolve(value: string): void
  reject(error: GoogleOAuthLoopbackError): void
  cleanup(): void
}

interface ActiveLoopbackSession {
  sessionId: string
  expectedState: string
  redirectUri: string
  server: Server
  expiry: ReturnType<typeof setTimeout>
  queuedCallback?: string
  waiter?: CallbackWaiter
}

const loopbackError = (
  code: GoogleOAuthLoopbackErrorCode,
  message: string,
  retryable: boolean,
  cause?: unknown
): GoogleOAuthLoopbackError => new GoogleOAuthLoopbackError(
  code,
  message,
  retryable,
  cause === undefined ? undefined : { cause }
)

const writeResponse = (
  response: ServerResponse,
  status: number,
  body: string,
  extraHeaders: Readonly<Record<string, string>> = {}
): void => {
  response.writeHead(status, {
    'content-type': status === 200 ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    connection: 'close',
    ...extraHeaders
  })
  response.end(body)
}

/**
 * Owns one short-lived exact-loopback callback server. It never opens a browser,
 * interprets an authorization code, exchanges a token, or persists callback data.
 */
export class GoogleOAuthLoopbackRedirectServer implements GoogleOAuthRedirectUriSource {
  private active?: ActiveLoopbackSession

  constructor(private readonly sessionLifetimeMs = DEFAULT_SESSION_LIFETIME_MS) {
    if (!Number.isSafeInteger(sessionLifetimeMs) ||
        sessionLifetimeMs < 1_000 || sessionLifetimeMs > DEFAULT_SESSION_LIFETIME_MS) {
      throw loopbackError(
        'INVALID_LOOPBACK_REQUEST',
        'The local authorization listener configuration is invalid.',
        false
      )
    }
  }

  async prepare(sessionId: string, expectedState: string): Promise<string> {
    if (!isAuthorizationSessionId(sessionId) ||
        !GOOGLE_OAUTH_STATE_PATTERN.test(expectedState)) {
      throw loopbackError(
        'INVALID_LOOPBACK_REQUEST',
        'The local authorization listener request is invalid.',
        false
      )
    }
    if (this.active !== undefined) {
      throw loopbackError(
        'LOOPBACK_IN_PROGRESS',
        'A local authorization listener is already active.',
        false
      )
    }

    const server = createServer({
      requireHostHeader: true,
      maxHeaderSize: MAX_HEADER_BYTES,
      headersTimeout: REQUEST_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
      keepAliveTimeout: 1_000,
      connectionsCheckingInterval: 1_000
    }, (request, response) => this.handleRequest(sessionId, request, response))
    server.maxHeadersCount = 32
    server.maxRequestsPerSocket = 1
    server.setTimeout(REQUEST_TIMEOUT_MS, (socket) => socket.destroy())
    server.on('clientError', (_error, socket) => {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      else socket.destroy()
    })

    try {
      const redirectUri = await new Promise<string>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        server.once('error', onError)
        server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
          server.off('error', onError)
          const address = server.address()
          if (address === null || typeof address === 'string') {
            reject(new Error('Loopback listener did not receive a TCP address'))
            return
          }
          resolve(this.redirectUri(address))
        })
      })
      const expiry = setTimeout(() => {
        const current = this.active
        if (current?.sessionId !== sessionId) return
        void this.closeSession(current, loopbackError(
          'LOOPBACK_CALLBACK_EXPIRED',
          'The local authorization listener expired. Start again.',
          true
        )).catch(() => undefined)
      }, this.sessionLifetimeMs)
      expiry.unref()
      this.active = { sessionId, expectedState, redirectUri, server, expiry }
      server.unref()
      return redirectUri
    } catch (error) {
      await this.closeServer(server)
      throw loopbackError(
        'LOOPBACK_LISTEN_FAILED',
        'Posita could not start the local authorization listener.',
        true,
        error
      )
    }
  }

  nextCallback(sessionId: string, signal?: AbortSignal): Promise<string> {
    if (!isAuthorizationSessionId(sessionId)) {
      return Promise.reject(loopbackError(
        'INVALID_LOOPBACK_REQUEST',
        'The local authorization callback request is invalid.',
        false
      ))
    }
    const session = this.active
    if (session === undefined || session.sessionId !== sessionId) {
      return Promise.reject(loopbackError(
        'LOOPBACK_SESSION_NOT_FOUND',
        'The local authorization listener is unavailable.',
        false
      ))
    }
    if (signal?.aborted === true) {
      return Promise.reject(loopbackError(
        'LOOPBACK_CALLBACK_CANCELLED',
        'Waiting for the local authorization response was cancelled.',
        false
      ))
    }
    if (session.queuedCallback !== undefined) {
      const callback = session.queuedCallback
      session.queuedCallback = undefined
      return Promise.resolve(callback)
    }
    if (session.waiter !== undefined) {
      return Promise.reject(loopbackError(
        'LOOPBACK_IN_PROGRESS',
        'A local authorization callback wait is already active.',
        false
      ))
    }
    return new Promise<string>((resolve, reject) => {
      const onAbort = (): void => {
        if (session.waiter === waiter) session.waiter = undefined
        waiter.cleanup()
        reject(loopbackError(
          'LOOPBACK_CALLBACK_CANCELLED',
          'Waiting for the local authorization response was cancelled.',
          false
        ))
      }
      const waiter: CallbackWaiter = {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort)
      }
      session.waiter = waiter
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  async release(sessionId: string): Promise<void> {
    if (!isAuthorizationSessionId(sessionId)) {
      throw loopbackError(
        'INVALID_LOOPBACK_REQUEST',
        'The local authorization listener release request is invalid.',
        false
      )
    }
    const session = this.active
    if (session === undefined) return
    if (session.sessionId !== sessionId) {
      throw loopbackError(
        'LOOPBACK_SESSION_NOT_FOUND',
        'The local authorization listener is unavailable.',
        false
      )
    }
    await this.closeSession(session, loopbackError(
      'LOOPBACK_CALLBACK_CANCELLED',
      'The local authorization listener was closed.',
      false
    ))
  }

  private handleRequest(
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse
  ): void {
    const session = this.active
    if (session === undefined || session.sessionId !== sessionId) {
      writeResponse(response, 410, SAFE_ERROR_BODY)
      return
    }
    if (request.method !== 'GET') {
      writeResponse(response, 405, SAFE_ERROR_BODY, { allow: 'GET' })
      return
    }
    const expectedHost = new URL(session.redirectUri).host
    const hosts = request.headersDistinct.host
    if (hosts?.length !== 1 || hosts[0] !== expectedHost ||
        request.headers['content-length'] !== undefined ||
        request.headers['transfer-encoding'] !== undefined ||
        request.url === undefined || request.url.length > GOOGLE_OAUTH_MAX_URL_LENGTH) {
      writeResponse(response, 400, SAFE_ERROR_BODY)
      return
    }
    let callback: URL
    try {
      callback = new URL(request.url, session.redirectUri)
    } catch {
      writeResponse(response, 400, SAFE_ERROR_BODY)
      return
    }
    const states = callback.searchParams.getAll('state')
    const hasResponse = callback.searchParams.has('code') || callback.searchParams.has('error')
    if (callback.origin !== new URL(session.redirectUri).origin ||
        callback.pathname !== GOOGLE_OAUTH_CALLBACK_PATH || callback.hash !== '' ||
        states.length !== 1 ||
        !safelyEqualGoogleOAuthValue(states[0]!, session.expectedState) || !hasResponse) {
      writeResponse(response, 400, SAFE_ERROR_BODY)
      return
    }
    if (session.waiter !== undefined) {
      const waiter = session.waiter
      session.waiter = undefined
      waiter.cleanup()
      waiter.resolve(callback.toString())
    } else if (session.queuedCallback === undefined) {
      session.queuedCallback = callback.toString()
    } else {
      writeResponse(response, 429, SAFE_ERROR_BODY)
      return
    }
    writeResponse(response, 200, SAFE_SUCCESS_BODY)
  }

  private redirectUri(address: AddressInfo): string {
    return `http://${LOOPBACK_HOST}:${address.port}${GOOGLE_OAUTH_CALLBACK_PATH}`
  }

  private async closeSession(
    session: ActiveLoopbackSession,
    waiterError: GoogleOAuthLoopbackError
  ): Promise<void> {
    if (this.active === session) this.active = undefined
    clearTimeout(session.expiry)
    session.queuedCallback = undefined
    const waiter = session.waiter
    session.waiter = undefined
    waiter?.cleanup()
    waiter?.reject(waiterError)
    await this.closeServer(session.server)
  }

  private async closeServer(server: Server): Promise<void> {
    if (!server.listening) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
      server.closeAllConnections()
    })
  }
}
