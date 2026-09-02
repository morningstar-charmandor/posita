import {
  POSITA_PROTOCOL_VERSION,
  type OpenLiveMailOriginalRequestV1,
  type OpenLiveMailOriginalResponseV1
} from '../shared/contracts'
import {
  isOpenLiveMailOriginalRequest,
  isOpenLiveMailOriginalResponse
} from '../shared/validation'

type Invoke = (request: OpenLiveMailOriginalRequestV1) => Promise<unknown>

export const createOpenLiveMailOriginalClient = (invoke: Invoke) => async (
  request: OpenLiveMailOriginalRequestV1
): Promise<OpenLiveMailOriginalResponseV1> => {
  if (!isOpenLiveMailOriginalRequest(request)) {
    return {
      ok: false,
      error: {
        version: POSITA_PROTOCOL_VERSION,
        code: 'INVALID_REQUEST',
        message: 'The open-original request was invalid.',
        retryable: false
      }
    }
  }
  const response = await invoke(structuredClone(request))
  if (isOpenLiveMailOriginalResponse(response)) return response
  return {
    ok: false,
    error: {
      version: POSITA_PROTOCOL_VERSION,
      code: 'PROTOCOL_ERROR',
      message: 'The desktop backend returned an unsupported open-original response.',
      retryable: false
    }
  }
}
