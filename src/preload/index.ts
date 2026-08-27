import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type PositaDesktopApi } from '../shared/contracts'
import { createLoadApplicationStateClient } from './loadApplicationStateClient'
import {
  createExecuteLocalDataDeletionClient,
  createPrepareLocalDataDeletionClient
} from './localDataDeletionClient'

const loadApplicationState = createLoadApplicationStateClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.loadApplicationState, request))
const prepareLocalDataDeletion = createPrepareLocalDataDeletionClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.prepareLocalDataDeletion, request))
const executeLocalDataDeletion = createExecuteLocalDataDeletionClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.executeLocalDataDeletion, request))

const api: PositaDesktopApi = Object.freeze({
  platform: process.platform,
  prototypeMode: true,
  loadApplicationState,
  prepareLocalDataDeletion,
  executeLocalDataDeletion
})

contextBridge.exposeInMainWorld('posita', api)
