import { AlertTriangle, LoaderCircle } from 'lucide-react'
import type {
  LifecycleOperationStatusV1,
  LifecycleStatusSnapshotV1
} from '@shared/contracts'

const stageLabels: Record<LifecycleOperationStatusV1['stage'], string> = {
  'revoking-access': 'Revoking provider access',
  'removing-credentials': 'Removing local credentials',
  'removing-account-state': 'Removing local account state',
  'removing-mail-data': 'Removing cached mail',
  'sanitizing-storage': 'Sanitizing local storage',
  'erasing-encryption-key': 'Erasing the local encryption key'
}

export interface LifecycleNoticeProps {
  lifecycle: LifecycleStatusSnapshotV1
  accounts: readonly { id: string; label: string; address?: string }[]
}

const accountName = (
  operation: LifecycleOperationStatusV1,
  accounts: readonly { id: string; label: string; address?: string }[]
): string | undefined => {
  if (!operation.accountId) return undefined
  const account = accounts.find((candidate) => candidate.id === operation.accountId)
  return account
    ? account.address ? `${account.label} · ${account.address}` : account.label
    : 'A local account'
}

export function LifecycleNotice({
  lifecycle,
  accounts
}: LifecycleNoticeProps): React.JSX.Element | null {
  if (lifecycle.state === 'idle') return null
  const requiresAttention = lifecycle.state === 'attention-required'

  return (
    <aside
      className={`lifecycle-notice ${requiresAttention ? 'lifecycle-attention' : ''}`}
      aria-label="Local data activity"
      role={requiresAttention ? 'alert' : 'status'}
    >
      <span className="lifecycle-notice-icon" aria-hidden="true">
        {requiresAttention ? <AlertTriangle size={17} /> : <LoaderCircle size={17} />}
      </span>
      <div className="lifecycle-notice-copy">
        <strong>{requiresAttention ? 'Local data needs attention' : 'Local data work is pending'}</strong>
        {lifecycle.operations.map((operation) => (
          <div className="lifecycle-operation" key={operation.operationId}>
            {accountName(operation, accounts) && <span>{accountName(operation, accounts)}</span>}
            <span>{stageLabels[operation.stage]}</span>
            <progress
              aria-label={`${stageLabels[operation.stage]} progress`}
              max={operation.totalSteps}
              value={operation.completedSteps}
            />
            <small>{operation.message}</small>
          </div>
        ))}
        {requiresAttention && (
          <small>This build cannot retry lifecycle work from this screen.</small>
        )}
        <small>No remote mailbox action is triggered by this status view.</small>
      </div>
    </aside>
  )
}
