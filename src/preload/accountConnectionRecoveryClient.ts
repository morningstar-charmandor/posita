import {
  POSITA_PROTOCOL_VERSION,
  type AccountConnectionRecoveryResponseV1,
  type ExecuteAccountConnectionRecoveryRequestV1,
  type ExecuteAccountConnectionRecoveryResponseV1,
  type PrepareAccountConnectionRecoveryRequestV1,
  type PrepareAccountConnectionRecoveryResponseV1
} from '../shared/contracts'
import {
  isExecuteAccountConnectionRecoveryRequest,
  isExecuteAccountConnectionRecoveryResponse,
  isPrepareAccountConnectionRecoveryRequest,
  isPrepareAccountConnectionRecoveryResponse
} from '../shared/validation'

type Invoke = (request: unknown) => Promise<unknown>

const protocolError = (): AccountConnectionRecoveryResponseV1<never> => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR',
    message: 'The desktop backend returned an unsupported recovery response.',
    retryable: false
  }
})

const invalidRequest = (): AccountConnectionRecoveryResponseV1<never> => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'INVALID_REQUEST',
    message: 'The local connection recovery request was invalid.',
    retryable: false
  }
})

export const createPrepareAccountConnectionRecoveryClient = (invoke: Invoke) =>
  async (
    request: PrepareAccountConnectionRecoveryRequestV1
  ): Promise<PrepareAccountConnectionRecoveryResponseV1> => {
    if (!isPrepareAccountConnectionRecoveryRequest(request)) return invalidRequest()
    const response = await invoke(request)
    return isPrepareAccountConnectionRecoveryResponse(response) ? response : protocolError()
  }

export const createExecuteAccountConnectionRecoveryClient = (invoke: Invoke) =>
  async (
    request: ExecuteAccountConnectionRecoveryRequestV1
  ): Promise<ExecuteAccountConnectionRecoveryResponseV1> => {
    if (!isExecuteAccountConnectionRecoveryRequest(request)) return invalidRequest()
    const response = await invoke(request)
    return isExecuteAccountConnectionRecoveryResponse(response) ? response : protocolError()
  }
