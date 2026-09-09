import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { POSITA_PROTOCOL_VERSION } from '@shared/contracts'
import type { LiveMailSyncRetryAvailabilityV1 } from '@shared/liveMail'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'

type State =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'running' }
  | { kind: 'error'; message: string; retryable: boolean }

export interface GoogleAccountSyncRetryControlProps {
  accountId: string
  dataSource: Pick<GoogleAccountConnectionPreflightDataSource, 'retrySync'>
  onStatusChanged: () => void
  availability?: LiveMailSyncRetryAvailabilityV1
}

export function GoogleAccountSyncRetryControl({
  accountId,
  dataSource,
  onStatusChanged,
  availability = 'available'
}: GoogleAccountSyncRetryControlProps): React.JSX.Element {
  const quota = availability === 'quota-setup' || availability === 'quota-ready'
  const [state, setState] = useState<State>({ kind: 'idle' })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const retry = (): void => {
    if (state.kind === 'running') return
    setState({ kind: 'running' })
    void dataSource.retrySync({
      version: POSITA_PROTOCOL_VERSION,
      action: 'retry-google-account-sync',
      accountId,
      ...(quota ? { quotaIntent: { version: 1 as const,
        action: availability === 'quota-setup' ? 'start-cooldown' as const : 'resume' as const } } : {})
    }).then((response) => {
      if (!mounted.current) return
      if (response.ok) {
        onStatusChanged()
      } else {
        setState({
          kind: 'error',
          message: response.error.message,
          retryable: response.error.retryable
        })
        onStatusChanged() // Refresh local status even after a failed provider attempt or cooldown setup.
      }
    }).catch(() => {
      if (mounted.current) {
        setState({ kind: 'error', message: 'Posita could not contact the local desktop backend.', retryable: true })
        onStatusChanged()
      }
    })
  }

  return (
    <div className="google-account-sync-retry">
      {quota && <small>
        {availability === 'quota-setup'
          ? 'Gmail reported a usage limit. Start a 15-minute local cooldown; this does not read Gmail.'
          : 'The local cooldown has ended. Google may still limit requests. Nothing resumes automatically.'}
      </small>}
      {state.kind === 'confirm' ? <div role="group" aria-label="Confirm one Gmail resume">
        <p>Read Gmail once using the saved connection and resume the encrypted cache? Gmail will not be modified.</p>
        <button autoFocus onClick={() => setState({ kind: 'idle' })}>Cancel resume</button>
        <button onClick={retry}>Read Gmail once</button>
      </div> : <button
        onClick={availability === 'quota-ready' ? () => setState({ kind: 'confirm' }) : retry}
        disabled={state.kind === 'running'}
      >
        <RefreshCw size={14} />
        {state.kind === 'running'
          ? availability === 'quota-setup' ? 'Starting local cooldown…' : 'Syncing Gmail…'
          : availability === 'quota-setup' ? 'Start Gmail cooldown'
            : availability === 'quota-ready' ? 'Resume Gmail sync' : 'Retry Gmail sync'}
      </button>}
      {state.kind === 'running' && (
        <small role="status" aria-live="polite">{availability === 'quota-setup'
          ? 'Saving a local waiting period. No Gmail request is being made.'
          : 'Reading Gmail through Posita’s approved read-only connection.'}</small>
      )}
      {state.kind === 'error' && (
        <div role="alert">
          <small>{state.message}</small>
          {state.retryable && !quota && <button onClick={retry}>Try sync again</button>}
        </div>
      )}
    </div>
  )
}
