import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleAccountSyncRetryControl } from './GoogleAccountSyncRetryControl'

afterEach(cleanup)

describe('GoogleAccountSyncRetryControl', () => {
  it('runs one explicit account-scoped retry and reloads after settlement', async () => {
    let finish: ((value: unknown) => void) | undefined
    const pending = new Promise((resolve) => { finish = resolve })
    const retrySync = vi.fn(() => pending as never)
    const onStatusChanged = vi.fn()
    render(
      <GoogleAccountSyncRetryControl
        accountId="account-work-1"
        dataSource={{ retrySync }}
        onStatusChanged={onStatusChanged}
      />,
      { reactStrictMode: true }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry Gmail sync' }))
    expect(screen.getByRole('button', { name: 'Syncing Gmail…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('approved read-only connection')
    expect(retrySync).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      action: 'retry-google-account-sync',
      accountId: 'account-work-1'
    })
    finish?.({ ok: true, value: { version: 1, status: 'synced' } })
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
  })

  it('sends distinct local-only setup intent and reloads the saved waiting state', async () => {
    const retrySync = vi.fn(async () => ({ ok: false as const, error: {
      version: 1 as const, code: 'SYNC_RETRY_NOT_ALLOWED' as const, retryable: false,
      message: 'A local cooldown has started. No Gmail request was made.'
    } }))
    const onStatusChanged = vi.fn()
    render(<GoogleAccountSyncRetryControl accountId="work" availability="quota-setup"
      dataSource={{ retrySync }} onStatusChanged={onStatusChanged} />, { reactStrictMode: true })
    expect(retrySync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Gmail cooldown' }))
    expect(screen.getByRole('status')).toHaveTextContent('No Gmail request is being made')
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
    expect(retrySync).toHaveBeenCalledExactlyOnceWith({ version: 1, action: 'retry-google-account-sync',
      accountId: 'work', quotaIntent: { version: 1, action: 'start-cooldown' } })
    expect(screen.queryByRole('button', { name: 'Try sync again' })).not.toBeInTheDocument()
  })

  it('requires separate quota confirmation, focuses cancel and permits no one-click repeat after failure', async () => {
    const retrySync = vi.fn(async () => ({ ok: false as const, error: {
      version: 1 as const, code: 'SYNC_FAILED' as const, retryable: true, message: 'Sync did not complete.'
    } }))
    const onStatusChanged = vi.fn()
    render(<GoogleAccountSyncRetryControl accountId="work" availability="quota-ready"
      dataSource={{ retrySync }} onStatusChanged={onStatusChanged} />, { reactStrictMode: true })
    expect(retrySync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Gmail sync' }))
    expect(screen.getByRole('button', { name: 'Cancel resume' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel resume' }))
    expect(retrySync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Gmail sync' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read Gmail once' }))
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
    expect(retrySync).toHaveBeenCalledExactlyOnceWith({ version: 1, action: 'retry-google-account-sync',
      accountId: 'work', quotaIntent: { version: 1, action: 'resume' } })
    expect(screen.queryByRole('button', { name: 'Try sync again' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Gmail sync' }))
    expect(retrySync).toHaveBeenCalledOnce()
  })

  it('refreshes local status after uncertain transport without automatically retrying', async () => {
    const retrySync = vi.fn(async () => { throw new Error('private-transport-detail') })
    const onStatusChanged = vi.fn()
    render(<GoogleAccountSyncRetryControl accountId="work" availability="quota-ready"
      dataSource={{ retrySync }} onStatusChanged={onStatusChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume Gmail sync' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read Gmail once' }))
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-transport-detail')
    expect(screen.queryByRole('button', { name: 'Try sync again' })).not.toBeInTheDocument()
    expect(retrySync).toHaveBeenCalledOnce()
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
    const onStatusChanged = vi.fn()
    render(<GoogleAccountSyncRetryControl
      accountId="account-work-1"
      dataSource={{ retrySync }}
      onStatusChanged={onStatusChanged}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Gmail sync' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gmail synchronization did not complete safely.'
    )
    expect(screen.getByRole('button', { name: 'Try sync again' })).toBeInTheDocument()
    expect(onStatusChanged).toHaveBeenCalledOnce()
  })
})
