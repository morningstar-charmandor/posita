import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { bootstrapLocalData } from './bootstrapLocalData'
import { AccountLifecycleStatusService } from './application/accountLifecycleStatus'
import { AccountConnectionRecoveryCommandService } from './application/accountConnectionRecoveryCommand'
import { ApplicationStateService } from './application/applicationStateService'
import { LocalDataDeletionCommandService } from './application/localDataDeletionCommand'
import { LiveMailMessageDetailService } from './application/liveMailMessageDetailService'
import { systemClock } from './application/mailApplicationService'
import type { MailRepository } from './application/mailRepository'
import { RetentionMaintenanceOwner } from './application/retentionMaintenanceOwner'
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
let repository: MailRepository | undefined
let applicationIpc: ApplicationIpcRegistration | undefined
let retentionMaintenance: RetentionMaintenanceOwner | undefined
let shutdownProviderMailRead: (() => Promise<void>) | undefined
let shutdownStarted = false

app.on('before-quit', (event) => {
  lifecycleRecoveryAbort.abort()
  if (shutdownStarted) return
  if (!retentionMaintenance) {
    shutdownStarted = true
    applicationIpc?.dispose()
    if (shutdownProviderMailRead) {
      void shutdownProviderMailRead().finally(() => repository?.close())
    } else {
      repository?.close()
    }
    return
  }
  event.preventDefault()
  shutdownStarted = true
  void retentionMaintenance.stop().then(
    () => shutdownProviderMailRead?.(),
    () => shutdownProviderMailRead?.()
  ).finally(() => {
    applicationIpc?.dispose()
    repository?.close()
    app.quit()
  })
})

app.whenReady().then(async () => {
  let service = new ApplicationStateService('recovery-required')
  let localDataDeletion = new LocalDataDeletionCommandService()
  let accountConnectionRecovery = new AccountConnectionRecoveryCommandService()
  let liveMailMessageDetail = new LiveMailMessageDetailService()

  try {
    const runtime = await bootstrapLocalData(
      join(app.getPath('userData'), 'posita.sqlite3'),
      lifecycleRecoveryAbort.signal
    )
    repository = runtime.repository
    if (runtime.mode === 'ready') {
      retentionMaintenance = new RetentionMaintenanceOwner(
        runtime.retentionService,
        systemClock,
        undefined,
        () => applicationIpc?.notifyApplicationStateChanged()
      )
      const providerMailReadWorker = runtime.providerMailReadWorker
      shutdownProviderMailRead = providerMailReadWorker === undefined
        ? undefined
        : () => providerMailReadWorker.shutdown()
      service = new ApplicationStateService(
        'ready',
        runtime.service,
        new AccountLifecycleStatusService(runtime.accountLifecycleRepository),
        retentionMaintenance
      )
      localDataDeletion = new LocalDataDeletionCommandService(
        runtime.confirmationService,
        runtime.deleteLocalDataService,
        service,
        retentionMaintenance
      )
      accountConnectionRecovery = runtime.accountConnectionRecoveryCommandService
      liveMailMessageDetail = new LiveMailMessageDetailService(
        runtime.providerMailSourceDetailSource
      )
    } else {
      service = new ApplicationStateService('local-data-deleted')
    }
  } catch {
    console.error('Posita local data initialization failed.')
  }

  applicationIpc = registerApplicationIpc({
    applicationState: service,
    liveMailMessageDetail,
    localDataDeletion,
    accountConnectionRecovery
  })
  const openWindow = (): void => {
    const window = createWindow()
    applicationIpc?.allowWindow(window)
  }

  openWindow()
  retentionMaintenance?.start()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
