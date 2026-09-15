import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_CONNECT_CONSENT } from '@shared/contracts'
import { GoogleAccountReauthorizationControl } from './GoogleAccountReauthorizationControl'

afterEach(cleanup)

describe('GoogleAccountReauthorizationControl', () => {
  it('requires confirmation and settles once under React Strict Mode', async () => {
    const reauthorize = vi.fn(async () => ({
      ok: true as const,
      value: {
        version: 1 as const,
        accountId: 'account-1',
        provider: 'google' as const,
        mailboxAddress: 'owner@example.test',
        connectedAt: '2026-09-04T00:00:00.000Z',
        status: 'connected-and-synced' as const
      }
    }))
    const onStatusChanged = vi.fn()
    render(<GoogleAccountReauthorizationControl
      accountId="account-1"
      accountLabel="owner@example.test"
      dataSource={{ reauthorize, cancelReauthorization: vi.fn() }}
      onStatusChanged={onStatusChanged}
    />, { reactStrictMode: true })

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Google' }))
    expect(screen.getByText(/keep its encrypted cache/)).toBeInTheDocument()
    expect(reauthorize).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Google' }))
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
    expect(reauthorize).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      action: 'reauthorize-google-account',
      accountId: 'account-1',
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
    })
  })

  it('can cancel a pending browser authorization without claiming success', async () => {
    const reauthorize = vi.fn(() => new Promise(() => undefined) as never)
    const cancelReauthorization = vi.fn(async () => ({
      ok: true as const,
      value: { version: 1 as const, status: 'cancellation-requested' as const }
    }))
    render(<GoogleAccountReauthorizationControl
      accountId="account-1"
      accountLabel="owner@example.test"
      dataSource={{ reauthorize, cancelReauthorization }}
      onStatusChanged={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Google' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Google' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reauthorization' }))
    await waitFor(() => expect(cancelReauthorization).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Reconnect Google' })).toBeInTheDocument()
  })
})
