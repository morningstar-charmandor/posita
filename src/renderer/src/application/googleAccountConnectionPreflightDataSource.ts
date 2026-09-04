import {
  POSITA_PROTOCOL_VERSION,
  type PrepareGoogleAccountConnectionResponseV1,
  type ConnectGoogleAccountResponseV1,
  type CancelGoogleAccountConnectionResponseV1,
  type PrepareGoogleAccountDisconnectRequestV1,
  type PrepareGoogleAccountDisconnectResponseV1,
  type ExecuteGoogleAccountDisconnectRequestV1,
  type ExecuteGoogleAccountDisconnectResponseV1,
  type RetryGoogleAccountSyncRequestV1,
  type RetryGoogleAccountSyncResponseV1
} from '@shared/contracts'

export interface GoogleAccountConnectionPreflightDataSource {
  prepare(): Promise<PrepareGoogleAccountConnectionResponseV1>
  connect(): Promise<ConnectGoogleAccountResponseV1>
  cancel(): Promise<CancelGoogleAccountConnectionResponseV1>
  retrySync(
    request: RetryGoogleAccountSyncRequestV1
  ): Promise<RetryGoogleAccountSyncResponseV1>
  prepareDisconnect(
    request: PrepareGoogleAccountDisconnectRequestV1
  ): Promise<PrepareGoogleAccountDisconnectResponseV1>
  executeDisconnect(
    request: ExecuteGoogleAccountDisconnectRequestV1
  ): Promise<ExecuteGoogleAccountDisconnectResponseV1>
}

const preparationUnavailable = (): PrepareGoogleAccountConnectionResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'CONNECTION_UNAVAILABLE',
    message: 'Gmail connection preparation is unavailable in this window.',
    retryable: true
  }
})

const connectionUnavailable = (): ConnectGoogleAccountResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'CONNECTION_UNAVAILABLE',
    message: 'Gmail connection is unavailable in this window.',
    retryable: false
  }
})

const cancellationUnavailable = (): CancelGoogleAccountConnectionResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'CONNECTION_UNAVAILABLE',
    message: 'Gmail connection cancellation is unavailable in this window.',
    retryable: false
  }
})

const disconnectUnavailable = (): PrepareGoogleAccountDisconnectResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'DISCONNECT_UNAVAILABLE',
    message: 'Gmail disconnection is unavailable in this window.',
    retryable: false
  }
})

const syncUnavailable = (): RetryGoogleAccountSyncResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'SYNC_UNAVAILABLE',
    message: 'Gmail synchronization is unavailable in this window.',
    retryable: false
  }
})

export const desktopGoogleAccountConnectionPreflightDataSource: GoogleAccountConnectionPreflightDataSource = {
  prepare: () => window.posita?.prepareGoogleAccountConnection?.() ??
    Promise.resolve(preparationUnavailable()),
  connect: () => window.posita?.connectGoogleAccount?.() ?? Promise.resolve(connectionUnavailable()),
  cancel: () => window.posita?.cancelGoogleAccountConnection?.() ??
    Promise.resolve(cancellationUnavailable()),
  retrySync: (request) => window.posita?.retryGoogleAccountSync?.(request) ??
    Promise.resolve(syncUnavailable()),
  prepareDisconnect: (request) => window.posita?.prepareGoogleAccountDisconnect?.(request) ??
    Promise.resolve(disconnectUnavailable()),
  executeDisconnect: (request) => window.posita?.executeGoogleAccountDisconnect?.(request) ??
    Promise.resolve(disconnectUnavailable())
}
