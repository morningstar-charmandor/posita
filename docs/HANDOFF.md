# Posita Continuity Handoff

Last reviewed: 2026-08-24

This is the first document to read when Posita work continues in a new AI model,
thread, chat, or development session. It records current state and the safest
next move. Technical details remain in their linked source documents.

## Current state

Posita is at **Gate 2C: encrypted private-data cache foundation**. The product
is a runnable Electron desktop prototype using React, strict TypeScript, and
SQLite. All visible mail is deterministic sample data.

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
- SQLite schema versions 1–3 with transactional migrations and encrypted seeding,
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
- accessible names for icon-only workspace controls and reduced-motion styling,
- deterministic credential-free verification through `npm run verify`.

Simulated or deliberately inactive:

- all accounts, people, topics, messages, summaries, and drafts are fixtures,
- generated-looking summaries and drafts are not produced by an AI provider,
- no OAuth credential has been created or stored,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- Gmail OAuth, message ingestion, incremental history sync, or account disconnect,
- runtime sync coordination, provider reconciliation, or deduplication logic,
- a model provider, embeddings, classification, retrieval, or generation,
- 90-day maintenance and account-scoped disconnect/deletion orchestration,
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

The intended sequence is:

1. Define encrypted provider-record and sync-state types with opaque account scope.
2. Define ownership for provider state, local corrections, derived artifacts,
   pending commands, and deletion state without implementing Gmail I/O.
3. Implement rolling 90-day maintenance over decrypted message metadata in a
   worker-safe application service.
4. Define how shared people and topics are recomputed when one account is removed.
5. Implement a deletion-pending state machine that survives interruption between
   credential revocation, data-key erasure, record purge, and compaction.
6. Test disconnect and full-local-delete crashes at every transition.
7. Add explicit consent and safe status contracts without exposing private data.
8. Keep real Gmail ingestion disabled until the lifecycle gate passes.

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
- Current verified baseline: 13 test files, 53 tests, strict typecheck, structure
  checks, and production Electron build passing.

Native verification migrated the development database to schema v3 with 21
encrypted records, zero legacy account rows, a `ready` cache state, an
OS-protected installation key, and no known fixture plaintext found in the
database, WAL, or shared-memory sidecar scan.

Use `git log --oneline` for newer checkpoints; Git remains the authoritative
record of exact file-level changes.
