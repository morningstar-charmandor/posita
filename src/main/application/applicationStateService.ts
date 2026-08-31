import {
  GOOGLE_CONNECT_CONSENT,
  POSITA_PROTOCOL_VERSION,
  type LoadApplicationStateResponseV1
} from '../../shared/contracts'
import { AccountLifecycleStatusService } from './accountLifecycleStatus'
import type { MailApplicationService } from './mailApplicationService'
import type { RetentionMaintenanceOwner } from './retentionMaintenanceOwner'

export type ApplicationRuntimeMode =
  | 'ready'
  | 'local-data-deleted'
  | 'recovery-required'

export class ApplicationStateService {
  constructor(
    private mode: ApplicationRuntimeMode,
    private readonly mail?: MailApplicationService,
    private readonly lifecycle?: AccountLifecycleStatusService,
    private readonly retention?: Pick<RetentionMaintenanceOwner, 'status'>
  ) {}

  markLocalDataDeleted(): void {
    this.mode = 'local-data-deleted'
  }

  load(): LoadApplicationStateResponseV1 {
    if (this.mode !== 'ready') {
      return {
        ok: true,
        value: { version: POSITA_PROTOCOL_VERSION, mode: this.mode }
      }
    }
    if (!this.mail || !this.lifecycle || !this.retention) return this.unavailable()

    try {
      const snapshot = this.mail.loadSnapshot()
      if (!snapshot.ok) return snapshot
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          mode: 'ready',
          snapshot: snapshot.value,
          lifecycle: this.lifecycle.load(),
          retention: this.retention.status(),
          connectConsent: GOOGLE_CONNECT_CONSENT
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
