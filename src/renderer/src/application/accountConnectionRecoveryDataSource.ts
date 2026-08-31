import {
  POSITA_PROTOCOL_VERSION,
  type ExecuteAccountConnectionRecoveryRequestV1,
  type ExecuteAccountConnectionRecoveryResponseV1,
  type PrepareAccountConnectionRecoveryRequestV1,
  type PrepareAccountConnectionRecoveryResponseV1
} from '@shared/contracts'

export interface AccountConnectionRecoveryDataSource {
  prepare(
    request: PrepareAccountConnectionRecoveryRequestV1
  ): Promise<PrepareAccountConnectionRecoveryResponseV1>
  execute(
    request: ExecuteAccountConnectionRecoveryRequestV1
  ): Promise<ExecuteAccountConnectionRecoveryResponseV1>
}

const unavailable = (): PrepareAccountConnectionRecoveryResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'RECOVERY_UNAVAILABLE',
    message: 'The Posita local connection recovery bridge is unavailable.',
    retryable: false
  }
})

export const desktopAccountConnectionRecoveryDataSource: AccountConnectionRecoveryDataSource = {
  prepare: (request) => window.posita?.prepareAccountConnectionRecovery?.(request) ??
    Promise.resolve(unavailable()),
  execute: (request) => window.posita?.executeAccountConnectionRecovery?.(request) ??
    Promise.resolve(unavailable())
}
