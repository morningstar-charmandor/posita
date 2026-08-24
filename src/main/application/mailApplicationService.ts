import {
  POSITA_PROTOCOL_VERSION,
  type AppErrorV1,
  type LoadSnapshotResponseV1
} from '../../shared/contracts'
import type { MailRepository } from './mailRepository'

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date()
}

const databaseError = (): AppErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code: 'DATABASE_UNAVAILABLE',
  message: 'Posita could not load local mail data. Please try again.',
  retryable: true
})

export class MailApplicationService {
  constructor(
    private readonly repository: MailRepository,
    private readonly clock: Clock
  ) {}

  loadSnapshot(): LoadSnapshotResponseV1 {
    try {
      return {
        ok: true,
        value: {
          version: POSITA_PROTOCOL_VERSION,
          dataMode: 'fixture-seeded',
          loadedAt: this.clock.now().toISOString(),
          dataset: this.repository.loadDataset()
        }
      }
    } catch {
      return { ok: false, error: databaseError() }
    }
  }
}
