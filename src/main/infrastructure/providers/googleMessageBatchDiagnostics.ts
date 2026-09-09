import type {
  ProviderMailSyncStage,
  ProviderMailSyncStagePhase,
  ProviderMailSyncStageReporter
} from '../../application/providerMailSyncDiagnostics'

export type GoogleMessageNormalizationFailureStage =
  | 'gmail-message-identity'
  | 'gmail-message-headers'
  | 'gmail-message-mime'
  | 'gmail-message-base64'
  | 'gmail-message-text-decoding'
  | 'gmail-message-contract'

export type GoogleMessageHttpFailureStage = Extract<ProviderMailSyncStage, `gmail-message-http-${string}`>

export type GoogleMessageRetrievalFailureStage =
  | GoogleMessageHttpFailureStage
  | 'gmail-message-transport'
  | 'gmail-message-http'
  | 'gmail-message-response-body'
  | 'gmail-message-response-limit'
  | 'gmail-message-response-encoding'
  | 'gmail-message-json'
  | 'gmail-message-external-body'

/** One batch owns the event set. No per-message identity or count is accepted. */
export class GoogleMessageBatchStageTracker {
  private readonly emitted = new Set<string>()

  constructor(
    private readonly reporter: ProviderMailSyncStageReporter,
    private readonly accountId: string
  ) {}

  startRetrieval(): void { this.report('gmail-message-retrieval', 'started') }
  startNormalization(): void { this.report('gmail-message-normalization', 'started') }
  failRetrieval(): void { this.report('gmail-message-retrieval', 'failed') }
  failNormalization(): void { this.report('gmail-message-normalization', 'failed') }

  failure(stage: GoogleMessageNormalizationFailureStage | GoogleMessageRetrievalFailureStage): void {
    this.report(stage, 'failed')
  }

  complete(): void {
    for (const stage of ['gmail-message-retrieval', 'gmail-message-normalization'] as const) {
      if (this.emitted.has(`${stage}:started`) && !this.emitted.has(`${stage}:failed`)) {
        this.report(stage, 'completed')
      }
    }
  }

  private report(stage: ProviderMailSyncStage, phase: ProviderMailSyncStagePhase): void {
    const key = `${stage}:${phase}`
    if (this.emitted.has(key)) return
    this.emitted.add(key)
    try {
      this.reporter.report({ version: 1, accountId: this.accountId, stage, phase })
    } catch {
      // Diagnostic failure cannot change mail handling.
    }
  }
}
