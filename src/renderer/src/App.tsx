import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import type { AppSnapshotV1 } from '@shared/contracts'
import { desktopMailDataSource, type MailDataSource } from './application/mailDataSource'
import { Workspace } from './features/workspace/Workspace'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: AppSnapshotV1 }
  | { status: 'error'; message: string; retryable: boolean }

export interface AppProps {
  dataSource?: MailDataSource
}

export function App({ dataSource = desktopMailDataSource }: AppProps): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    void dataSource.loadSnapshot().then((response) => {
      if (!active) return
      setState(response.ok
        ? { status: 'ready', snapshot: response.value }
        : {
            status: 'error',
            message: response.error.message,
            retryable: response.error.retryable
          })
    }).catch(() => {
      if (active) {
        setState({
          status: 'error',
          message: 'Posita could not contact the local desktop backend.',
          retryable: true
        })
      }
    })

    return () => { active = false }
  }, [attempt, dataSource])

  if (state.status === 'loading') {
    return (
      <main className="startup-state" aria-busy="true" aria-label="Loading Posita">
        <span className="startup-icon"><Database size={21} /></span>
        <h1>Preparing your local mail context…</h1>
        <p>Opening Posita’s private on-device database.</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="startup-state" role="alert">
        <span className="startup-icon startup-error"><AlertTriangle size={21} /></span>
        <h1>Local mail data is unavailable</h1>
        <p>{state.message}</p>
        {state.retryable && (
          <button className="startup-retry" onClick={retry}>
            <RefreshCw size={15} /> Try again
          </button>
        )}
      </main>
    )
  }

  return <Workspace dataset={state.snapshot.dataset} />
}
