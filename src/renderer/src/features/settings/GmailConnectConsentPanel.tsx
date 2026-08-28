import { ArrowLeft, Check, MailPlus } from 'lucide-react'
import type { GoogleConnectConsentV1 } from '@shared/contracts'

export interface GmailConnectConsentPanelProps {
  consent: GoogleConnectConsentV1
  onBack(): void
}

export function GmailConnectConsentPanel({
  consent,
  onBack
}: GmailConnectConsentPanelProps): React.JSX.Element {
  return (
    <div className="settings-content connect-consent">
      <button className="settings-back-button" onClick={onBack}>
        <ArrowLeft size={15} /> Settings & privacy
      </button>
      <div className="consent-status" role="status">
        <span>Preview only</span>
        <strong>Gmail is not connected</strong>
        <small>No OAuth client, credential, or live account is configured.</small>
      </div>
      <div className="consent-heading">
        <span className="settings-icon"><MailPlus size={18} /></span>
        <span>
          <h2>Before Posita connects Gmail</h2>
          <p>Review exactly what the first private-alpha connection will allow.</p>
        </span>
      </div>
      <div className="consent-scope">
        <span>Permission requested</span>
        <code>{consent.requestedScope}</code>
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
      <button className="primary-button settings-full-button" disabled>
        Connect Gmail unavailable in this build
      </button>
      <small className="consent-footnote">
        Activating Google authorization requires a separate reviewed milestone and your decision.
      </small>
    </div>
  )
}
