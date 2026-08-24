import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  POSITA_PROTOCOL_VERSION,
  type LoadSnapshotRequestV1,
  type LoadSnapshotResponseV1
} from '../../shared/contracts'
import { isLoadSnapshotRequest, isLoadSnapshotResponse } from '../../shared/validation'
import type { MailApplicationService } from '../application/mailApplicationService'

type TrustPredicate = (event: IpcMainInvokeEvent) => boolean

const errorResponse = (
  code: 'INVALID_REQUEST' | 'UNTRUSTED_SENDER' | 'PROTOCOL_ERROR',
  message: string
): LoadSnapshotResponseV1 => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code,
    message,
    retryable: false
  }
})

export const createLoadSnapshotHandler = (
  service: MailApplicationService,
  isTrusted: TrustPredicate
) => (event: IpcMainInvokeEvent, request: unknown): LoadSnapshotResponseV1 => {
  if (!isTrusted(event)) {
    return errorResponse('UNTRUSTED_SENDER', 'This window is not allowed to access local mail data.')
  }

  if (!isLoadSnapshotRequest(request)) {
    return errorResponse('INVALID_REQUEST', 'The local data request was invalid or unsupported.')
  }

  const response = service.loadSnapshot()
  return isLoadSnapshotResponse(response)
    ? response
    : errorResponse('PROTOCOL_ERROR', 'Posita returned an invalid local data response.')
}

export interface ApplicationIpcRegistration {
  allowWindow(window: BrowserWindow): void
  dispose(): void
}

export const registerApplicationIpc = (
  service: MailApplicationService
): ApplicationIpcRegistration => {
  const trustedWebContents = new Set<number>()
  const isTrusted: TrustPredicate = (event) =>
    trustedWebContents.has(event.sender.id) &&
    event.senderFrame === event.sender.mainFrame

  const handler = createLoadSnapshotHandler(service, isTrusted)
  ipcMain.handle(
    IPC_CHANNELS.loadSnapshot,
    (event, request: LoadSnapshotRequestV1) => handler(event, request)
  )

  return {
    allowWindow(window) {
      const id = window.webContents.id
      trustedWebContents.add(id)
      window.once('closed', () => trustedWebContents.delete(id))
    },
    dispose() {
      ipcMain.removeHandler(IPC_CHANNELS.loadSnapshot)
      trustedWebContents.clear()
    }
  }
}
