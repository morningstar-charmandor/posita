import {
  POSITA_PROTOCOL_VERSION,
  type CancelGoogleAccountConnectionResponseV1,
  type CancelGoogleAccountReauthorizationRequestV1,
  type ConnectGoogleAccountResponseV1,
  type ReauthorizeGoogleAccountRequestV1
} from '../shared/contracts'
import {
  isCancelGoogleAccountConnectionResponse,
  isCancelGoogleAccountReauthorizationRequest,
  isConnectGoogleAccountResponse,
  isReauthorizeGoogleAccountRequest
} from '../shared/validation'

const protocolError = () => ({
  ok: false as const,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code: 'PROTOCOL_ERROR' as const,
    message: 'Posita returned an invalid Google account response.',
    retryable: false
  }
})

export const createReauthorizeGoogleAccountClient = (
  invoke: (request: ReauthorizeGoogleAccountRequestV1) => Promise<unknown>
) => async (request: ReauthorizeGoogleAccountRequestV1): Promise<ConnectGoogleAccountResponseV1> => {
  if (!isReauthorizeGoogleAccountRequest(request)) return protocolError()
  const response = await invoke(request)
  return isConnectGoogleAccountResponse(response) ? response : protocolError()
}

export const createCancelGoogleAccountReauthorizationClient = (
  invoke: (request: CancelGoogleAccountReauthorizationRequestV1) => Promise<unknown>
) => async (
  request: CancelGoogleAccountReauthorizationRequestV1
): Promise<CancelGoogleAccountConnectionResponseV1> => {
  if (!isCancelGoogleAccountReauthorizationRequest(request)) return protocolError()
  const response = await invoke(request)
  return isCancelGoogleAccountConnectionResponse(response) ? response : protocolError()
}
