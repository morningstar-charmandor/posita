import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Unplug } from 'lucide-react'
import {
  GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT,
  POSITA_PROTOCOL_VERSION,
  type GoogleAccountDisconnectChallengeV1
} from '@shared/contracts'
import type { GoogleAccountConnectionPreflightDataSource } from '../../application/googleAccountConnectionPreflightDataSource'

type State =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | {
      kind: 'challenge'
      challenge: GoogleAccountDisconnectChallengeV1
      enteredText: string
      errorMessage?: string
    }
  | { kind: 'disconnecting' }
  | { kind: 'error'; message: string; retryable: boolean }

export function GoogleAccountDisconnectControl({
  accountId,
  accountLabel,
  dataSource,
  onDisconnected
}: {
  accountId: string
  accountLabel: string
  dataSource: GoogleAccountConnectionPreflightDataSource
  onDisconnected(): void
}): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const prepare = async (): Promise<void> => {
    setState({ kind: 'preparing' })
    try {
      const response = await dataSource.prepareDisconnect({
        version: POSITA_PROTOCOL_VERSION,
        action: 'disconnect-google-account',
        accountId
      })
      if (!mounted.current) return
      setState(response.ok
        ? { kind: 'challenge', challenge: response.value, enteredText: '' }
        : { kind: 'error', message: response.error.message, retryable: response.error.retryable })
    } catch {
      if (mounted.current) setState({
        kind: 'error',
        message: 'Posita could not prepare account disconnection.',
        retryable: true
      })
    }
  }

  const execute = async (challenge: GoogleAccountDisconnectChallengeV1, enteredText: string) => {
    setState({ kind: 'disconnecting' })
    try {
      const response = await dataSource.executeDisconnect({
        version: POSITA_PROTOCOL_VERSION,
        confirmationId: challenge.confirmationId,
        operationId: challenge.operationId,
        action: challenge.action,
        accountId: challenge.accountId,
        enteredText
      })
      if (!mounted.current) return
      if (response.ok) onDisconnected()
      else if (response.error.retryable) {
        setState({ kind: 'challenge', challenge, enteredText, errorMessage: response.error.message })
      } else {
        setState({ kind: 'error', message: response.error.message, retryable: false })
      }
    } catch {
      if (mounted.current) setState({
        kind: 'error',
        message: 'Posita could not confirm whether disconnection finished. Review local status.',
        retryable: false
      })
    }
  }

  if (state.kind === 'preparing' || state.kind === 'disconnecting') {
    return <div role="status"><LoaderCircle size={15} className="spin-icon" /> {
      state.kind === 'preparing' ? 'Preparing disconnect confirmation…' : 'Disconnecting safely…'
    }</div>
  }
  if (state.kind === 'error') {
    return <div role="alert"><p>{state.message}</p>{state.retryable && (
      <button onClick={() => void prepare()}>Try disconnect again</button>
    )}</div>
  }
  if (state.kind === 'challenge') {
    return (
      <div className="disconnect-confirmation">
        {state.errorMessage && <p role="alert">{state.errorMessage}</p>}
        <p>Disconnect <strong>{accountLabel}</strong>?</p>
        <ul>{state.challenge.consequences.map((item) => <li key={item}>{item}</li>)}</ul>
        <label htmlFor={`disconnect-${accountId}`}>
          Type <code>{state.challenge.requiredText}</code> to continue
        </label>
        <input
          id={`disconnect-${accountId}`}
          autoComplete="off"
          value={state.enteredText}
          onChange={(event) => setState({ ...state, enteredText: event.target.value })}
        />
        <button onClick={() => setState({ kind: 'idle' })}>Keep account</button>
        <button
          className="danger-button"
          disabled={state.enteredText !== GOOGLE_ACCOUNT_DISCONNECT_CONFIRMATION_TEXT}
          onClick={() => void execute(state.challenge, state.enteredText)}
        >
          Disconnect Gmail
        </button>
      </div>
    )
  }
  return <button className="danger-button" onClick={() => void prepare()}><Unplug size={15} /> Disconnect…</button>
}
