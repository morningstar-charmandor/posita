import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { bootstrapLocalData } from './bootstrapLocalData'
import { AccountLifecycleStatusService } from './application/accountLifecycleStatus'
import { ApplicationStateService } from './application/applicationStateService'
import { LocalDataDeletionCommandService } from './application/localDataDeletionCommand'
import type { MailRepository } from './application/mailRepository'
import { registerApplicationIpc, type ApplicationIpcRegistration } from './ipc/applicationIpc'

const isTrustedExternalUrl = (candidate: string): boolean => {
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && url.hostname === 'support.google.com'
  } catch {
    return false
  }
}

const createWindow = (): BrowserWindow => {
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
      preload: join(__dirname, '../preload/index.cjs'),
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

  return window
}

app.enableSandbox()
const lifecycleRecoveryAbort = new AbortController()
app.once('before-quit', () => lifecycleRecoveryAbort.abort())

app.whenReady().then(async () => {
  let repository: MailRepository | undefined
  let service = new ApplicationStateService('recovery-required')
  let localDataDeletion = new LocalDataDeletionCommandService()

  try {
    const runtime = await bootstrapLocalData(
      join(app.getPath('userData'), 'posita.sqlite3'),
      lifecycleRecoveryAbort.signal
    )
    repository = runtime.repository
    service = runtime.mode === 'ready'
      ? new ApplicationStateService(
          'ready',
          runtime.service,
          new AccountLifecycleStatusService(runtime.accountLifecycleRepository)
        )
      : new ApplicationStateService('local-data-deleted')
    if (runtime.mode === 'ready') {
      localDataDeletion = new LocalDataDeletionCommandService(
        runtime.confirmationService,
        runtime.deleteLocalDataService,
        service
      )
    }
  } catch {
    console.error('Posita local data initialization failed.')
  }

  const applicationIpc: ApplicationIpcRegistration = registerApplicationIpc({
    applicationState: service,
    localDataDeletion
  })
  const openWindow = (): void => {
    const window = createWindow()
    applicationIpc.allowWindow(window)
  }

  openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })

  app.once('before-quit', () => {
    applicationIpc.dispose()
    repository?.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
