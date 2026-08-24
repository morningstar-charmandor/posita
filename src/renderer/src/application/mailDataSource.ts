import {
  POSITA_PROTOCOL_VERSION,
  type LoadSnapshotResponseV1
} from '@shared/contracts'

export interface MailDataSource {
  loadSnapshot(): Promise<LoadSnapshotResponseV1>
}

const unavailableResponse = (): LoadSnapshotResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR',
    message: 'The Posita desktop bridge is unavailable.',
    retryable: false
  }
})

export const desktopMailDataSource: MailDataSource = {
  loadSnapshot: () => window.posita?.loadSnapshot?.() ?? Promise.resolve(unavailableResponse())
}
