import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, LoaderCircle, MailPlus } from 'lucide-react'
import type { GoogleConnectConsentV1 } from '@shared/contracts'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'
import { GoogleAccountDisconnectControl } from './GoogleAccountDisconnectControl'

export interface GmailConnectConsentPanelProps {
  consent: GoogleConnectConsentV1
  dataSource: GoogleAccountConnectionPreflightDataSource
  onConnected(): void
  onBack(): void
}

export function GmailConnectConsentPanel({
  consent,
  dataSource,
  onConnected,
  onBack
}: GmailConnectConsentPanelProps): React.JSX.Element {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'preparing' }
    | { kind: 'prepared'; notices: readonly string[] }
    | { kind: 'connecting' }
    | { kind: 'connected'; accountId: string; mailboxAddress: string; status: string }
    | { kind: 'error'; message: string; retryable: boolean }
  >({ kind: 'idle' })
  const attempt = useRef(0)
  useEffect(() => () => { attempt.current += 1 }, [])

  const prepare = async (): Promise<void> => {
    const currentAttempt = ++attempt.current
    setState({ kind: 'preparing' })
    try {
      const response = await dataSource.prepare()
      if (currentAttempt !== attempt.current) return
      setState(response.ok
        ? { kind: 'prepared', notices: response.value.notices }
        : { kind: 'error', message: response.error.message, retryable: response.error.retryable })
    } catch {
      if (currentAttempt === attempt.current) {
        setState({
          kind: 'error',
          message: 'Posita could not contact the local connection preparation service.',
          retryable: true
        })
      }
    }
  }

  const connect = async (): Promise<void> => {
    const currentAttempt = ++attempt.current
    setState({ kind: 'connecting' })
    try {
      const response = await dataSource.connect()
      if (currentAttempt !== attempt.current) return
      if (response.ok) {
        setState({
          kind: 'connected',
          accountId: response.value.accountId,
          mailboxAddress: response.value.mailboxAddress,
          status: response.value.status
        })
        if (response.value.status !== 'connected-needs-review') onConnected()
      } else {
        setState({ kind: 'error', message: response.error.message, retryable: response.error.retryable })
      }
    } catch {
      if (currentAttempt === attempt.current) {
        setState({
          kind: 'error',
          message: 'Posita could not confirm whether Google account connection finished.',
          retryable: false
        })
      }
    }
  }

  const cancel = async (): Promise<void> => {
    await dataSource.cancel().catch(() => undefined)
  }

  return (
    <div className="settings-content connect-consent">
      <button className="settings-back-button" onClick={onBack}>
        <ArrowLeft size={15} /> Settings & privacy
      </button>
      {state.kind !== 'connected' && (
        <div className="consent-status" role="status">
          <span>Connection not started</span>
          <strong>Gmail is not connected</strong>
          <small>No browser session, credential, or live account exists.</small>
        </div>
      )}
      <div className="consent-heading">
        <span className="settings-icon"><MailPlus size={18} /></span>
        <span>
          <h2>Before Posita connects Gmail</h2>
          <p>Review exactly what the first private-alpha connection will allow.</p>
        </span>
      </div>
      <div className="consent-scope">
        <span>Permissions requested</span>
        <ul aria-label="Google permissions requested">
          {consent.requestedScopes.map((scope) => <li key={scope}><code>{scope}</code></li>)}
        </ul>
      </div>
      <ul className="consent-disclosures">
        {consent.disclosures.map((disclosure) => (
          <li key={disclosure.id}>
            <Check size={15} aria-hidden="true" />
            <span>
              <strong>{disclosure.title}</strong>
              <small>{disclosure.description}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="consent-version">
        Reviewed consent contract <code>{consent.consentVersion}</code>
      </div>
      {state.kind === 'prepared' ? (
        <div className="consent-status" role="status">
          <span>Preparation complete</span>
          <strong>Ready to continue to Google</strong>
          <ul aria-label="Connection preparation result">
            {state.notices.map((notice) => <li key={notice}>{notice}</li>)}
          </ul>
          <button className="primary-button" onClick={() => void connect()}>
            Continue to Google
          </button>
        </div>
      ) : state.kind === 'connecting' ? (
        <div className="consent-status" role="status" aria-live="polite">
          <span><LoaderCircle size={15} className="spin-icon" /></span>
          <strong>Waiting for Google authorization…</strong>
          <small>Complete or decline the read-only request in your browser.</small>
          <button className="secondary-button" onClick={() => void cancel()}>
            Cancel connection
          </button>
        </div>
      ) : state.kind === 'connected' ? (
        <div className="consent-status" role="status">
          <span>Connected</span>
          <strong>{state.mailboxAddress}</strong>
          <small>{state.status === 'connected-and-synced'
            ? 'The encrypted 90-day read-only sync completed.'
            : 'The account is connected, but local sync needs attention.'}</small>
          {state.status === 'connected-needs-review' && (
            <GoogleAccountDisconnectControl
              accountId={state.accountId}
              accountLabel={state.mailboxAddress}
              dataSource={dataSource}
              onDisconnected={onConnected}
            />
          )}
        </div>
      ) : state.kind === 'error' ? (
        <div className="consent-status" role="alert">
          <span>Preparation unavailable</span>
          <strong>{state.message}</strong>
          {state.retryable && (
            <button className="secondary-button" onClick={() => void prepare()}>Try again</button>
          )}
        </div>
      ) : (
        <button
          className="primary-button settings-full-button"
          disabled={state.kind === 'preparing'}
          onClick={() => void prepare()}
        >
          {state.kind === 'preparing'
            ? <><LoaderCircle size={15} className="spin-icon" /> Checking local readiness…</>
            : 'Prepare Gmail connection'}
        </button>
      )}
      {state.kind !== 'connected' && (
        <section className="consent-disconnect" aria-labelledby="connected-gmail-title">
          <h3 id="connected-gmail-title">Connected Gmail accounts</h3>
          <p>No Gmail accounts are connected. Disconnect becomes available only for a verified connection.</p>
          <button className="secondary-button settings-full-button" disabled>Disconnect unavailable</button>
        </section>
      )}
      <small className="consent-footnote">Google authorization is explicit and remains Gmail read-only.</small>
    </div>
  )
}
