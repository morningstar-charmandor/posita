import { AlertTriangle, CloudOff, Database, RefreshCw } from 'lucide-react'
import type { LiveMailSnapshotV2 } from '@shared/liveMail'

const statusCopy: Record<LiveMailSnapshotV2['status'], {
  title: string
  detail: string
}> = {
  empty: {
    title: 'No live mail is cached',
    detail: 'Posita stays in live-mail mode and will not restore deterministic samples.'
  },
  ready: {
    title: 'Encrypted live-mail data is available',
    detail: 'The live workspace remains disabled until source-detail and open-original behavior are verified.'
  },
  syncing: {
    title: 'A sync state is recorded',
    detail: 'This status does not claim that provider work is currently running.'
  },
  offline: {
    title: 'The last recorded sync state is offline',
    detail: 'Cached local data is unchanged. Reloading checks local status only.'
  },
  'attention-required': {
    title: 'Live mail needs attention',
    detail: 'Posita did not expose private storage details. Reload to check the local state again.'
  }
}

const accountStatusLabel: Record<LiveMailSnapshotV2['accounts'][number]['status'], string> = {
  'not-synced': 'Not synced',
  syncing: 'Sync state recorded',
  ready: 'Ready',
  offline: 'Offline',
  'attention-required': 'Needs attention',
  disabled: 'Disabled'
}

export interface LiveMailStatusProps {
  snapshot: LiveMailSnapshotV2
  onReload: () => void
}

export function LiveMailStatus({
  snapshot,
  onReload
}: LiveMailStatusProps): React.JSX.Element {
  const copy = statusCopy[snapshot.status]
  const Icon = snapshot.status === 'offline'
    ? CloudOff
    : snapshot.status === 'attention-required'
      ? AlertTriangle
      : Database

  return (
    <main
      className="startup-state live-mail-status"
      role={snapshot.status === 'attention-required' ? 'alert' : undefined}
      aria-labelledby="live-mail-status-title"
    >
      <span className={`startup-icon ${snapshot.status === 'attention-required' ? 'startup-error' : ''}`}>
        <Icon size={21} />
      </span>
      <p className="eyebrow">Live-mail boundary</p>
      <h1 id="live-mail-status-title">{copy.title}</h1>
      <p>{copy.detail}</p>
      <p>
        {snapshot.messages.length === 0
          ? 'No canonical source-message summaries are available.'
          : `${snapshot.messages.length}${snapshot.hasMore ? '+' : ''} canonical source-message summaries are retained locally.`}
      </p>
      {snapshot.accounts.length > 0 && (
        <ul aria-label="Live mail account provenance" className="live-mail-account-list">
          {snapshot.accounts.map((account) => (
            <li key={account.accountId}>
              <span>
                Google · {account.displayIdentity.status === 'available'
                  ? account.displayIdentity.displayLabel ?? account.displayIdentity.mailboxAddress
                  : 'Account identity unavailable'}
                {account.displayIdentity.status === 'available' &&
                  account.displayIdentity.displayLabel !== undefined && (
                    <small>{account.displayIdentity.mailboxAddress}</small>
                  )}
              </span>
              <strong>{accountStatusLabel[account.status]}</strong>
            </li>
          ))}
        </ul>
      )}
      <button className="startup-retry" onClick={onReload}>
        <RefreshCw size={15} /> Reload local status
      </button>
      <small>Gmail connection, provider sync retry, AI generation, and sending are unavailable in this build.</small>
    </main>
  )
}
