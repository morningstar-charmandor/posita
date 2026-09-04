import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Database, KeyRound, LoaderCircle, MailPlus,
  ShieldCheck, Trash2, X
} from 'lucide-react'
import {
  DELETE_LOCAL_DATA_CONFIRMATION_TEXT,
  POSITA_PROTOCOL_VERSION,
  type ExecuteLocalDataDeletionRequestV1,
  type GoogleConnectConsentV1,
  type LocalDataDeletionChallengeV1,
  type RetentionMaintenanceStatusV1
} from '@shared/contracts'
import type { Account } from '@shared/domain'
import type {
  AccountConnectionRecoveryDataSource
} from '../../application/accountConnectionRecoveryDataSource'
import type { LocalDataDeletionDataSource } from '../../application/localDataDeletionDataSource'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'
import { AccountConnectionRecoveryPanel } from './AccountConnectionRecoveryPanel'
import { GmailConnectConsentPanel } from './GmailConnectConsentPanel'
import { RetentionMaintenanceStatusPanel } from './RetentionMaintenanceStatusPanel'

type DialogState =
  | { kind: 'overview' }
  | { kind: 'connect-consent' }
  | { kind: 'connection-recovery' }
  | { kind: 'preparing' }
  | { kind: 'challenge'; challenge: LocalDataDeletionChallengeV1; enteredText: string }
  | { kind: 'deleting'; request: ExecuteLocalDataDeletionRequestV1 }
  | {
      kind: 'error'
      stage: 'prepare' | 'execute'
      message: string
      retryable: boolean
      request?: ExecuteLocalDataDeletionRequestV1
    }

export interface LocalDataSettingsDialogProps {
  connectConsent: GoogleConnectConsentV1
  retention: RetentionMaintenanceStatusV1
  accounts: Account[]
  dataSource: LocalDataDeletionDataSource
  recoveryDataSource: AccountConnectionRecoveryDataSource
  googleConnectionPreflightDataSource: GoogleAccountConnectionPreflightDataSource
  onConnectionChanged(): void
  onClose(): void
  onDeleted(): void
}

export function LocalDataSettingsDialog({
  connectConsent,
  retention,
  accounts,
  dataSource,
  recoveryDataSource,
  googleConnectionPreflightDataSource,
  onConnectionChanged,
  onClose,
  onDeleted
}: LocalDataSettingsDialogProps): React.JSX.Element {
  const [state, setState] = useState<DialogState>({ kind: 'overview' })
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const prepare = async (): Promise<void> => {
    setState({ kind: 'preparing' })
    try {
      const response = await dataSource.prepare()
      if (!mounted.current) return
      setState(response.ok
        ? { kind: 'challenge', challenge: response.value, enteredText: '' }
        : {
            kind: 'error',
            stage: 'prepare',
            message: response.error.message,
            retryable: response.error.retryable
          })
    } catch {
      if (mounted.current) {
        setState({
          kind: 'error',
          stage: 'prepare',
          message: 'Posita could not contact the local deletion service.',
          retryable: true
        })
      }
    }
  }

  const execute = async (request: ExecuteLocalDataDeletionRequestV1): Promise<void> => {
    setState({ kind: 'deleting', request })
    try {
      const response = await dataSource.execute(request)
      if (!mounted.current) return
      if (response.ok) onDeleted()
      else {
        setState({
          kind: 'error',
          stage: 'execute',
          message: response.error.message,
          retryable: response.error.retryable,
          request
        })
      }
    } catch {
      if (mounted.current) {
        setState({
          kind: 'error',
          stage: 'execute',
          message: 'Posita could not confirm whether local deletion finished.',
          retryable: true,
          request
        })
      }
    }
  }

  const updateRecoveryBusy = useCallback((busy: boolean) => setRecoveryBusy(busy), [])
  const canClose = state.kind !== 'deleting' && !recoveryBusy
  const title = state.kind === 'overview'
    ? 'Settings & privacy'
    : state.kind === 'connect-consent'
      ? 'Connect Gmail'
      : state.kind === 'connection-recovery' ? 'Recover local connection' : 'Delete local data'

  return (
    <div
      className="modal-backdrop settings-backdrop"
      role="presentation"
      onMouseDown={(event) => canClose && event.currentTarget === event.target && onClose()}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-data-settings-title"
        aria-busy={state.kind === 'preparing' || state.kind === 'deleting'}
      >
        <header>
          <div>
            <span className="settings-icon"><ShieldCheck size={18} /></span>
            <span>
              <strong id="local-data-settings-title">{title}</strong>
              <small>{state.kind === 'connect-consent'
                ? 'Read-only connection consent preview'
                : 'Account and on-device privacy controls'}</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="Close privacy settings" disabled={!canClose}>
            <X size={19} />
          </button>
        </header>

        {state.kind === 'overview' && (
          <div className="settings-content">
            <section className="settings-section" aria-labelledby="account-connections-title">
              <h2 id="account-connections-title">Account connections</h2>
              <div className="settings-summary">
                <MailPlus size={19} />
                <span>
                  <strong>Google account</strong>
                  <small>Not connected · review the planned read-only access</small>
                </span>
              </div>
              <button
                className="secondary-button settings-full-button"
                onClick={() => setState({ kind: 'connect-consent' })}
              >
                Review Gmail connection…
              </button>
              <div className="settings-summary">
                <KeyRound size={19} />
                <span>
                  <strong>Local connection recovery</strong>
                  <small>Check for incomplete local connection records without contacting Google</small>
                </span>
              </div>
              <button
                className="secondary-button settings-full-button"
                onClick={() => setState({ kind: 'connection-recovery' })}
              >
                Review local connection recovery…
              </button>
            </section>
            <section className="settings-section" aria-labelledby="local-data-title">
              <h2 id="local-data-title">Local data</h2>
              <RetentionMaintenanceStatusPanel retention={retention} />
            <div className="settings-summary">
              <Database size={19} />
              <span>
                <strong>Local encrypted data</strong>
                <small>This build currently contains deterministic sample mail only.</small>
              </span>
            </div>
            <p>Delete Posita’s local cache, derived data, stored credentials, and encryption key.</p>
            <p>This does not delete or change messages in Gmail.</p>
            <button className="danger-button" onClick={() => void prepare()}>
              <Trash2 size={15} /> Delete local data…
            </button>
            </section>
          </div>
        )}

        {state.kind === 'connect-consent' && (
          <GmailConnectConsentPanel
            consent={connectConsent}
            dataSource={googleConnectionPreflightDataSource}
            onConnected={onConnectionChanged}
            onBack={() => setState({ kind: 'overview' })}
          />
        )}

        {state.kind === 'connection-recovery' && (
          <AccountConnectionRecoveryPanel
            accounts={accounts}
            dataSource={recoveryDataSource}
            onBack={() => setState({ kind: 'overview' })}
            onBusyChange={updateRecoveryBusy}
          />
        )}

        {state.kind === 'preparing' && (
          <div className="settings-state" role="status">
            <LoaderCircle size={21} className="spin-icon" />
            <strong>Preparing a secure confirmation…</strong>
            <small>No data has been deleted.</small>
          </div>
        )}

        {state.kind === 'challenge' && (
          <div className="settings-content deletion-confirmation">
            <div className="destructive-warning">
              <AlertTriangle size={19} />
              <span><strong>This cannot be undone in Posita.</strong><small>The provider mailbox is not changed.</small></span>
            </div>
            <ul>
              {state.challenge.consequences.map((consequence) => (
                <li key={consequence}>{consequence}</li>
              ))}
            </ul>
            <label htmlFor="delete-local-data-confirmation">
              Type <code>{state.challenge.requiredText}</code> to continue
            </label>
            <input
              id="delete-local-data-confirmation"
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
              <button className="secondary-button" onClick={onClose}>Cancel</button>
              <button
                className="danger-button"
                disabled={state.enteredText !== DELETE_LOCAL_DATA_CONFIRMATION_TEXT}
                onClick={() => void execute({
                  version: POSITA_PROTOCOL_VERSION,
                  confirmationId: state.challenge.confirmationId,
                  operationId: state.challenge.operationId,
                  action: state.challenge.action,
                  enteredText: state.enteredText
                })}
              >
                <Trash2 size={15} /> Delete local data
              </button>
            </footer>
          </div>
        )}

        {state.kind === 'deleting' && (
          <div className="settings-state" role="status">
            <LoaderCircle size={21} className="spin-icon" />
            <strong>Deleting local data safely…</strong>
            <small>Keep Posita open. If interrupted, deletion resumes on restart.</small>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="settings-state" role="alert">
            <AlertTriangle size={21} />
            <strong>Local-data deletion needs attention</strong>
            <p>{state.message}</p>
            <div className="settings-actions">
              <button className="secondary-button" onClick={onClose}>Close</button>
              {state.retryable && (
                <button
                  className="danger-button"
                  onClick={() => state.stage === 'execute' && state.request
                    ? void execute(state.request)
                    : void prepare()}
                >
                  Try again
                </button>
              )}
              {!state.retryable && state.stage === 'execute' && (
                <button className="secondary-button" onClick={() => void prepare()}>
                  Start again
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
