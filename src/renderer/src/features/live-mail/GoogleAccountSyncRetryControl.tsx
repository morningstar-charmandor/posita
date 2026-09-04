import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { POSITA_PROTOCOL_VERSION } from '@shared/contracts'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string; retryable: boolean }

export interface GoogleAccountSyncRetryControlProps {
  accountId: string
  dataSource: Pick<GoogleAccountConnectionPreflightDataSource, 'retrySync'>
  onSynced: () => void
}

export function GoogleAccountSyncRetryControl({
  accountId,
  dataSource,
  onSynced
}: GoogleAccountSyncRetryControlProps): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const retry = (): void => {
    if (state.kind === 'running') return
    setState({ kind: 'running' })
    void dataSource.retrySync({
      version: POSITA_PROTOCOL_VERSION,
      action: 'retry-google-account-sync',
      accountId
    }).then((response) => {
      if (!mounted.current) return
      if (response.ok) {
        onSynced()
      } else {
        setState({
          kind: 'error',
          message: response.error.message,
          retryable: response.error.retryable
        })
      }
    }).catch(() => {
      if (mounted.current) setState({
        kind: 'error',
        message: 'Posita could not contact the local desktop backend.',
        retryable: true
      })
    })
  }

  return (
    <div className="google-account-sync-retry">
      <button onClick={retry} disabled={state.kind === 'running'}>
        <RefreshCw size={14} />
        {state.kind === 'running' ? 'Syncing Gmail…' : 'Retry Gmail sync'}
      </button>
      {state.kind === 'running' && (
        <small role="status" aria-live="polite">Reading Gmail through Posita’s approved read-only connection.</small>
      )}
      {state.kind === 'error' && (
        <div role="alert">
          <small>{state.message}</small>
          {state.retryable && <button onClick={retry}>Try sync again</button>}
        </div>
      )}
    </div>
  )
}
