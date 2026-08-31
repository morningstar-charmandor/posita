import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { POSITA_PROTOCOL_VERSION, type ApplicationStateV1 } from '@shared/contracts'
import {
  desktopApplicationStateDataSource,
  type ApplicationStateDataSource
} from './application/mailDataSource'
import {
  desktopAccountConnectionRecoveryDataSource,
  type AccountConnectionRecoveryDataSource
} from './application/accountConnectionRecoveryDataSource'
import {
  desktopLocalDataDeletionDataSource,
  type LocalDataDeletionDataSource
} from './application/localDataDeletionDataSource'
import { LifecycleNotice } from './features/lifecycle/LifecycleNotice'
import { Workspace } from './features/workspace/Workspace'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; application: ApplicationStateV1 }
  | { status: 'error'; message: string; retryable: boolean }

export interface AppProps {
  dataSource?: ApplicationStateDataSource
  deletionDataSource?: LocalDataDeletionDataSource
  recoveryDataSource?: AccountConnectionRecoveryDataSource
}

export function App({
  dataSource = desktopApplicationStateDataSource,
  deletionDataSource = desktopLocalDataDeletionDataSource,
  recoveryDataSource = desktopAccountConnectionRecoveryDataSource
}: AppProps): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    void dataSource.loadApplicationState().then((response) => {
      if (!active) return
      setState(response.ok
        ? { status: 'loaded', application: response.value }
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

  if (state.application.mode === 'local-data-deleted') {
    return (
      <main className="startup-state" aria-labelledby="deleted-state-title">
        <span className="startup-icon"><ShieldCheck size={21} /></span>
        <h1 id="deleted-state-title">Local data has been deleted</h1>
        <p>Posita removed its local mailbox cache, stored credentials, and encryption key.</p>
        <p>Your provider mailbox was not deleted or changed.</p>
        <small>Account connection is not available in this build yet.</small>
      </main>
    )
  }

  if (state.application.mode === 'recovery-required') {
    return (
      <main className="startup-state" role="alert">
        <span className="startup-icon startup-error"><AlertTriangle size={21} /></span>
        <h1>Local data recovery needs attention</h1>
        <p>Posita stopped before opening private mail data because startup could not finish safely.</p>
        <p>Quit and reopen Posita to retry. No remote mailbox action is performed.</p>
      </main>
    )
  }

  return (
    <div className="application-ready-state">
      <Workspace
        dataset={state.application.snapshot.dataset}
        connectConsent={state.application.connectConsent}
        deletionDataSource={deletionDataSource}
        recoveryDataSource={recoveryDataSource}
        onLocalDataDeleted={() => setState({
          status: 'loaded',
          application: { version: POSITA_PROTOCOL_VERSION, mode: 'local-data-deleted' }
        })}
      />
      <LifecycleNotice
        lifecycle={state.application.lifecycle}
        accounts={state.application.snapshot.dataset.accounts}
      />
    </div>
  )
}
