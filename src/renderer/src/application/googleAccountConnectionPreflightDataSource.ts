import {
  POSITA_PROTOCOL_VERSION,
  type PrepareGoogleAccountConnectionResponseV1
} from '@shared/contracts'

export interface GoogleAccountConnectionPreflightDataSource {
  prepare(): Promise<PrepareGoogleAccountConnectionResponseV1>
}

const unavailable = (): PrepareGoogleAccountConnectionResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'CONNECTION_UNAVAILABLE',
    message: 'Gmail connection preparation is unavailable in this window.',
    retryable: true
  }
})

export const desktopGoogleAccountConnectionPreflightDataSource: GoogleAccountConnectionPreflightDataSource = {
  prepare: () => window.posita?.prepareGoogleAccountConnection?.() ??
    Promise.resolve(unavailable())
}
