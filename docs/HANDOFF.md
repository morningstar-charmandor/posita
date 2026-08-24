# Posita Continuity Handoff

Last reviewed: 2026-08-24

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
- separate authorized-start and existing-operation recovery entry points,
- a safe lifecycle-status projection with truthful pending/retry states, bounded
  progress, and allow-listed error detail,
- a named cancellable startup recovery owner that inspects lifecycle state before
  key bootstrap and keylessly resumes every full-deletion phase,
- durable `local-data-deleted` startup mode that prevents replacement-key creation
  and fixture reseeding on every later restart,
- fail-closed conflict handling and deterministic cancellation/restart coverage,
- existing-key enforcement and fixture-seed suppression while disconnect is pending,
- accessible names for icon-only workspace controls and reduced-motion styling,
- deterministic credential-free verification through `npm run verify`.

Simulated or deliberately inactive:

- all accounts, people, topics, messages, summaries, and drafts are fixtures,
- generated-looking summaries and drafts are not produced by an AI provider,
- no OAuth credential has been created or stored,
- encrypted provider-account and sync-state tables contain no real account,
- authorization revocation uses deterministic test implementations only,
- full local deletion has a recovery-only startup composition but no production
  initiation path or renderer command,
- confirmation and lifecycle-status services have no preload, IPC, or UI surface,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- Gmail OAuth, message ingestion, incremental history sync, or user-triggered/live disconnect,
- runtime sync coordination, provider reconciliation, or deduplication logic,
- user-facing local-deletion confirmation/status or a dedicated deleted-state view,
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
safe status, and full-deletion startup recovery are complete at the application
and local-storage layers. Continue in this order:

1. Add a read-only renderer state for `local-data-deleted`, pending, and
   retry-required lifecycle outcomes without exposing a mutation command.
2. Design the narrow confirmed-deletion IPC only after the read-only status path
   is reviewed end to end.
3. Keep pending disconnect visible but inactive until a real idempotent Google
   revocation adapter can be composed and tested.
4. Decide the controlled compatibility behavior for older fixture caches that do
   not contain absolute retention timestamps before scheduling maintenance.
5. Keep real Gmail ingestion disabled until the lifecycle activation gate passes.

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
- Current verified baseline: 25 test files, 147 tests, strict typecheck, structure
  checks, and production Electron build passing.

Native verification migrated the development database to schema v3 with 21
encrypted records, zero legacy account rows, a `ready` cache state, an
OS-protected installation key, and no known fixture plaintext found in the
database, WAL, or shared-memory sidecar scan.

Use `git log --oneline` for newer checkpoints; Git remains the authoritative
record of exact file-level changes.
