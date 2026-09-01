import {
  POSITA_PROTOCOL_VERSION,
  type LoadLiveMailMessageDetailResponseV1
} from '../shared/contracts'
import {
  isLiveMailMessageDetailRequestV1,
  isLiveMailMessageDetailResultV1,
  type LiveMailMessageDetailRequestV1
} from '../shared/liveMailDetail'
import { isAppError } from '../shared/validation'

type Invoke = (request: LiveMailMessageDetailRequestV1) => Promise<unknown>

export const createLoadLiveMailMessageDetailClient = (invoke: Invoke) => async (
  request: LiveMailMessageDetailRequestV1
): Promise<LoadLiveMailMessageDetailResponseV1> => {
  if (!isLiveMailMessageDetailRequestV1(request)) {
    return {
      ok: false,
      error: {
        version: POSITA_PROTOCOL_VERSION,
        code: 'INVALID_REQUEST',
        message: 'The source-mail request was invalid.',
        retryable: false
      }
    }
  }
  const response = await invoke(structuredClone(request))
  if (typeof response === 'object' && response !== null && 'ok' in response) {
    if (response.ok === true && 'value' in response &&
        isLiveMailMessageDetailResultV1(response.value)) return response as LoadLiveMailMessageDetailResponseV1
    if (response.ok === false && 'error' in response && isAppError(response.error)) {
      return response as LoadLiveMailMessageDetailResponseV1
    }
  }
  return {
    ok: false,
    error: {
      version: POSITA_PROTOCOL_VERSION,
      code: 'PROTOCOL_ERROR',
      message: 'The desktop backend returned an unsupported source-mail response.',
      retryable: false
    }
  }
}
