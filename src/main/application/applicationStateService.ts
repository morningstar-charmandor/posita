import {
  POSITA_PROTOCOL_VERSION,
  type LoadApplicationStateResponseV1
} from '../../shared/contracts'
import { AccountLifecycleStatusService } from './accountLifecycleStatus'
import type { MailApplicationService } from './mailApplicationService'

export type ApplicationRuntimeMode =
  | 'ready'
  | 'local-data-deleted'
  | 'recovery-required'

export class ApplicationStateService {
  constructor(
    private readonly mode: ApplicationRuntimeMode,
    private readonly mail?: MailApplicationService,
    private readonly lifecycle?: AccountLifecycleStatusService
  ) {}

  load(): LoadApplicationStateResponseV1 {
    if (this.mode !== 'ready') {
      return {
        ok: true,
        value: { version: POSITA_PROTOCOL_VERSION, mode: this.mode }
      }
    }
    if (!this.mail || !this.lifecycle) return this.unavailable()

    try {
      const snapshot = this.mail.loadSnapshot()
      if (!snapshot.ok) return snapshot
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          mode: 'ready',
          snapshot: snapshot.value,
          lifecycle: this.lifecycle.load()
        }
      }
    } catch {
      return this.unavailable()
    }
  }

  private unavailable(): LoadApplicationStateResponseV1 {
    return {
      ok: false,
      error: {
        version: POSITA_PROTOCOL_VERSION,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Posita could not load local application state. Please try again.',
        retryable: true
      }
    }
  }
}
