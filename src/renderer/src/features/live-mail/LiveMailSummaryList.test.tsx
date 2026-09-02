import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveMailAccountV2, LiveMailMessageSummaryV2 } from '@shared/liveMail'
import { LiveMailSummaryList } from './LiveMailSummaryList'

afterEach(cleanup)

const accounts: LiveMailAccountV2[] = [{
  accountId: 'account-work-1',
  provider: 'google',
  status: 'ready',
  displayIdentity: {
    status: 'available',
    displayLabel: 'Work',
    mailboxAddress: 'owner.work@example.test'
  }
}, {
  accountId: 'account-unknown-1',
  provider: 'google',
  status: 'attention-required',
  displayIdentity: { status: 'unavailable' }
}]

const messages: LiveMailMessageSummaryV2[] = [{
  id: 'message-1',
  threadId: 'thread-1',
  accountId: 'account-work-1',
  provider: 'google',
  sender: { displayName: 'Rahul', address: 'rahul@example.test' },
  receivedAt: '2026-09-01T04:00:00.000Z',
  subject: 'Confirm the scope',
  preview: 'Can we move ahead with this version?',
  isRead: false,
  attachmentCount: 2
}, {
  id: 'message-2',
  threadId: 'thread-2',
  accountId: 'account-unknown-1',
  provider: 'google',
  sender: { address: 'sender@example.test' },
  receivedAt: '2026-08-31T04:00:00.000Z',
  subject: '',
  preview: '',
  isRead: true,
  attachmentCount: 0
}]

describe('LiveMailSummaryList', () => {
  it('renders bounded source previews with human account provenance and selects by opaque IDs', () => {
    const onSelect = vi.fn()
    render(<LiveMailSummaryList
      accounts={accounts}
      messages={messages}
      hasMore
      selected={{ accountId: 'account-work-1', messageId: 'message-1' }}
      onSelect={onSelect}
    />)

    const selected = screen.getByRole('button', {
      name: 'Open Confirm the scope from Rahul in Work'
    })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveTextContent('Can we move ahead with this version?')
    expect(selected).toHaveTextContent('Google · Workowner.work@example.test')
    expect(selected).toHaveTextContent('2')
    expect(screen.getByLabelText('Unread')).toBeInTheDocument()
    expect(screen.getByText(/only the 50 newest/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Open message with no subject from sender@example.test in Google account identity unavailable'
    }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('account-unknown-1', 'message-2')
    expect(screen.getByText('No message preview is available.')).toBeInTheDocument()
    expect(screen.queryByText('account-unknown-1')).not.toBeInTheDocument()
  })

  it('does not claim more retained messages when the projection is complete', () => {
    render(<LiveMailSummaryList
      accounts={accounts}
      messages={messages.slice(0, 1)}
      hasMore={false}
      onSelect={vi.fn()}
    />)
    expect(screen.getByText('1 shown')).toBeInTheDocument()
    expect(screen.queryByText(/only the 50 newest/i)).not.toBeInTheDocument()
  })
})
