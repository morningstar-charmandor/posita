import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  POSITA_PROTOCOL_VERSION,
  type LoadApplicationStateRequestV1,
  type LoadApplicationStateResponseV1
} from '../../shared/contracts'
import {
  isLoadApplicationStateRequest,
  isLoadApplicationStateResponse
} from '../../shared/validation'
import type { ApplicationStateService } from '../application/applicationStateService'

type TrustPredicate = (event: IpcMainInvokeEvent) => boolean

const errorResponse = (
  code: 'INVALID_REQUEST' | 'UNTRUSTED_SENDER' | 'PROTOCOL_ERROR',
  message: string
): LoadApplicationStateResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code,
    message,
    retryable: false
  }
})

export const createLoadApplicationStateHandler = (
  service: ApplicationStateService,
  isTrusted: TrustPredicate
) => (event: IpcMainInvokeEvent, request: unknown): LoadApplicationStateResponseV1 => {
  if (!isTrusted(event)) {
    return errorResponse('UNTRUSTED_SENDER', 'This window is not allowed to access local mail data.')
  }

  if (!isLoadApplicationStateRequest(request)) {
    return errorResponse('INVALID_REQUEST', 'The application-state request was invalid or unsupported.')
  }

  const response = service.load()
  return isLoadApplicationStateResponse(response)
    ? response
    : errorResponse('PROTOCOL_ERROR', 'Posita returned an invalid application-state response.')
}

export interface ApplicationIpcRegistration {
  allowWindow(window: BrowserWindow): void
  dispose(): void
}

export const registerApplicationIpc = (
  service: ApplicationStateService
): ApplicationIpcRegistration => {
  const trustedWebContents = new Set<number>()
  const isTrusted: TrustPredicate = (event) =>
    trustedWebContents.has(event.sender.id) &&
    event.senderFrame === event.sender.mainFrame

  const handler = createLoadApplicationStateHandler(service, isTrusted)
  ipcMain.handle(
    IPC_CHANNELS.loadApplicationState,
    (event, request: LoadApplicationStateRequestV1) => handler(event, request)
  )

  return {
    allowWindow(window) {
      const id = window.webContents.id
      trustedWebContents.add(id)
      window.once('closed', () => trustedWebContents.delete(id))
    },
    dispose() {
      ipcMain.removeHandler(IPC_CHANNELS.loadApplicationState)
      trustedWebContents.clear()
    }
  }
}
