import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type PositaDesktopApi } from '../shared/contracts'
import { createLoadApplicationStateClient } from './loadApplicationStateClient'

const loadApplicationState = createLoadApplicationStateClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.loadApplicationState, request))

const api: PositaDesktopApi = Object.freeze({
  platform: process.platform,
  prototypeMode: true,
  loadApplicationState
})

contextBridge.exposeInMainWorld('posita', api)
