import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtures } from '@shared/fixtures'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES,
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  GOOGLE_CONNECT_CONSENT,
  LOCAL_DATA_DELETION_CONSEQUENCES
} from '@shared/contracts'
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
    },
    retention: {
      version: 1 as const,
      retentionDays: 90 as const,
      status: 'scheduled' as const,
      nextRunAt: '2026-09-01T05:30:00.000Z',
      lastRun: {
        completedAt: '2026-08-31T05:30:00.000Z',
        cutoffAt: '2026-06-02T05:30:00.000Z',
        changed: false,
        removed: { messages: 0, topics: 0, briefItems: 0, people: 0 }
      }
    },
    connectConsent: GOOGLE_CONNECT_CONSENT
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

  it('renders durable live-empty state without restoring or implying samples', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: {
          ...successResponse.value,
          snapshot: {
            version: 1,
            dataMode: 'live-canonical',
            loadedAt: '2026-09-01T05:00:00.000Z',
            status: 'empty',
            accounts: [],
            messages: [],
            hasMore: false
          }
        }
      })
    }} />)

    expect(await screen.findByRole('heading', { name: 'No live mail is cached' }))
      .toBeInTheDocument()
    expect(screen.getByText(/will not restore deterministic samples/i)).toBeInTheDocument()
    expect(screen.getByText(/Gmail connection, provider sync retry, AI generation/i))
      .toBeInTheDocument()
    expect(screen.queryByText('Confirm Pulse scope with Rahul')).not.toBeInTheDocument()
  })

  it('shows bounded offline provenance and reloads local status without claiming sync retry', async () => {
    const loadApplicationState = vi.fn(async () => ({
      ok: true as const,
      value: {
        ...successResponse.value,
        snapshot: {
          version: 1 as const,
          dataMode: 'live-canonical' as const,
          loadedAt: '2026-09-01T05:00:00.000Z',
          status: 'offline' as const,
          accounts: [{
            accountId: 'account-work-1',
            provider: 'google' as const,
            status: 'offline' as const,
            lastSuccessAt: '2026-08-31T05:00:00.000Z'
          }],
          messages: [],
          hasMore: false
        }
      }
    }))
    render(<App dataSource={{ loadApplicationState }} />)

    expect(await screen.findByRole('heading', {
      name: 'The last recorded sync state is offline'
    })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Live mail account provenance' }))
      .toHaveTextContent('Google · account-work-1')
    fireEvent.click(screen.getByRole('button', { name: 'Reload local status' }))
    await waitFor(() => expect(loadApplicationState).toHaveBeenCalledTimes(2))
  })

  it('does not render canonical summary content before source-detail review is complete', async () => {
    render(<App dataSource={{
      loadApplicationState: async () => ({
        ok: true,
        value: {
          ...successResponse.value,
          snapshot: {
            version: 1,
            dataMode: 'live-canonical',
            loadedAt: '2026-09-01T05:00:00.000Z',
            status: 'ready',
            accounts: [{ accountId: 'account-work-1', provider: 'google', status: 'ready' }],
            messages: [{
              id: 'message-live-1',
              threadId: 'thread-live-1',
              accountId: 'account-work-1',
              provider: 'google',
              sender: { address: 'sender@example.test' },
              receivedAt: '2026-09-01T04:00:00.000Z',
              subject: 'Private canonical subject',
              preview: 'Private canonical preview.',
              isRead: false,
              attachmentCount: 0
            }],
            hasMore: false
          }
        }
      })
    }} />)

    expect(await screen.findByRole('heading', { name: 'Encrypted live-mail data is available' }))
      .toBeInTheDocument()
    expect(screen.getByText(/live workspace remains disabled/i)).toBeInTheDocument()
    expect(screen.queryByText('Private canonical subject')).not.toBeInTheDocument()
    expect(screen.queryByText('Private canonical preview.')).not.toBeInTheDocument()
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

  it('shows reviewed Gmail consent without activating OAuth or implying live accounts', async () => {
    render(<App dataSource={dataSource} />)

    expect(await screen.findByText('3 sample accounts')).toBeInTheDocument()
    expect(screen.getByText('Deterministic sample data · Gmail and AI are not connected'))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settings & privacy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review Gmail connection…' }))

    const dialog = screen.getByRole('dialog', { name: 'Connect Gmail' })
    expect(dialog).toHaveTextContent('Gmail is not connected')
    expect(dialog).toHaveTextContent('gmail.readonly')
    expect(dialog).toHaveTextContent('A rolling 90-day local window')
    expect(dialog).toHaveTextContent('No AI provider is connected')
    expect(dialog).toHaveTextContent('google-gmail-readonly-v1')
    expect(screen.getByRole('button', { name: 'Connect Gmail unavailable in this build' }))
      .toBeDisabled()
  })

  it('shows truthful automatic encrypted retention status in privacy settings', async () => {
    render(<App dataSource={dataSource} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))

    const status = screen.getByRole('status', { name: 'Automatic retention status' })
    expect(status).toHaveTextContent('Automatic 90-day local cleanup')
    expect(status).toHaveTextContent('no expired source mail removed')
    expect(status).toHaveTextContent('Runs on encrypted Posita data only. Gmail is never changed.')
  })

  it('refreshes a maintenance update in place without replacing the workspace', async () => {
    let announce = (): void => undefined
    const attentionResponse = {
      ...successResponse,
      value: {
        ...successResponse.value,
        retention: {
          version: 1 as const,
          retentionDays: 90 as const,
          status: 'attention-required' as const,
          nextRunAt: '2026-08-31T06:30:00.000Z',
          errorCode: 'RETENTION_MAINTENANCE_FAILED' as const,
          message: 'Posita could not finish encrypted local cleanup. It will retry automatically.'
        }
      }
    }
    const loadApplicationState = vi.fn()
      .mockResolvedValueOnce(successResponse)
      .mockResolvedValueOnce(attentionResponse)
    render(<App dataSource={{
      loadApplicationState,
      onApplicationStateChanged: (listener) => {
        announce = () => listener({ version: 1, reason: 'retention-maintenance' })
        return () => undefined
      }
    }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))

    announce()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Automatic local cleanup needs attention')
    expect(screen.queryByLabelText('Loading Posita')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Settings & privacy' })).toBeInTheDocument()
    await waitFor(() => expect(loadApplicationState).toHaveBeenCalledTimes(2))
  })

  it('requires exact typed confirmation before deleting local Posita data', async () => {
    const prepare = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        confirmationId: 'confirm-delete-1',
        operationId: 'delete-local-1',
        action: 'delete-local-data',
        requiredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
        expiresAt: '2026-08-24T12:05:00.000Z',
        consequences: LOCAL_DATA_DELETION_CONSEQUENCES
      }
    })
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      value: { version: 1, operationId: 'delete-local-1', status: 'local-data-deleted' }
    })
    render(<App
      dataSource={dataSource}
      deletionDataSource={{ prepare, execute }}
    />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))
    expect(screen.getByRole('dialog', { name: 'Settings & privacy' }))
      .toHaveTextContent('deterministic sample mail only')
    fireEvent.click(screen.getByRole('button', { name: /Delete local data…/i }))

    const input = await screen.findByLabelText(/Type DELETE LOCAL DATA to continue/i)
    const deleteButton = screen.getByRole('button', { name: 'Delete local data' })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(deleteButton).toBeDisabled()
    expect(screen.getByText('Does not delete or change mail in Gmail.')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'delete local data' } })
    expect(deleteButton).toBeDisabled()
    fireEvent.change(input, { target: { value: DELETE_LOCAL_DATA_CONFIRMATION_TEXT } })
    expect(deleteButton).toBeEnabled()
    fireEvent.click(deleteButton)

    expect(await screen.findByRole('heading', { name: 'Local data has been deleted' }))
      .toBeInTheDocument()
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      confirmationId: 'confirm-delete-1',
      operationId: 'delete-local-1',
      action: 'delete-local-data',
      enteredText: DELETE_LOCAL_DATA_CONFIRMATION_TEXT
    })
  })

  it('keeps deletion errors inside the confirmation surface with explicit retry', async () => {
    const prepare = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        version: 1,
        code: 'STORAGE_UNAVAILABLE',
        message: 'Posita could not prepare deletion safely.',
        retryable: true
      }
    })
    render(<App
      dataSource={dataSource}
      deletionDataSource={{ prepare, execute: vi.fn() }}
    />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))
    fireEvent.click(screen.getByRole('button', { name: /Delete local data…/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Posita could not prepare deletion safely.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2))
  })

  it('recovers only confirmed incomplete local connection data without implying Gmail access', async () => {
    const prepareRecovery = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        confirmationId: 'confirmation-recovery-1',
        operationId: 'operation-recovery-1',
        action: 'discard-orphaned-local-connection-state',
        accountId: 'work',
        expectedStatus: 'credential-only',
        requiredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
        expiresAt: '2026-08-30T12:05:00.000Z',
        consequences: ACCOUNT_CONNECTION_RECOVERY_CONSEQUENCES
      }
    })
    const executeRecovery = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        operationId: 'operation-recovery-1',
        accountId: 'work',
        status: 'absent',
        removed: 'credential',
        reconnectRequired: true
      }
    })
    render(<App
      dataSource={dataSource}
      recoveryDataSource={{ prepare: prepareRecovery, execute: executeRecovery }}
    />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review local connection recovery…' }))

    const dialog = screen.getByRole('dialog', { name: 'Recover local connection' })
    expect(dialog).toHaveTextContent('Gmail is not contacted')
    expect(dialog).toHaveTextContent('This sample build has no live Gmail account')
    fireEvent.click(screen.getByRole('button', { name: 'Check Work local connection state' }))

    const input = await screen.findByLabelText(/Type DISCARD LOCAL CONNECTION to continue/i)
    const discard = screen.getByRole('button', {
      name: 'Discard incomplete local connection'
    })
    expect(discard).toBeDisabled()
    expect(screen.getByText('Does not contact Google or delete or change mail in Gmail.'))
      .toBeInTheDocument()
    fireEvent.change(input, {
      target: { value: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT }
    })
    expect(discard).toBeEnabled()
    fireEvent.click(discard)

    expect(await screen.findByText('Local connection data was recovered')).toBeInTheDocument()
    expect(screen.getByText('A fresh Gmail connection will be required later. Gmail was not changed.'))
      .toBeInTheDocument()
    expect(prepareRecovery).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      action: 'discard-orphaned-local-connection-state',
      accountId: 'work'
    })
    expect(executeRecovery).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      confirmationId: 'confirmation-recovery-1',
      operationId: 'operation-recovery-1',
      action: 'discard-orphaned-local-connection-state',
      accountId: 'work',
      expectedStatus: 'credential-only',
      enteredText: ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT
    })
  })

  it('reports when sample account connection recovery is not needed without changing data', async () => {
    const prepareRecovery = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        version: 1,
        code: 'RECOVERY_NOT_NEEDED',
        message: 'No incomplete local connection data was found for this account.',
        retryable: false
      }
    })
    const executeRecovery = vi.fn()
    render(<App
      dataSource={dataSource}
      recoveryDataSource={{ prepare: prepareRecovery, execute: executeRecovery }}
    />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings & privacy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review local connection recovery…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check Work local connection state' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('No recovery is needed for Work')
    expect(status).toHaveTextContent('Gmail remains unconnected in this sample build')
    expect(executeRecovery).not.toHaveBeenCalled()
  })
})
