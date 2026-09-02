import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenOriginalConfirmation } from './OpenOriginalConfirmation'

afterEach(cleanup)

describe('OpenOriginalConfirmation', () => {
  it('requires an explicit second confirmation before requesting the browser action', async () => {
    const openOriginal = vi.fn(async () => ({
      ok: true as const,
      value: { version: 1 as const, status: 'external-open-requested' as const }
    }))
    render(<OpenOriginalConfirmation
      accountId="account-work-1"
      messageId="message-1"
      accountLabel="Work"
      dataSource={{ openOriginal }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Open original in Gmail…' }))
    expect(openOriginal).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Open Gmail in your browser?' })
    expect(dialog).toHaveTextContent('Posita will not send or change mail.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Open Gmail in browser' }))
    expect(await screen.findByRole('status')).toHaveTextContent('default browser')
    expect(openOriginal).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      action: 'open-original',
      accountId: 'account-work-1',
      messageId: 'message-1'
    })
  })

  it('supports cancellation and safe explicit retry review', async () => {
    const openOriginal = vi.fn(async () => ({
      ok: false as const,
      error: {
        version: 1 as const,
        code: 'OPEN_FAILED' as const,
        message: 'Safe browser error.',
        retryable: true
      }
    }))
    render(<OpenOriginalConfirmation
      accountId="account-work-1"
      messageId="message-1"
      accountLabel="Work"
      dataSource={{ openOriginal }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Open original in Gmail…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(openOriginal).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open original in Gmail…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Gmail in browser' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Safe browser error.')
    fireEvent.click(screen.getByRole('button', { name: 'Review and try again' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(openOriginal).toHaveBeenCalledTimes(1)
  })

  it('closes confirmation with Escape before an external request starts', () => {
    const openOriginal = vi.fn()
    render(<OpenOriginalConfirmation
      accountId="account-work-1"
      messageId="message-1"
      accountLabel="Work"
      dataSource={{ openOriginal }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Open original in Gmail…' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(openOriginal).not.toHaveBeenCalled()
  })
})
