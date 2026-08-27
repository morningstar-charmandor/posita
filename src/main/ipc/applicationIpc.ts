import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  POSITA_PROTOCOL_VERSION,
  type ExecuteLocalDataDeletionRequestV1,
  type ExecuteLocalDataDeletionResponseV1,
  type LoadApplicationStateRequestV1,
  type LoadApplicationStateResponseV1,
  type LocalDataDeletionErrorCodeV1,
  type LocalDataDeletionResultV1,
  type PrepareLocalDataDeletionRequestV1,
  type PrepareLocalDataDeletionResponseV1
} from '../../shared/contracts'
import {
  isExecuteLocalDataDeletionRequest,
  isExecuteLocalDataDeletionResponse,
  isLoadApplicationStateRequest,
  isLoadApplicationStateResponse,
  isPrepareLocalDataDeletionResponse
} from '../../shared/validation'
import type { ApplicationStateService } from '../application/applicationStateService'
import type { LocalDataDeletionCommandService } from '../application/localDataDeletionCommand'

type TrustPredicate = (event: IpcMainInvokeEvent) => boolean

interface OwnedDeletionChallenge {
  senderId: number
  operationId: string
  expiresAtMs: number
  executionStarted: boolean
}

export class LocalDataDeletionIpcAuthorization {
  private readonly challenges = new Map<string, OwnedDeletionChallenge>()

  constructor(private readonly now: () => number = Date.now) {}

  record(event: IpcMainInvokeEvent, challenge: {
    confirmationId: string
    operationId: string
    expiresAt: string
  }): void {
    this.prune()
    this.challenges.set(challenge.confirmationId, {
      senderId: event.sender.id,
      operationId: challenge.operationId,
      expiresAtMs: Date.parse(challenge.expiresAt),
      executionStarted: false
    })
  }

  authorize(event: IpcMainInvokeEvent, request: ExecuteLocalDataDeletionRequestV1): boolean {
    this.prune()
    const challenge = this.challenges.get(request.confirmationId)
    if (!challenge || challenge.senderId !== event.sender.id ||
        challenge.operationId !== request.operationId) return false
    challenge.executionStarted = true
    return true
  }

  release(confirmationId: string): void {
    this.challenges.delete(confirmationId)
  }

  revokeSender(senderId: number): void {
    for (const [confirmationId, challenge] of this.challenges) {
      if (challenge.senderId === senderId) this.challenges.delete(confirmationId)
    }
  }

  clear(): void {
    this.challenges.clear()
  }

  private prune(): void {
    const now = this.now()
    for (const [confirmationId, challenge] of this.challenges) {
      if (!challenge.executionStarted && challenge.expiresAtMs < now) {
        this.challenges.delete(confirmationId)
      }
    }
  }
}

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

const deletionErrorResponse = (
  code: LocalDataDeletionErrorCodeV1,
  message: string
): LocalDataDeletionResultV1<never> => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code,
    message,
    retryable: false
  }
})

export const createPrepareLocalDataDeletionHandler = (
  service: LocalDataDeletionCommandService,
  isTrusted: TrustPredicate,
  authorization: LocalDataDeletionIpcAuthorization
) => (event: IpcMainInvokeEvent, request: unknown): PrepareLocalDataDeletionResponseV1 => {
  if (!isTrusted(event)) {
    return deletionErrorResponse(
      'UNTRUSTED_SENDER',
      'This window is not allowed to prepare local-data deletion.'
    )
  }
  const response = service.prepare(request)
  if (!isPrepareLocalDataDeletionResponse(response)) {
    return deletionErrorResponse('PROTOCOL_ERROR', 'Posita returned an invalid deletion response.')
  }
  if (response.ok) authorization.record(event, response.value)
  return response
}

export const createExecuteLocalDataDeletionHandler = (
  service: LocalDataDeletionCommandService,
  isTrusted: TrustPredicate,
  authorization: LocalDataDeletionIpcAuthorization
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<ExecuteLocalDataDeletionResponseV1> => {
  if (!isTrusted(event)) {
    return deletionErrorResponse(
      'UNTRUSTED_SENDER',
      'This window is not allowed to delete local data.'
    )
  }
  if (!isExecuteLocalDataDeletionRequest(request)) {
    return deletionErrorResponse('INVALID_REQUEST', 'The local-data deletion request was invalid.')
  }
  if (!authorization.authorize(event, request)) {
    return deletionErrorResponse(
      'CONFIRMATION_NOT_FOUND',
      'The confirmation challenge is not available to this window.'
    )
  }
  const response = await service.execute(request)
  if (!isExecuteLocalDataDeletionResponse(response)) {
    authorization.release(request.confirmationId)
    return deletionErrorResponse('PROTOCOL_ERROR', 'Posita returned an invalid deletion response.')
  }
  if (response.ok || !response.error.retryable) {
    authorization.release(request.confirmationId)
  }
  return response
}

export interface ApplicationIpcRegistration {
  allowWindow(window: BrowserWindow): void
  dispose(): void
}

export interface ApplicationIpcServices {
  applicationState: ApplicationStateService
  localDataDeletion: LocalDataDeletionCommandService
}

export const registerApplicationIpc = (services: ApplicationIpcServices): ApplicationIpcRegistration => {
  const trustedWebContents = new Set<number>()
  const isTrusted: TrustPredicate = (event) =>
    trustedWebContents.has(event.sender.id) &&
    event.senderFrame === event.sender.mainFrame

  const handler = createLoadApplicationStateHandler(services.applicationState, isTrusted)
  const deletionAuthorization = new LocalDataDeletionIpcAuthorization()
  const prepareDeletion = createPrepareLocalDataDeletionHandler(
    services.localDataDeletion,
    isTrusted,
    deletionAuthorization
  )
  const executeDeletion = createExecuteLocalDataDeletionHandler(
    services.localDataDeletion,
    isTrusted,
    deletionAuthorization
  )
  ipcMain.handle(
    IPC_CHANNELS.loadApplicationState,
    (event, request: LoadApplicationStateRequestV1) => handler(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.prepareLocalDataDeletion,
    (event, request: PrepareLocalDataDeletionRequestV1) => prepareDeletion(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.executeLocalDataDeletion,
    (event, request: ExecuteLocalDataDeletionRequestV1) => executeDeletion(event, request)
  )

  return {
    allowWindow(window) {
      const id = window.webContents.id
      trustedWebContents.add(id)
      window.once('closed', () => {
        trustedWebContents.delete(id)
        deletionAuthorization.revokeSender(id)
      })
    },
    dispose() {
      ipcMain.removeHandler(IPC_CHANNELS.loadApplicationState)
      ipcMain.removeHandler(IPC_CHANNELS.prepareLocalDataDeletion)
      ipcMain.removeHandler(IPC_CHANNELS.executeLocalDataDeletion)
      trustedWebContents.clear()
      deletionAuthorization.clear()
    }
  }
}
