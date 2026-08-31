import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type PositaDesktopApi } from '../shared/contracts'
import { createLoadApplicationStateClient } from './loadApplicationStateClient'
import { createApplicationStateChangedClient } from './applicationStateChangedClient'
import {
  createExecuteLocalDataDeletionClient,
  createPrepareLocalDataDeletionClient
} from './localDataDeletionClient'
import {
  createExecuteAccountConnectionRecoveryClient,
  createPrepareAccountConnectionRecoveryClient
} from './accountConnectionRecoveryClient'

const loadApplicationState = createLoadApplicationStateClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.loadApplicationState, request))
const onApplicationStateChanged = createApplicationStateChangedClient((listener) => {
  const receive = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
  ipcRenderer.on(IPC_CHANNELS.applicationStateChanged, receive)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.applicationStateChanged, receive)
})
const prepareLocalDataDeletion = createPrepareLocalDataDeletionClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.prepareLocalDataDeletion, request))
const executeLocalDataDeletion = createExecuteLocalDataDeletionClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.executeLocalDataDeletion, request))
const prepareAccountConnectionRecovery = createPrepareAccountConnectionRecoveryClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.prepareAccountConnectionRecovery, request))
const executeAccountConnectionRecovery = createExecuteAccountConnectionRecoveryClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.executeAccountConnectionRecovery, request))

const api: PositaDesktopApi = Object.freeze({
  platform: process.platform,
  prototypeMode: true,
  loadApplicationState,
  onApplicationStateChanged,
  prepareLocalDataDeletion,
  executeLocalDataDeletion,
  prepareAccountConnectionRecovery,
  executeAccountConnectionRecovery
})

contextBridge.exposeInMainWorld('posita', api)
