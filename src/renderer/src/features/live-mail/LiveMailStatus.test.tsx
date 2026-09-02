import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveMailSnapshotV2 } from '@shared/liveMail'
import { LiveMailStatus } from './LiveMailStatus'

afterEach(cleanup)

const snapshot: LiveMailSnapshotV2 = {
  version: 2,
  dataMode: 'live-canonical',
  loadedAt: '2026-09-01T05:00:00.000Z',
  status: 'ready',
  accounts: [{
    accountId: 'account-1', provider: 'google', status: 'ready',
    displayIdentity: { status: 'available', mailboxAddress: 'owner@example.test' }
  }],
  messages: [{
    id: 'message-1', threadId: 'thread-1', accountId: 'account-1', provider: 'google',
    sender: { address: 'sender@example.test' }, receivedAt: '2026-09-01T04:00:00.000Z',
    subject: 'Hidden summary subject', preview: 'Hidden summary preview', isRead: false,
    attachmentCount: 0
  }],
  hasMore: false
}
const openOriginalDataSource = {
  openOriginal: async () => ({
    ok: false as const,
    error: {
      version: 1 as const,
      code: 'OPEN_UNAVAILABLE' as const,
      message: 'Unavailable in this test.',
      retryable: false
    }
  })
}

describe('LiveMailStatus source inspection', () => {
  it('shows a bounded summary and loads its plain-text source on request', async () => {
    const loadMessageDetail = vi.fn(async () => ({
      ok: true as const,
      value: {
        version: 1 as const,
        status: 'found' as const,
        detail: {
          version: 1 as const, accountId: 'account-1', messageId: 'message-1',
          threadId: 'thread-1', provider: 'google' as const,
          accountIdentity: { status: 'available' as const, mailboxAddress: 'owner@example.test' },
          sender: { address: 'sender@example.test' }, recipients: [],
          sentAt: '2026-09-01T03:59:00.000Z', receivedAt: '2026-09-01T04:00:00.000Z',
          subject: 'Verified source subject', body: { plainText: 'Verified plain text.', truncated: false },
          isRead: false, attachments: []
        }
      }
    }))
    render(<LiveMailStatus snapshot={snapshot} onReload={vi.fn()} detailDataSource={{ loadMessageDetail }} openOriginalDataSource={openOriginalDataSource} />)
    expect(screen.getByText('Hidden summary subject')).toBeInTheDocument()
    expect(screen.getByText('Hidden summary preview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Hidden summary subject from sender@example.test in owner@example.test'
    }))
    expect(await screen.findByRole('heading', { name: 'Verified source subject' })).toBeInTheDocument()
    expect(screen.getByText('Verified plain text.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open original in Gmail…' })).toBeInTheDocument()
    expect(loadMessageDetail).toHaveBeenCalledExactlyOnceWith({
      version: 1, accountId: 'account-1', messageId: 'message-1'
    })
  })

  it('shows missing and retryable safe-error states', async () => {
    const loadMessageDetail = vi.fn()
      .mockResolvedValueOnce({
        ok: true, value: { version: 1, status: 'missing', accountId: 'account-1', messageId: 'message-1' }
      })
      .mockResolvedValueOnce({
        ok: false, error: { version: 1, code: 'DATABASE_UNAVAILABLE', message: 'Safe local error.', retryable: true }
      })
    render(<LiveMailStatus snapshot={snapshot} onReload={vi.fn()} detailDataSource={{ loadMessageDetail }} openOriginalDataSource={openOriginalDataSource} />)
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Hidden summary subject from sender@example.test in owner@example.test'
    }))
    expect(await screen.findByText('Source is no longer retained')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Safe local error.')
    expect(screen.getByRole('button', { name: 'Try source again' })).toBeInTheDocument()
  })

  it('ignores a superseded source result', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    const first = new Promise((resolve) => { resolveFirst = resolve })
    const loadMessageDetail = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        ok: true, value: { version: 1, status: 'missing', accountId: 'account-1', messageId: 'message-1' }
      })
    render(<LiveMailStatus snapshot={snapshot} onReload={vi.fn()} detailDataSource={{ loadMessageDetail }} openOriginalDataSource={openOriginalDataSource} />)
    const inspect = screen.getByRole('button', {
      name: 'Open Hidden summary subject from sender@example.test in owner@example.test'
    })
    fireEvent.click(inspect)
    expect(screen.getByRole('status')).toHaveTextContent('Loading encrypted source')
    fireEvent.click(inspect)
    expect(await screen.findByText('Source is no longer retained')).toBeInTheDocument()
    resolveFirst?.({
      ok: false,
      error: { version: 1, code: 'DATABASE_UNAVAILABLE', message: 'Superseded failure.', retryable: true }
    })
    await waitFor(() => expect(screen.queryByText('Superseded failure.')).not.toBeInTheDocument())
  })
})
