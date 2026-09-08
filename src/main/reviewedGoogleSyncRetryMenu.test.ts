import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installReviewedGoogleSyncRetryMenu } from './reviewedGoogleSyncRetryMenu'
import type { ReviewedGoogleSyncRetryApproval } from './application/googleAccountSyncRetryCommand'

const native = vi.hoisted(() => ({
  items: [] as Array<{ label?: string; enabled?: boolean; click?: () => Promise<void> }>,
  showMessageBox: vi.fn()
}))
vi.mock('electron', () => ({
  MenuItem: class {
    constructor(options: { label?: string; enabled?: boolean; click?: () => Promise<void> }) {
      Object.assign(this, options)
      native.items.push(this)
    }
  },
  Menu: class {
    append(): void {}
    static getApplicationMenu() { return { append: () => undefined } }
    static setApplicationMenu(): void {}
  },
  dialog: { showMessageBox: native.showMessageBox }
}))
beforeEach(() => { native.items.length = 0; native.showMessageBox.mockReset() })

describe('native reviewed Gmail confirmation', () => {
  it.each([0, 1])('does not dispatch at installation and binds dialog choice %s', async (response) => {
    native.showMessageBox.mockResolvedValue({ response })
    const consume = vi.fn(() => true)
    const executeReviewed = vi.fn(async (_request: unknown, approval: ReviewedGoogleSyncRetryApproval) => {
      if (await approval.confirm()) approval.consume()
      return { ok: false as const, error: { version: 1 as const, code: 'SYNC_RETRY_NOT_ALLOWED' as const,
        message: 'Not available.', retryable: false } }
    })
    installReviewedGoogleSyncRetryMenu({ accountId: 'account-work-1',
      command: { executeReviewed }, receipt: { available: () => true, consume },
      getWindow: () => ({ isDestroyed: () => false }) as unknown as BrowserWindow,
      notify: () => undefined
    })
    expect(executeReviewed).not.toHaveBeenCalled()
    expect(native.showMessageBox).not.toHaveBeenCalled()
    await native.items.find(({ label }) => label === 'Reviewed Gmail read once…')!.click!()
    expect(native.showMessageBox.mock.calls[0]![1]).toMatchObject({
      buttons: ['Cancel', 'Run once'], defaultId: 0, cancelId: 0
    })
    expect(consume).toHaveBeenCalledTimes(response === 1 ? 1 : 0)
  })

  it('does not enter the command after durable permission was consumed', async () => {
    const executeReviewed = vi.fn()
    installReviewedGoogleSyncRetryMenu({ accountId: 'account-work-1',
      command: { executeReviewed }, receipt: { available: () => false, consume: () => false },
      getWindow: () => ({ isDestroyed: () => false }) as unknown as BrowserWindow,
      notify: () => undefined
    })
    const item = native.items.find(({ label }) => label === 'Reviewed Gmail read once…')!
    expect(item.enabled).toBe(false)
    await item.click!()
    expect(executeReviewed).not.toHaveBeenCalled()
  })
})
