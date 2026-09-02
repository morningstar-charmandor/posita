import { Paperclip } from 'lucide-react'
import type {
  LiveMailAccountV2,
  LiveMailMessageSummaryV2
} from '@shared/liveMail'

export interface LiveMailSummaryListProps {
  accounts: LiveMailAccountV2[]
  messages: LiveMailMessageSummaryV2[]
  hasMore: boolean
  selected?: { accountId: string; messageId: string }
  onSelect: (accountId: string, messageId: string) => void
}

const accountLabel = (account: LiveMailAccountV2 | undefined): {
  primary: string
  secondary?: string
} => {
  if (account?.displayIdentity.status !== 'available') {
    return { primary: 'Google account identity unavailable' }
  }
  return account.displayIdentity.displayLabel === undefined
    ? { primary: account.displayIdentity.mailboxAddress }
    : {
        primary: account.displayIdentity.displayLabel,
        secondary: account.displayIdentity.mailboxAddress
      }
}

const senderLabel = (message: LiveMailMessageSummaryV2): string =>
  message.sender.displayName ?? message.sender.address

const formatTimestamp = (value: string): string => new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value))

export function LiveMailSummaryList({
  accounts,
  messages,
  hasMore,
  selected,
  onSelect
}: LiveMailSummaryListProps): React.JSX.Element {
  const accountById = new Map(accounts.map((account) => [account.accountId, account]))

  return (
    <section className="live-mail-summary-list" aria-labelledby="live-mail-summary-title">
      <header>
        <div>
          <p className="eyebrow">Encrypted local cache</p>
          <h2 id="live-mail-summary-title">Recent retained mail</h2>
        </div>
        <span>{messages.length}{hasMore ? '+' : ''} shown</span>
      </header>
      <p className="live-mail-summary-intro">
        Select a message to inspect its bounded local source. This list does not contact Gmail.
      </p>
      <ol>
        {messages.map((message) => {
          const account = accountLabel(accountById.get(message.accountId))
          const sender = senderLabel(message)
          const isSelected = selected?.accountId === message.accountId &&
            selected.messageId === message.id
          const attachmentLabel = message.attachmentCount === 1
            ? '1 attachment'
            : `${message.attachmentCount} attachments`
          return (
            <li key={`${message.accountId}:${message.id}`}>
              <button
                className={`${message.isRead ? '' : 'unread'}${isSelected ? ' selected' : ''}`}
                aria-pressed={isSelected}
                aria-label={`Open ${message.subject || 'message with no subject'} from ${sender} in ${account.primary}`}
                onClick={() => onSelect(message.accountId, message.id)}
              >
                <span className="live-mail-summary-topline">
                  <strong>{sender}</strong>
                  <time dateTime={message.receivedAt}>{formatTimestamp(message.receivedAt)}</time>
                </span>
                <span className="live-mail-summary-subject">
                  {!message.isRead && <i aria-label="Unread" />}
                  {message.subject || 'No subject'}
                </span>
                <span className="live-mail-summary-preview">
                  {message.preview || 'No message preview is available.'}
                </span>
                <span className="live-mail-summary-meta">
                  <span>
                    Google · {account.primary}
                    {account.secondary !== undefined && <small>{account.secondary}</small>}
                  </span>
                  {message.attachmentCount > 0 && (
                    <span aria-label={attachmentLabel}>
                      <Paperclip aria-hidden="true" size={12} /> {message.attachmentCount}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {hasMore && (
        <small>Only the 50 newest retained messages are shown in this bounded view.</small>
      )}
    </section>
  )
}
