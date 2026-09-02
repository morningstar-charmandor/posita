import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { POSITA_PROTOCOL_VERSION } from '@shared/contracts'
import type { OpenLiveMailOriginalDataSource } from '../../application/openLiveMailOriginalDataSource'

export interface OpenOriginalConfirmationProps {
  accountId: string
  messageId: string
  accountLabel: string
  dataSource: OpenLiveMailOriginalDataSource
}

type OpenState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'opening' }
  | { status: 'requested' }
  | { status: 'error'; message: string; retryable: boolean }

export function OpenOriginalConfirmation({
  accountId,
  messageId,
  accountLabel,
  dataSource
}: OpenOriginalConfirmationProps): React.JSX.Element {
  const [state, setState] = useState<OpenState>({ status: 'idle' })
  const active = useRef(true)
  useEffect(() => () => { active.current = false }, [])

  const open = (): void => {
    setState({ status: 'opening' })
    void dataSource.openOriginal({
      version: POSITA_PROTOCOL_VERSION,
      action: 'open-original',
      accountId,
      messageId
    }).then((response) => {
      if (!active.current) return
      setState(response.ok
        ? { status: 'requested' }
        : { status: 'error', message: response.error.message, retryable: response.error.retryable })
    }).catch(() => {
      if (active.current) {
        setState({
          status: 'error',
          message: 'Posita could not contact the local desktop backend.',
          retryable: true
        })
      }
    })
  }

  return (
    <div className="open-original-control">
      <button onClick={() => setState({ status: 'confirming' })}>
        <ExternalLink size={14} /> Open original in Gmail…
      </button>
      {(state.status === 'confirming' || state.status === 'opening') && (
        <div className="open-original-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-original-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && state.status === 'confirming') {
                setState({ status: 'idle' })
              }
            }}
          >
            <h4 id="open-original-title">Open Gmail in your browser?</h4>
            <p>Posita will ask your default browser to open this message for {accountLabel}.</p>
            <p>The browser may ask you to sign in. Posita will not send or change mail.</p>
            <div className="open-original-dialog-actions">
              <button
                autoFocus
                disabled={state.status === 'opening'}
                onClick={() => setState({ status: 'idle' })}
              >
                Cancel
              </button>
              <button disabled={state.status === 'opening'} onClick={open}>
                {state.status === 'opening' ? 'Opening…' : 'Open Gmail in browser'}
              </button>
            </div>
          </section>
        </div>
      )}
      {state.status === 'requested' && (
        <p role="status">The request was handed to your default browser.</p>
      )}
      {state.status === 'error' && (
        <div role="alert">
          <p>{state.message}</p>
          {state.retryable && <button onClick={() => setState({ status: 'confirming' })}>Review and try again</button>}
        </div>
      )}
    </div>
  )
}
