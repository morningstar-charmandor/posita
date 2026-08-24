import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@shared/fixtures'
import { App } from './App'
import type { ApplicationStateDataSource } from './application/mailDataSource'

afterEach(cleanup)

const successResponse = {
  ok: true as const,
  value: {
    version: 1 as const,
    mode: 'ready' as const,
    snapshot: {
      version: 1 as const,
      dataMode: 'fixture-seeded' as const,
      loadedAt: '2026-08-24T05:30:00.000Z',
      dataset: fixtures
    },
    lifecycle: {
      version: 1 as const,
      state: 'idle' as const,
      operations: []
    }
  }
}

const dataSource: ApplicationStateDataSource = {
  loadApplicationState: async () => successResponse
}

const openPulse = async (): Promise<void> => {
  render(<App dataSource={dataSource} />)
  fireEvent.click(await screen.findByText('Confirm Pulse scope with Rahul'))
}

describe('Posita vertical slice', () => {
  it('shows an explicit local-data loading state', () => {
    const pendingSource: ApplicationStateDataSource = {
      loadApplicationState: () => new Promise(() => undefined)
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

  it('names icon-only desktop controls for assistive technology', async () => {
    render(<App dataSource={dataSource} />)

    expect(await screen.findByRole('button', { name: 'Notifications, unread' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show messages with attachments' })).toBeInTheDocument()
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
    const loadApplicationState = vi.fn()
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

    render(<App dataSource={{ loadApplicationState }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Local mail data is unavailable')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Confirm Pulse scope with Rahul')).toBeInTheDocument()
    await waitFor(() => expect(loadApplicationState).toHaveBeenCalledTimes(2))
  })

  it('shows completed local deletion without implying remote mailbox deletion', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: { version: 1, mode: 'local-data-deleted' }
      })
    }} />)

    expect(await screen.findByRole('heading', { name: 'Local data has been deleted' }))
      .toBeInTheDocument()
    expect(screen.getByText('Your provider mailbox was not deleted or changed.'))
      .toBeInTheDocument()
  })

  it('shows a read-only startup recovery state', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: { version: 1, mode: 'recovery-required' }
      })
    }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Local data recovery needs attention')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows safe pending lifecycle progress with account provenance', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: {
          ...successResponse.value,
          lifecycle: {
            version: 1,
            state: 'pending',
            operations: [{
              version: 1,
              operationId: 'disconnect-work-1',
              operationType: 'disconnect-account',
              accountId: 'work',
              status: 'pending',
              stage: 'removing-mail-data',
              completedSteps: 3,
              totalSteps: 5,
              message: 'Account disconnection is pending.'
            }]
          }
        }
      })
    }} />)

    const status = await screen.findByRole('status', { name: 'Local data activity' })
    expect(status).toHaveTextContent('Work · shafi@studio.co')
    expect(screen.getByRole('progressbar', { name: 'Removing cached mail progress' }))
      .toHaveAttribute('value', '3')
  })

  it('announces retry-required lifecycle work without exposing a mutation control', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: {
          ...successResponse.value,
          lifecycle: {
            version: 1,
            state: 'attention-required',
            operations: [{
              version: 1,
              operationId: 'disconnect-work-1',
              operationType: 'disconnect-account',
              accountId: 'work',
              status: 'retry-required',
              stage: 'removing-credentials',
              completedSteps: 1,
              totalSteps: 5,
              message: 'Posita could not finish disconnecting this account. Retry is required.',
              lastErrorCode: 'CREDENTIAL_DELETE_FAILED'
            }]
          }
        }
      })
    }} />)

    const alert = await screen.findByRole('alert', { name: 'Local data activity' })
    expect(alert).toHaveTextContent('Local data needs attention')
    expect(alert).not.toContainElement(screen.queryByRole('button', { name: /retry/i }))
  })
})
