import {
  GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT,
  GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES,
  POSITA_PROTOCOL_VERSION,
  type ExecuteGoogleAccountDisconnectResponseV1,
  type GoogleAccountDisconnectErrorCodeV1,
  type GoogleAccountDisconnectErrorV1,
  type PrepareGoogleAccountDisconnectResponseV1
} from '../../shared/contracts'
import {
  isExecuteGoogleAccountDisconnectRequest,
  isPrepareGoogleAccountDisconnectRequest
} from '../../shared/validation'
import type { AccountConnectionConsistencyInspector } from './accountConnection'
import type { ProviderMailLifecycleOwner } from './providerMailLifecycleOwner'
import { isOperationId } from './accountLifecycle'

const CONFIRMATION_TTL_MS = 5 * 60 * 1000
const MAX_PENDING = 16

export interface GoogleAccountDisconnectAuditRecordV1 {
  version: 1
  confirmationId: string
  operationId: string
  accountId: string
  confirmedAt: string
}

export interface GoogleAccountDisconnectAuditRepository {
  save(record: GoogleAccountDisconnectAuditRecordV1): void
}

interface PendingChallenge {
  operationId: string
  accountId: string
  expiresAtMs: number
  confirmedAt?: string
}

const error = (
  code: GoogleAccountDisconnectErrorCodeV1,
  message: string,
  retryable: boolean
): GoogleAccountDisconnectErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code,
  message,
  retryable
})

/** Owns exact confirmation and the journaled provider/local disconnect handoff. */
export class GoogleAccountDisconnectCommandService {
  private readonly pending = new Map<string, PendingChallenge>()

  constructor(
    private readonly connections?: AccountConnectionConsistencyInspector,
    private readonly lifecycle?: Pick<ProviderMailLifecycleOwner, 'disconnectAccount'>,
    private readonly audit?: GoogleAccountDisconnectAuditRepository,
    private readonly clock?: { now(): Date },
    private readonly idSource?: () => string
  ) {}

  async prepare(request: unknown): Promise<PrepareGoogleAccountDisconnectResponseV1> {
    if (!isPrepareGoogleAccountDisconnectRequest(request)) return this.invalid()
    if (!this.connections || !this.lifecycle || !this.audit || !this.clock || !this.idSource) {
      return this.unavailable()
    }
    try {
      const consistency = await this.connections.inspect(request.accountId)
      if (consistency.status !== 'connected') {
        return {
          ok: false,
          error: error('ACCOUNT_NOT_CONNECTED', 'This Google account is not fully connected.', false)
        }
      }
      const nowMs = this.validNow().getTime()
      for (const [id, pending] of this.pending) {
        if (pending.expiresAtMs < nowMs) this.pending.delete(id)
      }
      if (this.pending.size >= MAX_PENDING) {
        return { ok: false, error: error('DISCONNECT_FAILED', 'Too many disconnect confirmations are open.', true) }
      }
      const confirmationId = this.idSource()
      const operationId = this.idSource()
      if (!isOperationId(confirmationId) || !isOperationId(operationId) ||
          confirmationId === operationId) return this.invalid()
      const expiresAtMs = nowMs + CONFIRMATION_TTL_MS
      this.pending.set(confirmationId, {
        operationId,
        accountId: request.accountId,
        expiresAtMs
      })
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          confirmationId,
          operationId,
          action: 'disconnect-google-account',
          accountId: request.accountId,
          requiredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT,
          expiresAt: new Date(expiresAtMs).toISOString(),
          consequences: GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES
        }
      }
    } catch {
      return { ok: false, error: error('DISCONNECT_FAILED', 'Posita could not prepare account disconnection safely.', true) }
    }
  }

  async execute(request: unknown): Promise<ExecuteGoogleAccountDisconnectResponseV1> {
    if (!isExecuteGoogleAccountDisconnectRequest(request)) return this.invalid()
    if (!this.connections || !this.lifecycle || !this.audit || !this.clock || !this.idSource) {
      return this.unavailable()
    }
    if (request.enteredText !== GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT) {
      return { ok: false, error: error('CONFIRMATION_TEXT_MISMATCH', 'The disconnect confirmation text does not match.', false) }
    }
    const challenge = this.pending.get(request.confirmationId)
    if (challenge === undefined || challenge.operationId !== request.operationId ||
        challenge.accountId !== request.accountId) {
      return { ok: false, error: error('CONFIRMATION_NOT_FOUND', 'The disconnect confirmation is no longer available.', false) }
    }
    const now = this.validNow()
    if (challenge.expiresAtMs < now.getTime()) {
      this.pending.delete(request.confirmationId)
      return { ok: false, error: error('CONFIRMATION_EXPIRED', 'The disconnect confirmation expired. Start again.', false) }
    }
    try {
      const consistency = await this.connections.inspect(request.accountId)
      if (consistency.status !== 'connected') {
        return { ok: false, error: error('ACCOUNT_NOT_CONNECTED', 'The Google account connection changed. Review it again.', false) }
      }
      const confirmedAt = challenge.confirmedAt ?? now.toISOString()
      this.audit.save({
        version: 1,
        confirmationId: request.confirmationId,
        operationId: request.operationId,
        accountId: request.accountId,
        confirmedAt
      })
      challenge.confirmedAt = confirmedAt
      await this.lifecycle.disconnectAccount({
        version: POSITA_PROTOCOL_VERSION,
        operationId: request.operationId,
        accountId: request.accountId
      })
      this.pending.delete(request.confirmationId)
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          operationId: request.operationId,
          accountId: request.accountId,
          status: 'disconnected'
        }
      }
    } catch {
      return {
        ok: false,
        error: error(
          'DISCONNECT_FAILED',
          'Posita could not complete account disconnection. Its recovery journal will preserve progress.',
          true
        )
      }
    }
  }

  private validNow(): Date {
    const now = this.clock!.now()
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid disconnect confirmation clock.')
    return now
  }

  private invalid(): { ok: false; error: GoogleAccountDisconnectErrorV1 } {
    return { ok: false, error: error('INVALID_REQUEST', 'The Google disconnect request was invalid.', false) }
  }

  private unavailable(): { ok: false; error: GoogleAccountDisconnectErrorV1 } {
    return { ok: false, error: error('DISCONNECT_UNAVAILABLE', 'Google account disconnection is unavailable.', false) }
  }
}
