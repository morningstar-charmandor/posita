import { contextBridge } from 'electron'

export interface PositaDesktopApi {
  platform: NodeJS.Platform
  prototypeMode: true
}

const api: PositaDesktopApi = Object.freeze({
  platform: process.platform,
  prototypeMode: true
})

contextBridge.exposeInMainWorld('posita', api)
