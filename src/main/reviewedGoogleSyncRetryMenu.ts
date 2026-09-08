import { Menu, MenuItem, dialog, type BrowserWindow } from 'electron'
import type { GoogleAccountSyncRetryCommandService } from './application/googleAccountSyncRetryCommand'
import type { SqliteReviewedGoogleSyncRetryReceipt } from './infrastructure/sqlite/sqliteReviewedGoogleSyncRetryReceipt'

/** Development-only reviewed recovery; no renderer API, startup dispatch or account guessing. */
export const installReviewedGoogleSyncRetryMenu = (options: {
  accountId: string
  command: Pick<GoogleAccountSyncRetryCommandService, 'executeReviewed'>
  receipt: Pick<SqliteReviewedGoogleSyncRetryReceipt, 'available' | 'consume'>
  getWindow(): BrowserWindow | undefined
  notify(): void
}): void => {
  let busy = false
  const item = new MenuItem({
    label: 'Reviewed Gmail read once…',
    enabled: options.receipt.available(),
    click: async () => {
      const window = options.getWindow()
      if (busy || window === undefined || window.isDestroyed()) return
      busy = true
      item.enabled = false
      try {
        if (!options.receipt.available()) return
        const response = await options.command.executeReviewed({
          version: 1, action: 'retry-google-account-sync', accountId: options.accountId
        }, {
          accountId: options.accountId,
          confirm: async () => {
            const result = await dialog.showMessageBox(window, {
              type: 'question', title: 'Reviewed Gmail read',
              message: 'Run one reviewed read-only Gmail sync?',
              detail: 'Uses the existing connected account and saved authorization. Mail may be cached encrypted locally. Gmail will not be modified. This permission can be used only once for the reviewed decoding correction.',
              buttons: ['Cancel', 'Run once'], defaultId: 0, cancelId: 0, noLink: true
            })
            return result.response === 1 && !window.isDestroyed()
          },
          consume: () => options.receipt.consume(options.accountId)
        })
        // Fixed outcome only: never serialize the success result's mailbox aggregates.
        console.info(response.ok ? '[posita-reviewed-sync] synced' :
          `[posita-reviewed-sync] ${response.error.code}`)
        options.notify()
        if (!window.isDestroyed()) await dialog.showMessageBox(window, {
          type: response.ok ? 'info' : 'warning', title: 'Reviewed Gmail read result',
          message: response.ok ? 'The reviewed Gmail sync completed.' : 'The reviewed Gmail sync did not complete.',
          detail: response.ok ? 'Mail was read without changing Gmail. Reload local status to view the encrypted cache.'
            : 'No second attempt will run. The privacy-safe stage record identifies the next investigation boundary.',
          buttons: ['OK'], noLink: true
        })
      } catch {
        console.info('[posita-reviewed-sync] unavailable')
      } finally {
        busy = false
        try { item.enabled = options.receipt.available() } catch { item.enabled = false }
      }
    }
  })
  const menu = Menu.getApplicationMenu() ?? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ])
  const submenu = new Menu()
  submenu.append(item)
  menu.append(new MenuItem({ label: 'Diagnostics', submenu }))
  Menu.setApplicationMenu(menu)
}
