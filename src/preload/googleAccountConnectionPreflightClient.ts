import {
  POSITA_PROTOCOL_VERSION,
  type PrepareGoogleAccountConnectionRequestV1,
  type PrepareGoogleAccountConnectionResponseV1
} from '../shared/contracts'
import {
  isPrepareGoogleAccountConnectionRequest,
  isPrepareGoogleAccountConnectionResponse
} from '../shared/validation'

type Invoke = (request: unknown) => Promise<unknown>

const failure = (
  code: 'INVALID_REQUEST' | 'PROTOCOL_ERROR',
  message: string
): PrepareGoogleAccountConnectionResponseV1 => ({
  ok: false,
  error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable: false }
})

export const createPrepareGoogleAccountConnectionClient = (invoke: Invoke) =>
  async (
    request: PrepareGoogleAccountConnectionRequestV1
  ): Promise<PrepareGoogleAccountConnectionResponseV1> => {
    if (!isPrepareGoogleAccountConnectionRequest(request)) {
      return failure('INVALID_REQUEST', 'The Gmail connection preparation request was invalid.')
    }
    const response = await invoke(request)
    return isPrepareGoogleAccountConnectionResponse(response)
      ? response
      : failure('PROTOCOL_ERROR', 'The desktop backend returned an unsupported connection response.')
  }
