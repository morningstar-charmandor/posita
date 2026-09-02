import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  POSITA_PROTOCOL_VERSION,
  type AccountConnectionRecoveryErrorCodeV1,
  type AccountConnectionRecoveryResponseV1,
  type ExecuteAccountConnectionRecoveryRequestV1,
  type ExecuteAccountConnectionRecoveryResponseV1,
  type ExecuteLocalDataDeletionRequestV1,
  type ExecuteLocalDataDeletionResponseV1,
  type LoadApplicationStateRequestV1,
  type LoadApplicationStateResponseV1,
  type LoadLiveMailMessageDetailResponseV1,
  type OpenLiveMailOriginalRequestV1,
  type OpenLiveMailOriginalResponseV1,
  type LocalDataDeletionErrorCodeV1,
  type LocalDataDeletionResultV1,
  type PrepareLocalDataDeletionRequestV1,
  type PrepareLocalDataDeletionResponseV1,
  type PrepareAccountConnectionRecoveryRequestV1,
  type PrepareAccountConnectionRecoveryResponseV1
} from '../../shared/contracts'
import {
  isLiveMailMessageDetailRequestV1,
  isLiveMailMessageDetailResultV1,
  type LiveMailMessageDetailRequestV1
} from '../../shared/liveMailDetail'
import {
  isExecuteLocalDataDeletionRequest,
  isExecuteLocalDataDeletionResponse,
  isExecuteAccountConnectionRecoveryRequest,
  isExecuteAccountConnectionRecoveryResponse,
  isLoadApplicationStateRequest,
  isLoadApplicationStateResponse,
  isPrepareLocalDataDeletionResponse,
  isPrepareAccountConnectionRecoveryResponse,
  isOpenLiveMailOriginalRequest,
  isOpenLiveMailOriginalResponse
} from '../../shared/validation'
import type { ApplicationStateService } from '../application/applicationStateService'
import type { LocalDataDeletionCommandService } from '../application/localDataDeletionCommand'
import type { AccountConnectionRecoveryCommandService } from '../application/accountConnectionRecoveryCommand'
import type { LiveMailMessageDetailService } from '../application/liveMailMessageDetailService'
import type { OpenProviderMailOriginalService } from '../application/openProviderMailOriginal'

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

  authorize(event: IpcMainInvokeEvent, request: {
    confirmationId: string
    operationId: string
  }): boolean {
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
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<LoadApplicationStateResponseV1> => {
  if (!isTrusted(event)) {
    return errorResponse('UNTRUSTED_SENDER', 'This window is not allowed to access local mail data.')
  }

  if (!isLoadApplicationStateRequest(request)) {
    return errorResponse('INVALID_REQUEST', 'The application-state request was invalid or unsupported.')
  }

  const response = await service.load()
  return isLoadApplicationStateResponse(response)
    ? response
    : errorResponse('PROTOCOL_ERROR', 'Posita returned an invalid application-state response.')
}

export const createLoadLiveMailMessageDetailHandler = (
  service: LiveMailMessageDetailService,
  isTrusted: TrustPredicate
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<LoadLiveMailMessageDetailResponseV1> => {
  const fail = (
    code: 'INVALID_REQUEST' | 'UNTRUSTED_SENDER' | 'PROTOCOL_ERROR',
    message: string
  ): LoadLiveMailMessageDetailResponseV1 => ({
    ok: false,
    error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable: false }
  })
  if (!isTrusted(event)) {
    return fail('UNTRUSTED_SENDER', 'This window is not allowed to inspect source mail.')
  }
  if (!isLiveMailMessageDetailRequestV1(request)) {
    return fail('INVALID_REQUEST', 'The source-mail request was invalid or unsupported.')
  }
  const response = await service.load(request)
  if (response.ok ? isLiveMailMessageDetailResultV1(response.value) : true) return response
  return fail('PROTOCOL_ERROR', 'Posita returned an invalid source-mail response.')
}

export const createOpenLiveMailOriginalHandler = (
  service: OpenProviderMailOriginalService,
  isTrusted: TrustPredicate
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<OpenLiveMailOriginalResponseV1> => {
  const fail = (
    code: 'INVALID_REQUEST' | 'UNTRUSTED_SENDER' | 'PROTOCOL_ERROR',
    message: string
  ): OpenLiveMailOriginalResponseV1 => ({
    ok: false,
    error: { version: POSITA_PROTOCOL_VERSION, code, message, retryable: false }
  })
  if (!isTrusted(event)) {
    return fail('UNTRUSTED_SENDER', 'This window is not allowed to open original mail.')
  }
  if (!isOpenLiveMailOriginalRequest(request)) {
    return fail('INVALID_REQUEST', 'The open-original request was invalid or unsupported.')
  }
  const response = await service.execute(request)
  return isOpenLiveMailOriginalResponse(response)
    ? response
    : fail('PROTOCOL_ERROR', 'Posita returned an invalid open-original response.')
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

const recoveryErrorResponse = (
  code: AccountConnectionRecoveryErrorCodeV1,
  message: string
): AccountConnectionRecoveryResponseV1<never> => ({
  ok: false,
  error: {
    version: POSITA_PROTOCOL_VERSION,
    code,
    message,
    retryable: false
  }
})

export const createPrepareAccountConnectionRecoveryHandler = (
  service: Pick<AccountConnectionRecoveryCommandService, 'prepare'>,
  isTrusted: TrustPredicate,
  authorization: LocalDataDeletionIpcAuthorization
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<PrepareAccountConnectionRecoveryResponseV1> => {
  if (!isTrusted(event)) {
    return recoveryErrorResponse(
      'UNTRUSTED_SENDER',
      'This window is not allowed to prepare local connection recovery.'
    )
  }
  const response = await service.prepare(request)
  if (!isPrepareAccountConnectionRecoveryResponse(response)) {
    return recoveryErrorResponse('PROTOCOL_ERROR', 'Posita returned an invalid recovery response.')
  }
  if (response.ok) authorization.record(event, response.value)
  return response
}

export const createExecuteAccountConnectionRecoveryHandler = (
  service: Pick<AccountConnectionRecoveryCommandService, 'execute'>,
  isTrusted: TrustPredicate,
  authorization: LocalDataDeletionIpcAuthorization
) => async (
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<ExecuteAccountConnectionRecoveryResponseV1> => {
  if (!isTrusted(event)) {
    return recoveryErrorResponse(
      'UNTRUSTED_SENDER',
      'This window is not allowed to recover local connection data.'
    )
  }
  if (!isExecuteAccountConnectionRecoveryRequest(request)) {
    return recoveryErrorResponse('INVALID_REQUEST', 'The local connection recovery request was invalid.')
  }
  if (!authorization.authorize(event, request)) {
    return recoveryErrorResponse(
      'CONFIRMATION_NOT_FOUND',
      'The recovery confirmation is not available to this window.'
    )
  }
  authorization.release(request.confirmationId)
  const response = await service.execute(request)
  return isExecuteAccountConnectionRecoveryResponse(response)
    ? response
    : recoveryErrorResponse('PROTOCOL_ERROR', 'Posita returned an invalid recovery response.')
}

export interface ApplicationIpcRegistration {
  allowWindow(window: BrowserWindow): void
  notifyApplicationStateChanged(): void
  dispose(): void
}

export interface ApplicationIpcServices {
  applicationState: ApplicationStateService
  liveMailMessageDetail: LiveMailMessageDetailService
  openProviderMailOriginal: OpenProviderMailOriginalService
  localDataDeletion: LocalDataDeletionCommandService
  accountConnectionRecovery: AccountConnectionRecoveryCommandService
}

export const registerApplicationIpc = (services: ApplicationIpcServices): ApplicationIpcRegistration => {
  const trustedWindows = new Map<number, BrowserWindow>()
  const isTrusted: TrustPredicate = (event) =>
    trustedWindows.has(event.sender.id) &&
    event.senderFrame === event.sender.mainFrame

  const handler = createLoadApplicationStateHandler(services.applicationState, isTrusted)
  const loadMessageDetail = createLoadLiveMailMessageDetailHandler(
    services.liveMailMessageDetail,
    isTrusted
  )
  const openOriginal = createOpenLiveMailOriginalHandler(
    services.openProviderMailOriginal,
    isTrusted
  )
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
  const recoveryAuthorization = new LocalDataDeletionIpcAuthorization()
  const prepareRecovery = createPrepareAccountConnectionRecoveryHandler(
    services.accountConnectionRecovery,
    isTrusted,
    recoveryAuthorization
  )
  const executeRecovery = createExecuteAccountConnectionRecoveryHandler(
    services.accountConnectionRecovery,
    isTrusted,
    recoveryAuthorization
  )
  ipcMain.handle(
    IPC_CHANNELS.loadApplicationState,
    (event, request: LoadApplicationStateRequestV1) => handler(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.loadLiveMailMessageDetail,
    (event, request: LiveMailMessageDetailRequestV1) => loadMessageDetail(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.openLiveMailOriginal,
    (event, request: OpenLiveMailOriginalRequestV1) => openOriginal(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.prepareLocalDataDeletion,
    (event, request: PrepareLocalDataDeletionRequestV1) => prepareDeletion(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.executeLocalDataDeletion,
    (event, request: ExecuteLocalDataDeletionRequestV1) => executeDeletion(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.prepareAccountConnectionRecovery,
    (event, request: PrepareAccountConnectionRecoveryRequestV1) =>
      prepareRecovery(event, request)
  )
  ipcMain.handle(
    IPC_CHANNELS.executeAccountConnectionRecovery,
    (event, request: ExecuteAccountConnectionRecoveryRequestV1) =>
      executeRecovery(event, request)
  )

  return {
    allowWindow(window) {
      const id = window.webContents.id
      trustedWindows.set(id, window)
      window.once('closed', () => {
        trustedWindows.delete(id)
        deletionAuthorization.revokeSender(id)
        recoveryAuthorization.revokeSender(id)
      })
    },
    notifyApplicationStateChanged() {
      const event = Object.freeze({
        version: POSITA_PROTOCOL_VERSION,
        reason: 'retention-maintenance' as const
      })
      for (const window of trustedWindows.values()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.applicationStateChanged, event)
        }
      }
    },
    dispose() {
      ipcMain.removeHandler(IPC_CHANNELS.loadApplicationState)
      ipcMain.removeHandler(IPC_CHANNELS.loadLiveMailMessageDetail)
      ipcMain.removeHandler(IPC_CHANNELS.openLiveMailOriginal)
      ipcMain.removeHandler(IPC_CHANNELS.prepareLocalDataDeletion)
      ipcMain.removeHandler(IPC_CHANNELS.executeLocalDataDeletion)
      ipcMain.removeHandler(IPC_CHANNELS.prepareAccountConnectionRecovery)
      ipcMain.removeHandler(IPC_CHANNELS.executeAccountConnectionRecovery)
      trustedWindows.clear()
      deletionAuthorization.clear()
      recoveryAuthorization.clear()
    }
  }
}
