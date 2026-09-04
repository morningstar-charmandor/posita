import {
  POSITA_PROTOCOL_VERSION,
  type RetryGoogleAccountSyncRequestV1,
  type RetryGoogleAccountSyncResponseV1
} from '../shared/contracts'
import {
  isRetryGoogleAccountSyncRequest,
  isRetryGoogleAccountSyncResponse
} from '../shared/validation'

type Invoke = (request: RetryGoogleAccountSyncRequestV1) => Promise<unknown>

const protocolError = (): RetryGoogleAccountSyncResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR',
    message: 'Posita returned an invalid Gmail synchronization response.',
    retryable: false
  }
})

export const createRetryGoogleAccountSyncClient = (invoke: Invoke) =>
  async (
    request: RetryGoogleAccountSyncRequestV1
  ): Promise<RetryGoogleAccountSyncResponseV1> => {
    if (!isRetryGoogleAccountSyncRequest(request)) return protocolError()
    const response = await invoke(request)
    return isRetryGoogleAccountSyncResponse(response) ? response : protocolError()
  }
