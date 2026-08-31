import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react'
import type { RetentionMaintenanceStatusV1 } from '@shared/contracts'

const displayTime = (value: string): string => new Date(value).toLocaleString([], {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export function RetentionMaintenanceStatusPanel({
  retention
}: {
  retention: RetentionMaintenanceStatusV1
}): React.JSX.Element {
  if (retention.status === 'running') {
    return (
      <div className="retention-status" role="status" aria-live="polite">
        <LoaderCircle size={19} className="spin-icon" />
        <span>
          <strong>Checking the encrypted 90-day window</strong>
          <small>Cleanup is running safely in the background.</small>
        </span>
      </div>
    )
  }

  if (retention.status === 'attention-required') {
    return (
      <div className="retention-status retention-status-error" role="alert">
        <AlertTriangle size={19} />
        <span>
          <strong>Automatic local cleanup needs attention</strong>
          <small>{retention.message}</small>
          <small>Next retry: {displayTime(retention.nextRunAt)}</small>
        </span>
      </div>
    )
  }

  const removedMessages = retention.lastRun?.removed.messages ?? 0
  return (
    <div className="retention-status" role="status" aria-label="Automatic retention status">
      {retention.lastRun === undefined
        ? <Clock3 size={19} />
        : <CheckCircle2 size={19} className="recovery-safe-icon" />}
      <span>
        <strong>Automatic 90-day local cleanup</strong>
        <small>Next check: {displayTime(retention.nextRunAt)}</small>
        {retention.lastRun && (
          <small>
            Last checked {displayTime(retention.lastRun.completedAt)} · {removedMessages === 0
              ? 'no expired source mail removed'
              : `${removedMessages} expired source ${removedMessages === 1 ? 'message' : 'messages'} removed`}
          </small>
        )}
        <small>Runs on encrypted Posita data only. Gmail is never changed.</small>
      </span>
    </div>
  )
}
