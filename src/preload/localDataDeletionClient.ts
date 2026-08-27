import {
  POSITA_PROTOCOL_VERSION,
  type ExecuteLocalDataDeletionRequestV1,
  type ExecuteLocalDataDeletionResponseV1,
  type LocalDataDeletionResultV1,
  type PrepareLocalDataDeletionResponseV1
} from '../shared/contracts'
import {
  isExecuteLocalDataDeletionRequest,
  isExecuteLocalDataDeletionResponse,
  isPrepareLocalDataDeletionResponse
} from '../shared/validation'

type Invoke = (request: unknown) => Promise<unknown>

const protocolError = (): LocalDataDeletionResultV1<never> => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR',
    message: 'The desktop backend returned an unsupported deletion response.',
    retryable: false
  }
})

const invalidRequest = (): ExecuteLocalDataDeletionResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'INVALID_REQUEST',
    message: 'The local-data deletion request was invalid.',
    retryable: false
  }
})

export const createPrepareLocalDataDeletionClient = (invoke: Invoke) =>
  async (): Promise<PrepareLocalDataDeletionResponseV1> => {
    const response = await invoke({
      version: POSITA_PROTOCOL_VERSION,
      action: 'delete-local-data'
    })
    return isPrepareLocalDataDeletionResponse(response) ? response : protocolError()
  }

export const createExecuteLocalDataDeletionClient = (invoke: Invoke) =>
  async (
    request: ExecuteLocalDataDeletionRequestV1
  ): Promise<ExecuteLocalDataDeletionResponseV1> => {
    if (!isExecuteLocalDataDeletionRequest(request)) return invalidRequest()
    const response = await invoke(request)
    return isExecuteLocalDataDeletionResponse(response) ? response : protocolError()
  }
