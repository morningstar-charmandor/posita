import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

const isTrustedExternalUrl = (candidate: string): boolean => {
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && url.hostname === 'support.google.com'
  } catch {
    return false
  }
}

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'Posita',
    backgroundColor: '#f5f5f1',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.enableSandbox()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
