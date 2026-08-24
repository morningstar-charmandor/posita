# Main-Process Agent Rules

This directory is the trusted desktop backend. The root `AGENTS.md` also applies.

- Keep `index.ts` as composition and lifecycle code. Put application use cases,
  repositories, policies, and provider adapters in named modules.
- Treat every renderer request as untrusted. Allow-list IPC channels; validate
  sender, version, input, authorization, and output at the boundary.
- Never return OAuth tokens, provider credentials, database handles, raw errors,
  filesystem paths, or model-provider secrets to the renderer.
- Store long-lived credentials only through an OS-keychain adapter. Logs must be
  redacted by construction.
- Mail sync and persistent writes are idempotent and transactional at documented
  boundaries. Persistent schema changes require numbered migrations and rollback
  or recovery guidance.
- A single application-owned sync coordinator schedules provider work. It enforces
  one active sync per account, bounded cross-account concurrency, cancellation on
  disconnect/shutdown, quota-aware backoff, and explicit cursor recovery.
- Provider message and thread IDs are meaningful only with their Posita account
  scope. Deduplication happens before persistence; cross-account lookalikes remain
  separate source records even when a topic relates them.
- Treat provider mail as remote authority and SQLite as an encrypted projection.
  Reconciliation must distinguish provider changes, local corrections, derived
  artifacts, pending commands, and stale cached state.
- Provider and AI clients implement interfaces and have deterministic fakes.
  Application and contract tests must not require network access or credentials.
- A model proposal cannot directly invoke a mailbox mutation. Policy validation,
  explicit user confirmation, and an audit record precede provider execution.
- Return stable structured errors with codes, retryability, and safe user-facing
  detail; do not leak provider payloads or stack traces across IPC.
