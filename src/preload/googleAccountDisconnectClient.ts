import {
  POSITA_PROTOCOL_VERSION,
  type ExecuteGoogleAccountDisconnectRequestV1,
  type ExecuteGoogleAccountDisconnectResponseV1,
  type PrepareGoogleAccountDisconnectRequestV1,
  type PrepareGoogleAccountDisconnectResponseV1
} from '../shared/contracts'
import {
  isExecuteGoogleAccountDisconnectRequest,
  isExecuteGoogleAccountDisconnectResponse,
  isPrepareGoogleAccountDisconnectRequest,
  isPrepareGoogleAccountDisconnectResponse
} from '../shared/validation'

const invalid = () => ({
  ok: false as const,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR' as const,
    message: 'Posita returned an invalid Google disconnect response.',
    retryable: false
  }
})

export const createPrepareGoogleAccountDisconnectClient = (
  invoke: (request: PrepareGoogleAccountDisconnectRequestV1) => Promise<unknown>
) => async (
  request: PrepareGoogleAccountDisconnectRequestV1
): Promise<PrepareGoogleAccountDisconnectResponseV1> => {
  if (!isPrepareGoogleAccountDisconnectRequest(request)) return invalid()
  const response = await invoke(request)
  return isPrepareGoogleAccountDisconnectResponse(response) ? response : invalid()
}

export const createExecuteGoogleAccountDisconnectClient = (
  invoke: (request: ExecuteGoogleAccountDisconnectRequestV1) => Promise<unknown>
) => async (
  request: ExecuteGoogleAccountDisconnectRequestV1
): Promise<ExecuteGoogleAccountDisconnectResponseV1> => {
  if (!isExecuteGoogleAccountDisconnectRequest(request)) return invalid()
  const response = await invoke(request)
  return isExecuteGoogleAccountDisconnectResponse(response) ? response : invalid()
}
