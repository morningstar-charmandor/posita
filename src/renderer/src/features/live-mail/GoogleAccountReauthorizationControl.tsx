import { useEffect, useRef, useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { GOOGLE_CONNECT_CONSENT, POSITA_PROTOCOL_VERSION } from '@shared/contracts'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'

type State =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'running' }
  | { kind: 'error'; message: string; retryable: boolean }

export interface GoogleAccountReauthorizationControlProps {
  accountId: string
  accountLabel: string
  dataSource: Pick<GoogleAccountConnectionPreflightDataSource,
    'reauthorize' | 'cancelReauthorization'>
  onStatusChanged(): void
}

export function GoogleAccountReauthorizationControl({
  accountId,
  accountLabel,
  dataSource,
  onStatusChanged
}: GoogleAccountReauthorizationControlProps): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const mounted = useRef(true)
  const attempt = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const reauthorize = (): void => {
    if (state.kind === 'running') return
    const currentAttempt = ++attempt.current
    setState({ kind: 'running' })
    void dataSource.reauthorize({
      version: POSITA_PROTOCOL_VERSION,
      action: 'reauthorize-google-account',
      accountId,
      consentVersion: GOOGLE_CONNECT_CONSENT.consentVersion
    }).then((response) => {
      if (!mounted.current || currentAttempt !== attempt.current) return
      if (response.ok) {
        onStatusChanged()
      } else {
        setState({ kind: 'error', message: response.error.message, retryable: response.error.retryable })
        onStatusChanged()
      }
    }).catch(() => {
      if (!mounted.current || currentAttempt !== attempt.current) return
      setState({
        kind: 'error',
        message: 'Posita could not contact the local reauthorization service.',
        retryable: true
      })
      onStatusChanged()
    })
  }

  const cancel = (): void => {
    attempt.current += 1
    void dataSource.cancelReauthorization().finally(() => {
      if (mounted.current) setState({ kind: 'idle' })
    })
  }

  return (
    <div className="google-account-sync-retry">
      {state.kind === 'confirm' ? (
        <div role="group" aria-label={`Confirm Google reauthorization for ${accountLabel}`}>
          <p>
            Continue to Google to renew read-only access for {accountLabel}. Posita will accept
            only the same verified account, keep its encrypted cache, then resume Gmail sync once.
            Gmail will not be modified.
          </p>
          <button autoFocus onClick={() => setState({ kind: 'idle' })}>Cancel</button>
          <button onClick={reauthorize}>Continue to Google</button>
        </div>
      ) : (
        <button
          onClick={() => setState({ kind: 'confirm' })}
          disabled={state.kind === 'running'}
        >
          {state.kind === 'running'
            ? <LoaderCircle size={14} className="spin-icon" />
            : <KeyRound size={14} />}
          {state.kind === 'running' ? 'Waiting for Google…' : 'Reconnect Google'}
        </button>
      )}
      {state.kind === 'running' && (
        <div role="status" aria-live="polite">
          <small>Complete or decline the same-account read-only request in your browser.</small>
          <button onClick={cancel}>Cancel reauthorization</button>
        </div>
      )}
      {state.kind === 'error' && (
        <div role="alert">
          <small>{state.message}</small>
          {state.retryable && <button onClick={() => setState({ kind: 'confirm' })}>Try again</button>}
        </div>
      )}
    </div>
  )
}
