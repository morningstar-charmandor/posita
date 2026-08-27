import {
  POSITA_PROTOCOL_VERSION,
  type ExecuteLocalDataDeletionRequestV1,
  type ExecuteLocalDataDeletionResponseV1,
  type PrepareLocalDataDeletionResponseV1
} from '@shared/contracts'

export interface LocalDataDeletionDataSource {
  prepare(): Promise<PrepareLocalDataDeletionResponseV1>
  execute(request: ExecuteLocalDataDeletionRequestV1):
    Promise<ExecuteLocalDataDeletionResponseV1>
}

const unavailable = (): PrepareLocalDataDeletionResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'DELETION_UNAVAILABLE',
    message: 'The Posita deletion bridge is unavailable.',
    retryable: false
  }
})

export const desktopLocalDataDeletionDataSource: LocalDataDeletionDataSource = {
  prepare: () => window.posita?.prepareLocalDataDeletion?.() ?? Promise.resolve(unavailable()),
  execute: (request) => window.posita?.executeLocalDataDeletion?.(request) ??
    Promise.resolve(unavailable())
}
