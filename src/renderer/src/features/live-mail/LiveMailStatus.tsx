import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CloudOff, Database, RefreshCw } from 'lucide-react'
import type { LiveMailSnapshotV2 } from '@shared/liveMail'
import { POSITA_PROTOCOL_VERSION } from '@shared/contracts'
import type { LiveMailMessageDetailV1 } from '@shared/liveMailDetail'
import type { LiveMailMessageDetailDataSource } from '../../application/liveMailMessageDetailDataSource'
import type { OpenLiveMailOriginalDataSource } from '../../application/openLiveMailOriginalDataSource'
import { OpenOriginalConfirmation } from './OpenOriginalConfirmation'

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
    detail: 'Bounded encrypted source inspection is available. The full live workspace stays disabled while opening Gmail is reviewed.'
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
  detailDataSource: LiveMailMessageDetailDataSource
  openOriginalDataSource: OpenLiveMailOriginalDataSource
}

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; accountId: string; messageId: string }
  | { status: 'found'; detail: LiveMailMessageDetailV1 }
  | { status: 'missing'; accountId: string; messageId: string }
  | { status: 'error'; accountId: string; messageId: string; message: string; retryable: boolean }

export function LiveMailStatus({
  snapshot,
  onReload,
  detailDataSource,
  openOriginalDataSource
}: LiveMailStatusProps): React.JSX.Element {
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' })
  const sequence = useRef(0)
  useEffect(() => () => { sequence.current += 1 }, [])
  const copy = statusCopy[snapshot.status]
  const Icon = snapshot.status === 'offline'
    ? CloudOff
    : snapshot.status === 'attention-required'
      ? AlertTriangle
      : Database

  const loadDetail = (accountId: string, messageId: string): void => {
    const requestSequence = ++sequence.current
    setDetail({ status: 'loading', accountId, messageId })
    void detailDataSource.loadMessageDetail({
      version: POSITA_PROTOCOL_VERSION,
      accountId,
      messageId
    }).then((response) => {
      if (requestSequence !== sequence.current) return
      if (!response.ok) {
        setDetail({
          status: 'error', accountId, messageId,
          message: response.error.message,
          retryable: response.error.retryable
        })
      } else if (response.value.status === 'missing') {
        setDetail({ status: 'missing', accountId, messageId })
      } else {
        setDetail({ status: 'found', detail: response.value.detail })
      }
    }).catch(() => {
      if (requestSequence === sequence.current) {
        setDetail({
          status: 'error', accountId, messageId,
          message: 'Posita could not contact the local desktop backend.',
          retryable: true
        })
      }
    })
  }

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
      {snapshot.messages.length > 0 && (
        <section className="live-mail-source-inspection" aria-labelledby="source-inspection-title">
          <h2 id="source-inspection-title">Retained source inspection</h2>
          <p>Message summaries stay hidden while the external Gmail path remains under review.</p>
          <div className="live-mail-source-actions">
            {snapshot.messages.map((message, index) => (
              <button
                key={`${message.accountId}:${message.id}`}
                onClick={() => loadDetail(message.accountId, message.id)}
              >
                Inspect encrypted source {index + 1}
              </button>
            ))}
          </div>
          {detail.status === 'loading' && (
            <p role="status" aria-live="polite">Loading encrypted source…</p>
          )}
          {detail.status === 'missing' && (
            <div role="status" className="live-mail-source-result">
              <h3>Source is no longer retained</h3>
              <p>It may have expired from Posita’s encrypted 90-day cache.</p>
              <button onClick={() => loadDetail(detail.accountId, detail.messageId)}>Check again</button>
            </div>
          )}
          {detail.status === 'error' && (
            <div role="alert" className="live-mail-source-result">
              <h3>Source could not be opened</h3>
              <p>{detail.message}</p>
              {detail.retryable && (
                <button onClick={() => loadDetail(detail.accountId, detail.messageId)}>Try source again</button>
              )}
            </div>
          )}
          {detail.status === 'found' && (
            <article className="live-mail-source-result" aria-labelledby="source-detail-subject">
              <p className="eyebrow">Encrypted local source · Google</p>
              <h3 id="source-detail-subject">{detail.detail.subject || 'No subject'}</h3>
              <p>From {detail.detail.sender.displayName === undefined
                ? detail.detail.sender.address
                : `${detail.detail.sender.displayName} · ${detail.detail.sender.address}`}</p>
              <p>Account {detail.detail.accountIdentity.status === 'available'
                ? detail.detail.accountIdentity.displayLabel === undefined
                  ? detail.detail.accountIdentity.mailboxAddress
                  : `${detail.detail.accountIdentity.displayLabel} · ${detail.detail.accountIdentity.mailboxAddress}`
                : 'identity unavailable'}</p>
              {detail.detail.recipients.length > 0 && (
                <p>Recipients {detail.detail.recipients.map((recipient) =>
                  `${recipient.role.toUpperCase()} ${recipient.mailbox.address}`).join(' · ')}</p>
              )}
              <pre>{detail.detail.body.plainText || 'This source has no plain-text body.'}</pre>
              {detail.detail.attachments.length > 0 && (
                <ul aria-label="Safe attachment metadata">
                  {detail.detail.attachments.map((attachment, index) => (
                    <li key={`${attachment.filename}:${index}`}>
                      {attachment.filename} · {attachment.mediaType} · {attachment.sizeBytes} bytes
                    </li>
                  ))}
                </ul>
              )}
              {detail.detail.body.truncated && <small>Long source text was safely shortened.</small>}
              <OpenOriginalConfirmation
                accountId={detail.detail.accountId}
                messageId={detail.detail.messageId}
                accountLabel={detail.detail.accountIdentity.status === 'available'
                  ? detail.detail.accountIdentity.displayLabel ?? detail.detail.accountIdentity.mailboxAddress
                  : 'the originating account'}
                dataSource={openOriginalDataSource}
              />
            </article>
          )}
        </section>
      )}
      <button className="startup-retry" onClick={onReload}>
        <RefreshCw size={15} /> Reload local status
      </button>
      <small>Gmail connection, provider sync retry, AI generation, and sending are unavailable in this build.</small>
    </main>
  )
}
