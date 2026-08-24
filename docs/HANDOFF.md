# Posita Continuity Handoff

Last reviewed: 2026-08-24

This is the first document to read when Posita work continues in a new AI model,
thread, chat, or development session. It records current state and the safest
next move. Technical details remain in their linked source documents.

## Current state

Posita is at **Gate 2B: privacy and credential-storage foundation**. The product
is a runnable Electron desktop prototype using React, strict TypeScript, and
SQLite. All visible mail is deterministic sample data.

The canonical public source repository is
`https://github.com/morningstar-charmandor/posita`. The local `main` branch is
expected to track `origin/main`.

Implemented:

- Daily Brief, topic timeline, source-message inspection, classic unified mail,
  and editable local draft interactions,
- accessible loading, error, retry, empty, and source-grounding behavior,
- sandboxed Electron renderer with a narrow validated preload/IPC contract,
- SQLite schema versions 1–2 with transactional migrations and fixture seeding,
- main-process `SecretVault` with asynchronous OS-backed protection,
- fail-closed credential behavior and a test-only deterministic fake,
- 90-day private-alpha retention and least-privilege Gmail authorization policy,
- deterministic credential-free verification through `npm run verify`.

Simulated or deliberately inactive:

- all accounts, people, topics, messages, summaries, and drafts are fixtures,
- generated-looking summaries and drafts are not produced by an AI provider,
- no OAuth credential has been created or stored,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- encrypted storage for personal mail and derived content,
- Gmail OAuth, message ingestion, incremental history sync, or account disconnect,
- a model provider, embeddings, classification, retrieval, or generation,
- retention maintenance and verified data-deletion workflows,
- packaging, signing, telemetry, or external-user onboarding.

## Non-negotiable boundaries

- Do not ingest real mail into the current plaintext sample-mail schema.
- Do not add a Gmail client ID or personal credential to the repository.
- Never expose credentials, database handles, filesystem paths, or provider
  payloads through renderer IPC.
- Never imply fixture behavior is live Gmail or production AI.
- Never send, delete, archive, label, or otherwise mutate a mailbox without a
  separate reviewed capability and explicit user confirmation.
- Preserve citations from every generated factual claim to source message IDs.

## Next recommended milestone

Proceed with **Gate 2C: encrypted private-data cache** before implementing OAuth.

The intended sequence is:

1. Define a versioned authenticated-ciphertext envelope and pure crypto port.
2. Generate a random per-installation AES-256-GCM data key.
3. Protect that data key using the existing OS-backed protector.
4. Encrypt all sensitive source and derived fields with unique nonces and bound
   associated data identifying record, table, field, and envelope version.
5. Design a recoverable migration from fixture-only plaintext without treating
   sample data as personal data.
6. Test round trips, tampering, wrong associated data, key loss, rotation,
   migration interruption, SQLite WAL/temp leakage, and deletion.
7. Keep real Gmail ingestion disabled until the complete gate passes.

Do not solve encrypted search casually. Any index must avoid becoming a second
plaintext mailbox. Record the selected search tradeoff in `docs/DECISIONS.md`.

## How to resume

1. Read `AGENTS.md`, `project.agent.json`, this file, and `README.md`.
2. Read the source document for the area being changed.
3. Run `git status --short` and preserve unrelated work.
4. Run `npm run verify` to establish the baseline.
5. Make the smallest coherent change with deterministic tests.
6. Update this handoff, `PROJECT_HISTORY.md`, and `CASE_STUDY.md` as required by
   the documentation rules in `AGENTS.md`.
7. Run `npm run verify` before handing off.

## Evidence and checkpoints

- `24d7269` — Gate 1 interactive product prototype.
- `daf9f73` — Gate 2A local SQLite data foundation.
- `0d56167` — Gate 2B privacy and credential-storage foundation.
- Current verified baseline: 10 test files, 36 tests, strict typecheck, structure
  checks, and production Electron build passing.

Use `git log --oneline` for newer checkpoints; Git remains the authoritative
record of exact file-level changes.
