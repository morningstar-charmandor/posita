import {
  AccountAuthorizationError,
  type AccountAuthorizationAdapter,
  type AccountAuthorizationLaunchV1,
  type AuthorizedAccountGrantV1,
  type BeginAccountAuthorizationRequestV1,
  type CompleteAccountAuthorizationRequestV1,
  isAccountAuthorizationLaunchV1,
  isAuthorizationSessionId,
  isAuthorizedAccountGrantV1,
  isBeginAccountAuthorizationRequestV1,
  isCompleteAccountAuthorizationRequestV1
} from '../../application/accountAuthorization'

export interface DeterministicAuthorizationFixture {
  authorizationUrl: string
  callbackUrl: string
  providerAccountId: string
  refreshToken: string
  sessionLifetimeMs: number
}

export interface AuthorizationFakeClock {
  now(): Date
}

type FailurePhase = 'begin' | 'complete'

interface ActiveSession {
  launch: AccountAuthorizationLaunchV1
  expectedCallbackUrl: string
}

const invalidRequest = (): AccountAuthorizationError => new AccountAuthorizationError(
  'INVALID_AUTHORIZATION_REQUEST',
  'The authorization request is invalid.',
  false
)

/** Credential-free test adapter. Never compose this class into production startup. */
export class DeterministicFakeAccountAuthorizationAdapter
implements AccountAuthorizationAdapter {
  private active?: ActiveSession
  private nextFailure?: FailurePhase

  constructor(
    private readonly fixture: DeterministicAuthorizationFixture,
    private readonly clock: AuthorizationFakeClock,
    private readonly sessionIdSource: () => string
  ) {}

  failNext(phase: FailurePhase): void {
    this.nextFailure = phase
  }

  async begin(
    request: BeginAccountAuthorizationRequestV1
  ): Promise<AccountAuthorizationLaunchV1> {
    if (!isBeginAccountAuthorizationRequestV1(request)) throw invalidRequest()
    if (this.active !== undefined) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_IN_PROGRESS',
        'An account authorization session is already pending.',
        false
      )
    }
    if (this.consumeFailure('begin')) throw this.providerUnavailable()
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(this.fixture.sessionLifetimeMs) ||
        this.fixture.sessionLifetimeMs <= 0 || this.fixture.sessionLifetimeMs > 30 * 60 * 1000) {
      throw invalidRequest()
    }
    const launch: AccountAuthorizationLaunchV1 = {
      version: 1,
      sessionId: this.sessionIdSource(),
      accountId: request.accountId,
      provider: request.provider,
      consentVersion: request.consentVersion,
      authorizationUrl: this.fixture.authorizationUrl,
      expiresAt: new Date(now.getTime() + this.fixture.sessionLifetimeMs).toISOString()
    }
    if (!isAccountAuthorizationLaunchV1(launch) ||
        !isCompleteAccountAuthorizationRequestV1({
          version: 1,
          sessionId: launch.sessionId,
          callbackUrl: this.fixture.callbackUrl
        })) throw invalidRequest()
    this.active = { launch, expectedCallbackUrl: this.fixture.callbackUrl }
    return launch
  }

  async complete(
    request: CompleteAccountAuthorizationRequestV1
  ): Promise<AuthorizedAccountGrantV1> {
    if (!isCompleteAccountAuthorizationRequestV1(request)) throw invalidRequest()
    if (this.active === undefined || this.active.launch.sessionId !== request.sessionId) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_NOT_FOUND',
        'The authorization session is unavailable.',
        false
      )
    }
    if (this.consumeFailure('complete')) throw this.providerUnavailable()
    const now = this.clock.now()
    if (!Number.isFinite(now.getTime()) || now.getTime() >= Date.parse(this.active.launch.expiresAt)) {
      this.active = undefined
      throw new AccountAuthorizationError(
        'AUTHORIZATION_SESSION_EXPIRED',
        'The authorization session expired. Start again.',
        true
      )
    }
    if (request.callbackUrl !== this.active.expectedCallbackUrl) {
      throw new AccountAuthorizationError(
        'AUTHORIZATION_CALLBACK_REJECTED',
        'The authorization callback could not be verified.',
        false
      )
    }
    const grant: AuthorizedAccountGrantV1 = {
      version: 1,
      sessionId: this.active.launch.sessionId,
      accountId: this.active.launch.accountId,
      provider: this.active.launch.provider,
      providerAccountId: this.fixture.providerAccountId,
      consentVersion: this.active.launch.consentVersion,
      connectedAt: now.toISOString(),
      refreshToken: this.fixture.refreshToken
    }
    if (!isAuthorizedAccountGrantV1(grant)) throw invalidRequest()
    this.active = undefined
    return grant
  }

  async cancel(sessionId: string): Promise<boolean> {
    if (!isAuthorizationSessionId(sessionId)) throw invalidRequest()
    if (this.active?.launch.sessionId !== sessionId) return false
    this.active = undefined
    return true
  }

  private consumeFailure(phase: FailurePhase): boolean {
    if (this.nextFailure !== phase) return false
    this.nextFailure = undefined
    return true
  }

  private providerUnavailable(): AccountAuthorizationError {
    return new AccountAuthorizationError(
      'AUTHORIZATION_PROVIDER_UNAVAILABLE',
      'The authorization provider is temporarily unavailable.',
      true
    )
  }
}
