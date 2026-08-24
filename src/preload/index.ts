import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type PositaDesktopApi } from '../shared/contracts'
import { createLoadSnapshotClient } from './loadSnapshotClient'

const loadSnapshot = createLoadSnapshotClient((request) =>
  ipcRenderer.invoke(IPC_CHANNELS.loadSnapshot, request))

const api: PositaDesktopApi = Object.freeze({
  platform: process.platform,
  prototypeMode: true,
  loadSnapshot
})

contextBridge.exposeInMainWorld('posita', api)
