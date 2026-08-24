import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@shared/fixtures'
import { App } from './App'
import type { MailDataSource } from './application/mailDataSource'

afterEach(cleanup)

const successResponse = {
  ok: true as const,
  value: {
    version: 1 as const,
    dataMode: 'fixture-seeded' as const,
    loadedAt: '2026-08-24T05:30:00.000Z',
    dataset: fixtures
  }
}

const dataSource: MailDataSource = {
  loadSnapshot: async () => successResponse
}

const openPulse = async (): Promise<void> => {
  render(<App dataSource={dataSource} />)
  fireEvent.click(await screen.findByText('Confirm Pulse scope with Rahul'))
}

describe('Posita vertical slice', () => {
  it('shows an explicit local-data loading state', () => {
    const pendingSource: MailDataSource = {
      loadSnapshot: () => new Promise(() => undefined)
    }
    render(<App dataSource={pendingSource} />)

    expect(screen.getByLabelText('Loading Posita')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Preparing your local mail context…')).toBeInTheDocument()
  })

  it('moves from the Daily Brief into grounded Pulse context', async () => {
    await openPulse()

    expect(screen.getByRole('heading', { name: 'Pulse' })).toBeInTheDocument()
    expect(screen.getByText('Current status')).toBeInTheDocument()
    expect(screen.getByText('Each update is linked to its source.')).toBeInTheDocument()
  })

  it('opens the source email behind a timeline claim', async () => {
    await openPulse()
    fireEvent.click(screen.getByText('Rahul asked for final confirmation before tomorrow morning.'))

    expect(screen.getByText('Source email')).toBeInTheDocument()
    expect(screen.getByText(/Engineering needs the final call before tomorrow morning/)).toBeInTheDocument()
    expect(screen.getByText('shafi@studio.co')).toBeInTheDocument()
  })

  it('opens an editable draft while keeping send disabled', async () => {
    await openPulse()
    fireEvent.click(screen.getByRole('button', { name: /Draft reply/i }))

    const editor = screen.getByRole('textbox', { name: 'Draft reply text' })
    expect((editor as HTMLTextAreaElement).value).toContain('new dashboard')
    expect(screen.getByRole('button', { name: /Review & send/i })).toBeDisabled()
    expect(screen.getByText('Sending is disabled in prototype mode')).toBeInTheDocument()
  })

  it('shows a retryable database error and reloads through the data source', async () => {
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          version: 1,
          code: 'DATABASE_UNAVAILABLE',
          message: 'Posita could not load local mail data. Please try again.',
          retryable: true
        }
      })
      .mockResolvedValueOnce(successResponse)

    render(<App dataSource={{ loadSnapshot }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Local mail data is unavailable')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Confirm Pulse scope with Rahul')).toBeInTheDocument()
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2))
  })
})
