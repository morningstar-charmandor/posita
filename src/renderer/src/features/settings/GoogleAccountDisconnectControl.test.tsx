import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES,
  GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
} from '@shared/contracts'
import { GoogleAccountDisconnectControl } from './GoogleAccountDisconnectControl'

afterEach(cleanup)

describe('GoogleAccountDisconnectControl', () => {
  it('requires the exact typed confirmation before disconnecting', async () => {
    const prepareDisconnect = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        confirmationId: 'confirmation-1',
        operationId: 'operation-1',
        action: 'disconnect-google-account',
        accountId: 'account-1',
        requiredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT,
        expiresAt: '2099-09-03T12:05:00.000Z',
        consequences: GOOGLE_ACCOUNT_DISCONNECT_CONSEQUENCES
      }
    })
    const executeDisconnect = vi.fn().mockResolvedValue({
      ok: true,
      value: { version: 1, operationId: 'operation-1', accountId: 'account-1', status: 'disconnected' }
    })
    const disconnected = vi.fn()
    render(<GoogleAccountDisconnectControl
      accountId="account-1"
      accountLabel="owner@example.test"
      dataSource={{
        prepare: vi.fn(), connect: vi.fn(), cancel: vi.fn(),
        prepareDisconnect, executeDisconnect
      }}
      onDisconnected={disconnected}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }))
    const confirm = await screen.findByRole('button', { name: 'Disconnect Gmail' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Does not delete or change messages in Gmail.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Type DISCONNECT GMAIL/), {
      target: { value: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT }
    })
    fireEvent.click(confirm)

    expect(await screen.findByText('Disconnecting safely…')).toBeInTheDocument()
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalledTimes(1))
    expect(executeDisconnect).toHaveBeenCalledWith(expect.objectContaining({
      enteredText: GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT
    }))
  })
})
