import { isAccountId } from './accountState'

export const PROVIDER_MAIL_SYNC_STAGES = [
  'credential-read',
  'token-request',
  'token-response',
  'gmail-profile',
  'gmail-list',
  'gmail-message-batch',
  'projection-commit'
] as const

export type ProviderMailSyncStage = typeof PROVIDER_MAIL_SYNC_STAGES[number]
export type ProviderMailSyncStagePhase = 'started' | 'completed' | 'failed'

export interface ProviderMailSyncStageEventV1 {
  version: 1
  accountId: string
  stage: ProviderMailSyncStage
  phase: ProviderMailSyncStagePhase
}

export interface ProviderMailSyncStageReporter {
  report(event: ProviderMailSyncStageEventV1): void
}

export const silentProviderMailSyncStageReporter: ProviderMailSyncStageReporter = {
  report: () => undefined
}

const isStage = (value: string): value is ProviderMailSyncStage =>
  (PROVIDER_MAIL_SYNC_STAGES as readonly string[]).includes(value)

const isPhase = (value: string): value is ProviderMailSyncStagePhase =>
  value === 'started' || value === 'completed' || value === 'failed'

/**
 * Emits only a fixed stage, fixed phase, and opaque Posita account identifier.
 * Reporting is diagnostic-only and can never change sync behavior.
 */
export class SafeConsoleProviderMailSyncStageReporter implements ProviderMailSyncStageReporter {
  constructor(
    private readonly write: (line: string) => void = (line) => console.info(line)
  ) {}

  report(event: ProviderMailSyncStageEventV1): void {
    if (event.version !== 1 || !isAccountId(event.accountId) ||
        !isStage(event.stage) || !isPhase(event.phase)) return
    try {
      this.write(`[posita-sync-stage] ${JSON.stringify({
        version: 1,
        accountId: event.accountId,
        stage: event.stage,
        phase: event.phase
      })}`)
    } catch {
      // Diagnostics must never alter provider behavior.
    }
  }
}

export const observeProviderMailSyncStage = async <T>(
  reporter: ProviderMailSyncStageReporter,
  accountId: string,
  stage: ProviderMailSyncStage,
  work: () => Promise<T>
): Promise<T> => {
  reporter.report({ version: 1, accountId, stage, phase: 'started' })
  try {
    const result = await work()
    reporter.report({ version: 1, accountId, stage, phase: 'completed' })
    return result
  } catch (error) {
    reporter.report({ version: 1, accountId, stage, phase: 'failed' })
    throw error
  }
}
