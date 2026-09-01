import {
  POSITA_PROTOCOL_VERSION,
  type AppErrorV1,
  type LoadSnapshotResponseV1
} from '../../shared/contracts'
import { isLiveMailSnapshot } from '../../shared/validation'
import type { LiveMailSnapshotV2 } from '../../shared/liveMail'
import type { Clock } from './mailApplicationService'
import type { MailDataModeRepository } from './mailDataMode'

export interface ProviderMailReadModelSource {
  loadReadModel(loadedAt: string): Promise<LiveMailSnapshotV2>
}

const unavailable = (): AppErrorV1 => ({
  version: POSITA_PROTOCOL_VERSION,
  code: 'DATABASE_UNAVAILABLE',
  message: 'Posita could not load the encrypted live-mail projection. Please try again.',
  retryable: true
})

/** Loads only the bounded canonical presentation projection owned by the worker. */
export class ProviderMailReadModelService {
  constructor(
    private readonly source: ProviderMailReadModelSource,
    private readonly clock: Clock
  ) {}

  async loadSnapshot(): Promise<LoadSnapshotResponseV1> {
    try {
      const snapshot = await this.source.loadReadModel(this.clock.now().toISOString())
      return isLiveMailSnapshot(snapshot)
        ? { ok: true, value: snapshot }
        : { ok: false, error: unavailable() }
    } catch {
      return { ok: false, error: unavailable() }
    }
  }
}

export interface ApplicationMailStateLoader {
  loadSnapshot(): LoadSnapshotResponseV1 | Promise<LoadSnapshotResponseV1>
}

/** Reads the durable installation mode for every query, including after activation. */
export class ModeAwareMailStateService implements ApplicationMailStateLoader {
  constructor(
    private readonly mode: Pick<MailDataModeRepository, 'load'>,
    private readonly sample: ApplicationMailStateLoader,
    private readonly live: ApplicationMailStateLoader
  ) {}

  loadSnapshot(): LoadSnapshotResponseV1 | Promise<LoadSnapshotResponseV1> {
    return this.mode.load().mode === 'sample'
      ? this.sample.loadSnapshot()
      : this.live.loadSnapshot()
  }
}
