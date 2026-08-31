import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, ShieldAlert
} from 'lucide-react'
import {
  ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT,
  POSITA_PROTOCOL_VERSION,
  type AccountConnectionRecoveryChallengeV1,
  type ExecuteAccountConnectionRecoveryRequestV1
} from '@shared/contracts'
import type { Account } from '@shared/domain'
import type {
  AccountConnectionRecoveryDataSource
} from '../../application/accountConnectionRecoveryDataSource'

type RecoveryState =
  | { kind: 'overview' }
  | { kind: 'checking'; account: Account }
  | { kind: 'not-needed'; account: Account; message: string }
  | { kind: 'challenge'; account: Account; challenge: AccountConnectionRecoveryChallengeV1; enteredText: string }
  | { kind: 'recovering'; account: Account; request: ExecuteAccountConnectionRecoveryRequestV1 }
  | { kind: 'recovered'; account: Account; removed: 'credential' | 'provider-state' }
  | { kind: 'error'; account: Account; stage: 'prepare' | 'execute'; message: string; retryable: boolean }

export interface AccountConnectionRecoveryPanelProps {
  accounts: Account[]
  dataSource: AccountConnectionRecoveryDataSource
  onBack(): void
  onBusyChange(busy: boolean): void
}

export function AccountConnectionRecoveryPanel({
  accounts,
  dataSource,
  onBack,
  onBusyChange
}: AccountConnectionRecoveryPanelProps): React.JSX.Element {
  const [state, setState] = useState<RecoveryState>({ kind: 'overview' })
  const mounted = useRef(true)
  const busy = state.kind === 'checking' || state.kind === 'recovering'

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])

  const prepare = async (account: Account): Promise<void> => {
    setState({ kind: 'checking', account })
    try {
      const response = await dataSource.prepare({
        version: POSITA_PROTOCOL_VERSION,
        action: 'discard-orphaned-local-connection-state',
        accountId: account.id
      })
      if (!mounted.current) return
      if (response.ok) {
        setState({ kind: 'challenge', account, challenge: response.value, enteredText: '' })
      } else if (response.error.code === 'RECOVERY_NOT_NEEDED') {
        setState({ kind: 'not-needed', account, message: response.error.message })
      } else {
        setState({
          kind: 'error',
          account,
          stage: 'prepare',
          message: response.error.message,
          retryable: response.error.retryable
        })
      }
    } catch {
      if (mounted.current) {
        setState({
          kind: 'error',
          account,
          stage: 'prepare',
          message: 'Posita could not contact the local connection recovery service.',
          retryable: true
        })
      }
    }
  }

  const execute = async (
    account: Account,
    request: ExecuteAccountConnectionRecoveryRequestV1
  ): Promise<void> => {
    setState({ kind: 'recovering', account, request })
    try {
      const response = await dataSource.execute(request)
      if (!mounted.current) return
      if (response.ok) {
        setState({ kind: 'recovered', account, removed: response.value.removed })
      } else {
        setState({
          kind: 'error',
          account,
          stage: 'execute',
          message: response.error.message,
          retryable: response.error.retryable
        })
      }
    } catch {
      if (mounted.current) {
        setState({
          kind: 'error',
          account,
          stage: 'execute',
          message: 'Posita could not confirm whether local connection recovery finished.',
          retryable: true
        })
      }
    }
  }

  if (state.kind === 'overview') {
    return (
      <div className="settings-content connection-recovery">
        <button className="settings-back-button" onClick={onBack}>
          <ArrowLeft size={15} /> Settings & privacy
        </button>
        <div className="consent-status" role="status">
          <span>Local only</span>
          <strong>Gmail is not contacted</strong>
          <small>This checks only Posita records stored on this Mac.</small>
        </div>
        <div className="consent-heading">
          <span className="settings-icon"><KeyRound size={18} /></span>
          <span>
            <h2>Recover an incomplete connection</h2>
            <p>
              Use this only when an interrupted connection left a credential or encrypted
              account record without its matching half.
            </p>
          </span>
        </div>
        <p>
          This sample build has no live Gmail account. Checking an account does not connect
          Gmail, open a browser, or change any provider mailbox.
        </p>
        <ul className="recovery-account-list" aria-label="Sample accounts to check">
          {accounts.map((account) => (
            <li key={account.id}>
              <span>
                <strong>{account.label}</strong>
                <small>{account.address} · sample account</small>
              </span>
              <button
                className="secondary-button"
                aria-label={`Check ${account.label} local connection state`}
                onClick={() => void prepare(account)}
              >
                Check local state
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (state.kind === 'checking') {
    return (
      <div className="settings-state" role="status">
        <LoaderCircle size={21} className="spin-icon" />
        <strong>Checking {state.account.label} local state…</strong>
        <small>No data is being changed.</small>
      </div>
    )
  }

  if (state.kind === 'not-needed') {
    return (
      <div className="settings-state" role="status">
        <CheckCircle2 size={21} className="recovery-safe-icon" />
        <strong>No recovery is needed for {state.account.label}</strong>
        <p>{state.message}</p>
        <p>Gmail remains unconnected in this sample build.</p>
        <button className="secondary-button" onClick={() => setState({ kind: 'overview' })}>
          Check another account
        </button>
      </div>
    )
  }

  if (state.kind === 'challenge') {
    const orphanDescription = state.challenge.expectedStatus === 'credential-only'
      ? 'A protected local credential has no matching encrypted account record.'
      : 'An encrypted local account record has no matching protected credential.'
    return (
      <div className="settings-content deletion-confirmation connection-recovery-confirmation">
        <div className="destructive-warning">
          <ShieldAlert size={19} />
          <span>
            <strong>Incomplete local connection data was found.</strong>
            <small>{orphanDescription}</small>
          </span>
        </div>
        <p>
          Posita can discard only that orphaned local record. It will not contact Google,
          reconstruct the connection, or change Gmail.
        </p>
        <ul>
          {state.challenge.consequences.map((consequence) => (
            <li key={consequence}>{consequence}</li>
          ))}
        </ul>
        <label htmlFor="account-connection-recovery-confirmation">
          Type <code>{state.challenge.requiredText}</code> to continue
        </label>
        <input
          id="account-connection-recovery-confirmation"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={state.enteredText}
          onChange={(event) => setState({ ...state, enteredText: event.target.value })}
        />
        <small>
          Confirmation expires at <time dateTime={state.challenge.expiresAt}>
            {new Date(state.challenge.expiresAt).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit'
            })}
          </time>.
        </small>
        <footer>
          <button className="secondary-button" onClick={() => setState({ kind: 'overview' })}>
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={state.enteredText !== ACCOUNT_CONNECTION_RECOVERY_CONFIRMATION_TEXT}
            onClick={() => void execute(state.account, {
              version: POSITA_PROTOCOL_VERSION,
              confirmationId: state.challenge.confirmationId,
              operationId: state.challenge.operationId,
              action: state.challenge.action,
              accountId: state.challenge.accountId,
              expectedStatus: state.challenge.expectedStatus,
              enteredText: state.enteredText
            })}
          >
            Discard incomplete local connection
          </button>
        </footer>
      </div>
    )
  }

  if (state.kind === 'recovering') {
    return (
      <div className="settings-state" role="status">
        <LoaderCircle size={21} className="spin-icon" />
        <strong>Removing incomplete local connection data…</strong>
        <small>Gmail is not contacted or changed.</small>
      </div>
    )
  }

  if (state.kind === 'recovered') {
    return (
      <div className="settings-state" role="status">
        <CheckCircle2 size={21} className="recovery-safe-icon" />
        <strong>Local connection data was recovered</strong>
        <p>
          Posita removed the orphaned {state.removed === 'credential'
            ? 'credential'
            : 'encrypted account record'} for {state.account.label}.
        </p>
        <p>A fresh Gmail connection will be required later. Gmail was not changed.</p>
        <button className="secondary-button" onClick={onBack}>Return to settings</button>
      </div>
    )
  }

  return (
    <div className="settings-state" role="alert">
      <AlertTriangle size={21} />
      <strong>Local connection recovery needs attention</strong>
      <p>{state.message}</p>
      <div className="settings-actions">
        <button className="secondary-button" onClick={() => setState({ kind: 'overview' })}>
          Check another account
        </button>
        {state.retryable && (
          <button className="danger-button" onClick={() => void prepare(state.account)}>
            Review again
          </button>
        )}
      </div>
    </div>
  )
}
