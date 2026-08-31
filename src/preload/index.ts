import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type PositaDesktopApi } from '../shared/contracts'
import { createLoadApplicationStateClient } from './loadApplicationStateClient'
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
  prepareLocalDataDeletion,
  executeLocalDataDeletion,
  prepareAccountConnectionRecovery,
  executeAccountConnectionRecovery
})

contextBridge.exposeInMainWorld('posita', api)
