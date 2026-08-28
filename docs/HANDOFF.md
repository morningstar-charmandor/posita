# Posita Continuity Handoff

Last reviewed: 2026-08-28

This is the first document to read when Posita work continues in a new AI model,
thread, chat, or development session. It records current state and the safest
next move. Technical details remain in their linked source documents.

## Current state

Posita is at **Gate 2D: encrypted account lifecycle in progress**. The product is
a runnable Electron desktop prototype using React, strict TypeScript, and SQLite.
All visible mail is deterministic sample data.

The canonical public source repository is
`https://github.com/morningstar-charmandor/posita`. The local `main` branch is
expected to track `origin/main`. The persistent `staging` branch tracks
`origin/staging` and is the normal integration target for future work. `main`
remains the stable verified branch.

Implemented:

- Daily Brief, topic timeline, source-message inspection, classic unified mail,
  and editable local draft interactions,
- accessible loading, error, retry, empty, and source-grounding behavior,
- sandboxed Electron renderer with a narrow validated preload/IPC contract,
- SQLite schema versions 1–7 with transactional migrations and encrypted seeding,
- main-process `SecretVault` with asynchronous OS-backed protection,
- fail-closed credential behavior and a test-only deterministic fake,
- per-installation OS-protected data key and AES-256-GCM record envelopes,
- associated-data binding for record identity, scope, type, and ordering,
- resumable legacy plaintext migration with WAL truncation and compaction,
- encrypted-record purge and cryptographic key-erasure primitives,
- 90-day private-alpha retention and least-privilege Gmail authorization policy,
- documented future provider boundary with one account-scoped normalized mail
  model, one sync coordinator, explicit cache reconciliation, and central
  idempotent source identity,
- versioned provider-account and sync-state contracts with runtime validation,
- encrypted provider subject, consent, cursor, success, and typed failure state
  behind a main-process-only, account-scoped repository,
- explicit ownership boundaries for provider, cache, correction, derived, draft,
  pending-command, and lifecycle state,
- a strict non-sensitive lifecycle journal that retains incomplete disconnect and
  delete-local-data progress outside the deletable cache-key boundary,
- an injected-clock 90-day retention policy using absolute source timestamps,
- controlled startup replacement of only the exact timestamp-free historical
  fixture dataset, with mixed, edited, partial, and unknown caches refused,
- conservative eviction of expired source mail, cited topics/briefs, and people
  left without retained references,
- atomic encrypted dataset replacement with resumable sanitization,
- idempotent account removal that preserves other-account sources, evicts every
  touched topic/brief, and retains only still-referenced people,
- a single-flight disconnect orchestrator over revocation, credential deletion,
  encrypted provider-state deletion, account-data removal, and compaction,
- phase-safe retry behavior for action failures and crashes after an action but
  before journal advancement,
- an installation-wide delete-local-data orchestrator over all stored refresh
  credentials, encrypted account state, mail/derived records, SQLite sanitization,
  OS-vault data-key erasure, and in-memory key destruction,
- durable lifecycle exclusion that prevents a second full deletion or an
  overlapping same-account disconnect after process restart,
- a bounded five-minute exact-text confirmation challenge bound to one generated
  full-deletion operation and an auditable non-private SQLite receipt,
- deterministic startup cleanup of strictly expired confirmation receipts while
  preserving receipts tied to incomplete local deletion,
- separate authorized-start and existing-operation recovery entry points,
- a safe lifecycle-status projection with truthful pending/retry states, bounded
  progress, and allow-listed error detail,
- a named cancellable startup recovery owner that inspects lifecycle state before
  key bootstrap and keylessly resumes every full-deletion phase,
- durable `local-data-deleted` startup mode that prevents replacement-key creation
  and fixture reseeding on every later restart,
- fail-closed conflict handling and deterministic cancellation/restart coverage,
- existing-key enforcement and fixture-seed suppression while disconnect is pending,
- one versioned read-only application-state query that atomically composes the
  fixture snapshot and bounded lifecycle projection in ready mode,
- accessible pending, retry-required, recovery-required, and local-data-deleted
  UI states with account provenance and no mutation hidden inside status loading,
- a Settings & privacy local-deletion flow with separate fixed prepare/execute
  methods, exact typed confirmation, same-window challenge binding, and safe errors,
- ready-mode active deletion composition that removes fixture cache and credentials,
  sanitizes SQLite, erases the OS-protected key, destroys the live protector, and
  transitions the read-only application state only after completion,
- one async storage-sanitizer contract with a single-flight worker-thread adapter
  for every file-backed database, bounded versioned worker messages, and safe
  failure mapping; the inline adapter is limited to in-memory tests and legacy migration,
- read-only conflict preflight before confirmation so preparation never creates a
  receipt or lifecycle operation while other durable work is pending,
- accessible names for icon-only workspace controls and reduced-motion styling,
- a reviewed `google-gmail-readonly-v1` consent projection inside the existing
  read-only application state, with an accessible Settings preview for scope,
  retention, encryption, AI inactivity, disconnect, and disabled activation,
- truthful sample-mode labels that do not describe fixture accounts, briefs, or
  deterministic drafts as live Gmail or production AI,
- deterministic credential-free verification through `npm run verify`.

Simulated or deliberately inactive:

- all accounts, people, topics, messages, summaries, and drafts are fixtures,
- generated-looking summaries and drafts are not produced by an AI provider,
- no OAuth credential has been created or stored,
- encrypted provider-account and sync-state tables contain no real account,
- authorization revocation uses deterministic test implementations only,
- local deletion operates only on deterministic fixture-backed Posita data because
  no real account or credential exists,
- account disconnect remains application-only and has no preload, IPC, or UI trigger,
- Gmail connection consent is preview-only and its activation control is disabled,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- Gmail OAuth, message ingestion, incremental history sync, or user-triggered/live disconnect,
- runtime sync coordination, provider reconciliation, or deduplication logic,
- user-triggered account disconnect or any remote mailbox mutation control,
- automatic pending-disconnect resume with a live idempotent revocation adapter,
- automatic retention scheduling and user-visible maintenance status,
- a model provider, embeddings, classification, retrieval, or generation,
- automatic 90-day maintenance or active account lifecycle scheduling,
- production-scale encrypted search or attachment storage,
- packaging, signing, telemetry, or external-user onboarding.

## Non-negotiable boundaries

- Do not ingest real mail until encrypted account lifecycle and retention pass.
- Do not add a Gmail client ID or personal credential to the repository.
- Never expose credentials, database handles, filesystem paths, or provider
  payloads through renderer IPC.
- Never imply fixture behavior is live Gmail or production AI.
- Never send, delete, archive, label, or otherwise mutate a mailbox without a
  separate reviewed capability and explicit user confirmation.
- Preserve citations from every generated factual claim to source message IDs.

## Next recommended milestone

Proceed with **Gate 2D: encrypted account lifecycle** before implementing OAuth.

Encrypted account state, ownership, the crash-resume journal, deterministic
retention, account removal, disconnect, full local deletion, explicit confirmation,
safe status, full-deletion startup recovery, read-only lifecycle UI, and explicitly
confirmed local deletion are complete at their current layers. Continue in this order:

1. Keep pending disconnect visible but inactive until a real idempotent Google
   revocation adapter can be composed and tested.
2. Define the provider-independent authorization-session contract and deterministic
   fake without creating a Google client, credential, browser flow, or live account.
3. Keep real Gmail ingestion disabled until authorization activation is separately
   approved and the remaining lifecycle activation
   and consent gates pass.

Do not solve encrypted search casually. Any index must avoid becoming a second
plaintext mailbox. Record the selected search tradeoff in `docs/DECISIONS.md`.

## How to resume

1. Read `AGENTS.md`, `project.agent.json`, this file, and `README.md`.
2. Read the source document for the area being changed.
3. Run `git status --short`, update `staging` from `origin/staging`, and preserve
   unrelated work.
4. Run `npm run verify` to establish the baseline.
5. Make the smallest coherent change with deterministic tests.
6. Update this handoff, `PROJECT_HISTORY.md`, and `CASE_STUDY.md` as required by
   the documentation rules in `AGENTS.md`.
7. Run `npm run verify` before handing off.

## Evidence and checkpoints

- `24d7269` — Gate 1 interactive product prototype.
- `daf9f73` — Gate 2A local SQLite data foundation.
- `0d56167` — Gate 2B privacy and credential-storage foundation.
- Gate 2C encrypted-cache checkpoint — use `git log --oneline` for its final hash.
- Current verified baseline: 29 test files, 190 tests, strict typecheck, structure
  checks, and production Electron build passing.

Native verification migrated the development database to schema v3 with 21
encrypted records, zero legacy account rows, a `ready` cache state, an
OS-protected installation key, and no known fixture plaintext found in the
database, WAL, or shared-memory sidecar scan.

Use `git log --oneline` for newer checkpoints; Git remains the authoritative
record of exact file-level changes.
