import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, LoaderCircle, MailPlus } from 'lucide-react'
import type { GoogleConnectConsentV1 } from '@shared/contracts'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'

export interface GmailConnectConsentPanelProps {
  consent: GoogleConnectConsentV1
  dataSource: GoogleAccountConnectionPreflightDataSource
  onBack(): void
}

export function GmailConnectConsentPanel({
  consent,
  dataSource,
  onBack
}: GmailConnectConsentPanelProps): React.JSX.Element {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'preparing' }
    | { kind: 'prepared'; notices: readonly string[] }
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

  return (
    <div className="settings-content connect-consent">
      <button className="settings-back-button" onClick={onBack}>
        <ArrowLeft size={15} /> Settings & privacy
      </button>
      <div className="consent-status" role="status">
        <span>Local preparation only</span>
        <strong>Gmail is not connected</strong>
        <small>No browser session, credential, or live account exists.</small>
      </div>
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
          <strong>Ready for a later Google authorization step</strong>
          <ul aria-label="Connection preparation result">
            {state.notices.map((notice) => <li key={notice}>{notice}</li>)}
          </ul>
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
      <section className="consent-disconnect" aria-labelledby="connected-gmail-title">
        <h3 id="connected-gmail-title">Connected Gmail accounts</h3>
        <p>No Gmail accounts are connected. Disconnect becomes available only for a verified connection.</p>
        <button className="secondary-button settings-full-button" disabled>Disconnect unavailable</button>
      </section>
      <small className="consent-footnote">Continuing to Google remains a separate explicit decision.</small>
    </div>
  )
}
