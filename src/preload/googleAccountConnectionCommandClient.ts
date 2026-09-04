import {
  POSITA_PROTOCOL_VERSION,
  type CancelGoogleAccountConnectionRequestV1,
  type CancelGoogleAccountConnectionResponseV1,
  type ConnectGoogleAccountRequestV1,
  type ConnectGoogleAccountResponseV1
} from '../shared/contracts'
import {
  isCancelGoogleAccountConnectionRequest,
  isCancelGoogleAccountConnectionResponse,
  isConnectGoogleAccountRequest,
  isConnectGoogleAccountResponse
} from '../shared/validation'

type ConnectInvoke = (request: ConnectGoogleAccountRequestV1) => Promise<unknown>
type CancelInvoke = (request: CancelGoogleAccountConnectionRequestV1) => Promise<unknown>

const protocolError = () => ({
  ok: false as const,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR' as const,
    message: 'Posita returned an invalid Google account response.',
    retryable: false
  }
})

export const createConnectGoogleAccountClient = (invoke: ConnectInvoke) =>
  async (request: ConnectGoogleAccountRequestV1): Promise<ConnectGoogleAccountResponseV1> => {
    if (!isConnectGoogleAccountRequest(request)) return protocolError()
    const response = await invoke(request)
    return isConnectGoogleAccountResponse(response) ? response : protocolError()
  }

export const createCancelGoogleAccountConnectionClient = (invoke: CancelInvoke) =>
  async (
    request: CancelGoogleAccountConnectionRequestV1
  ): Promise<CancelGoogleAccountConnectionResponseV1> => {
    if (!isCancelGoogleAccountConnectionRequest(request)) return protocolError()
    const response = await invoke(request)
    return isCancelGoogleAccountConnectionResponse(response) ? response : protocolError()
  }
