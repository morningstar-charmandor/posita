import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleAccountSyncRetryControl } from './GoogleAccountSyncRetryControl'

afterEach(cleanup)

describe('GoogleAccountSyncRetryControl', () => {
  it('runs one explicit account-scoped retry and reloads only after success', async () => {
    let finish: ((value: unknown) => void) | undefined
    const pending = new Promise((resolve) => { finish = resolve })
    const retrySync = vi.fn(() => pending as never)
    const onSynced = vi.fn()
    render(<GoogleAccountSyncRetryControl
      accountId="account-work-1"
      dataSource={{ retrySync }}
      onSynced={onSynced}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Gmail sync' }))
    expect(screen.getByRole('button', { name: 'Syncing Gmail…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('approved read-only connection')
    expect(retrySync).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      action: 'retry-google-account-sync',
      accountId: 'account-work-1'
    })
    finish?.({ ok: true, value: { version: 1, status: 'synced' } })
    await waitFor(() => expect(onSynced).toHaveBeenCalledOnce())
  })

  it('shows a bounded retryable error without claiming success', async () => {
    const retrySync = vi.fn(async () => ({
      ok: false as const,
      error: {
        version: 1 as const,
        code: 'SYNC_FAILED' as const,
        message: 'Gmail synchronization did not complete safely.',
        retryable: true
      }
    }))
    const onSynced = vi.fn()
    render(<GoogleAccountSyncRetryControl
      accountId="account-work-1"
      dataSource={{ retrySync }}
      onSynced={onSynced}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Gmail sync' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gmail synchronization did not complete safely.'
    )
    expect(screen.getByRole('button', { name: 'Try sync again' })).toBeInTheDocument()
    expect(onSynced).not.toHaveBeenCalled()
  })
})
