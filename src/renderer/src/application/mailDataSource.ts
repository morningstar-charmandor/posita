import {
  POSITA_PROTOCOL_VERSION,
  type LoadApplicationStateResponseV1
} from '@shared/contracts'

export interface ApplicationStateDataSource {
  loadApplicationState(): Promise<LoadApplicationStateResponseV1>
}

const unavailableResponse = (): LoadApplicationStateResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR',
    message: 'The Posita desktop bridge is unavailable.',
    retryable: false
  }
})

export const desktopApplicationStateDataSource: ApplicationStateDataSource = {
  loadApplicationState: () =>
    window.posita?.loadApplicationState?.() ?? Promise.resolve(unavailableResponse())
}
