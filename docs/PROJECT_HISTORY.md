# Posita Project History

This append-only journal records meaningful product and engineering milestones.
It preserves enough evidence for future development, retrospectives, and a
portfolio case study without relying on chat history. Correct factual errors in
place, but do not rewrite past tradeoffs to make the process appear cleaner than
it was.

## Project origin and naming

Date: before 2026-08-24

The project began from a detailed product concept for an AI-first personal mail
hub. Its working name was changed from **Inka** to **Posita** before the codebase
was established. The enduring product promise became:

> Your inboxes, understood as one.

The central hypothesis is that a personal mail tool should organize attention
around people, topics, context, and next actions—not force the user to repeatedly
scan chronological inboxes.

## Gate 1 — Interactive product prototype

Date: 2026-08-24
Checkpoint: `24d7269`

Goal: prove the core interaction model without credentials, network access, or
claims of production AI.

Delivered:

- Electron, React, TypeScript, and Vite project foundation,
- three-column desktop workspace and calm visual system,
- Daily Brief organized as Needs you, Waiting, and Worth knowing,
- topic context with a source-grounded timeline,
- original-message inspection and visible account provenance,
- unified classic mail view and editable draft flow,
- explicit disabled-send boundary,
- responsive async states and accessibility-oriented interaction tests,
- repository agent contract, machine-readable project map, and one verification
  command.

Important decisions:

- prove usefulness with realistic fixtures before connecting Gmail,
- treat the renderer as untrusted,
- keep provider concerns outside the domain,
- require citations for generated factual claims,
- make AI-agent friendliness an engineering invariant.

Evidence: the product was runnable without network access and the canonical
verification gate passed. All content and generated-looking behavior remained
clearly simulated.

## Gate 2A — Local data foundation

Date: 2026-08-24  
Checkpoint: `daf9f73`

Goal: replace the renderer's direct fixture import with the same layered local
data path that future real data will use.

Delivered:

- built-in Node SQLite behind `MailRepository`,
- normalized strict schema and numbered transactional migrations,
- idempotent fixture seeding,
- application service and versioned read-only IPC contract,
- request, sender, response, and error validation across the process boundary,
- renderer data-source abstraction with retryable failures,
- database, application, IPC, preload, and UI tests.

Important decisions:

- use embedded `node:sqlite` to avoid native add-on and Electron ABI risk,
- keep synchronous database work bounded to the prototype,
- move production-scale sync and indexing to a worker or utility process later.

Evidence: 26 tests and the production build passed at the checkpoint. The UI no
longer imported production fixture data directly, but the database still held
sample content only.

## Gate 2B — Privacy and credential-storage foundation

Date: 2026-08-24  
Checkpoint: `0d56167`

Goal: settle retention and authorization boundaries and create a safe place for
future OAuth refresh credentials before attempting Gmail access.

Delivered:

- allow-listed `SecretVault` contract in the main process,
- asynchronous Electron `safeStorage` protector,
- rejection of unavailable, unknown, and Linux plaintext storage backends,
- SQLite schema version 2 for scheme-tagged protected ciphertext,
- bounded credential inputs, replacement, deletion, rotation, and corruption
  handling,
- deterministic non-production protector for credential-free tests,
- 90-day private-alpha retention decision,
- PKCE, loopback redirect, and `gmail.readonly` authorization boundary,
- structural guard preventing the fake protector from entering production
  composition.

Important decisions:

- fail closed rather than silently weaken credential protection,
- keep access tokens and PKCE material in memory only,
- request the smallest Gmail scope first,
- block real-mail ingestion until source and derived content are encrypted.

Evidence: 10 test files and 36 tests passed with strict typechecking, structure
checks, and the production Electron build. No Google credential or mailbox was
accessed.

## Documentation continuity system

Date: 2026-08-24

Goal: make the project transferable across people, AI models, threads, and future
portfolio work without depending on conversational memory.

Delivered:

- `HANDOFF.md` for current state, blockers, and the next safe move,
- this append-only evidence journal,
- `CASE_STUDY.md` for an honest, evolving portfolio narrative,
- repository and machine-readable rules requiring documentation maintenance.

This entry intentionally leaves exact verification and checkpoint metadata to
the Git commit that introduces the documentation system.

## Public repository established

Date: 2026-08-24
Repository: `https://github.com/morningstar-charmandor/posita`

The complete local project history was connected to its existing empty public
GitHub repository. `main` is the canonical branch and the repository is intended
to remain suitable for portfolio review without containing credentials, personal
mail, private generated content, or local caches.

Publishing does not change the product stage: Gmail and AI remain disconnected,
all visible communication remains fixture data, and real-mail ingestion remains
blocked by the encrypted-cache prerequisite.

## Gate 2C — Encrypted private-data cache foundation

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: encrypt private data cache`

Goal: remove private source and derived values from plaintext SQLite storage and
establish a tamper-evident cache boundary before any Gmail integration.

Delivered:

- documented offline-file threat model and explicit non-goals,
- random per-installation 256-bit data key protected through OS `safeStorage`,
- versioned AES-256-GCM envelopes with unique 96-bit nonces,
- authenticated binding of record type, ID, account scope, ordering, table, field,
  and envelope version,
- encrypted account, person, message, topic, and brief-item records,
- SQLite schema version 3 and interruption-aware plaintext fixture migration,
- secure deletion mode, memory-only SQLite temporary storage, WAL truncation,
  compaction, encrypted-record purge, and key-deletion primitive,
- production composition guards preventing the legacy plaintext repository from
  being used for current mail storage.

Important decisions:

- use record-level authenticated encryption instead of introducing SQLCipher ABI
  and packaging risk,
- keep no plaintext search index,
- fail closed on missing keys, invalid keys, unknown envelopes, and tampering,
- preserve empty legacy tables only as a controlled migration surface,
- describe cleanup as application-level and cryptographic erasure, not forensic
  SSD erasure.

Evidence: 13 test files and 52 tests passed. Tests cover unique envelopes,
tampering, wrong associated data, wrong/missing/corrupt keys, transactional
migration, unexpected-data refusal, interruption recovery, plaintext scans across
real database sidecars, and compacted ciphertext deletion. A native Electron startup
migrated the development database to schema v3, loaded the complete UI, stored 21
encrypted fixture records, left zero legacy account rows, and produced no known
fixture plaintext matches in the database, WAL, or shared-memory sidecar.

Limitations: account-scoped retention, crash-safe disconnect orchestration,
attachments, and encrypted production search remain incomplete. Gmail and AI
remain disconnected.

## Persistent staging branch established

Date: 2026-08-24

The repository added a permanent public `staging` branch based on the latest
verified `main`. Future work integrates through `staging`; `main` remains the
stable portfolio and release-checkpoint branch. Promotion requires the canonical
verification gate, continuity documentation, and a clean diff. Published history
on both shared branches must not be force-rewritten.

## Engineering guidance audit

Date: 2026-08-24

Goal: translate external macOS and AI-assisted engineering advice into Posita's
existing architecture without adding speculative layers or contradicting accepted
decisions.

Delivered:

- repository rules to search and reuse before adding parallel services, stores,
  repositories, schemas, compatibility paths, or dependencies,
- complexity review triggers that use line count as a diagnostic rather than a
  target or hard limit,
- ADR-011 and provider contracts for one canonical account-scoped mail model, one
  trusted sync coordinator, explicit provider/cache ownership, and central
  idempotent source identity,
- bounded, cancellable background-work and typed retry/recovery expectations,
- Electron-specific desktop quality guidance covering native conventions,
  lifecycle ownership, responsive work, and distribution controls,
- accessible names for current icon-only controls plus a mechanically checked
  reduced-motion fallback.

The audit found no current unjustified dependency or duplicate production service
path. The plaintext SQLite repository remains only as the documented Gate 2C
migration reader. SwiftUI, AppKit, SwiftData, and `UserDefaults` recommendations
were deliberately excluded because ADR-002 selects Electron. Multi-window
architecture, provider code, polling, and hard file-size enforcement were not
introduced before a demonstrated need.

Evidence: 13 test files and 53 tests, strict typechecking, structural checks, and
the production build passed. This checkpoint changes engineering contracts and
small accessibility behavior; Gmail, AI, and runtime sync remain unimplemented.

## Gate 2D foundation — Encrypted account and sync state

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add encrypted account state`

Goal: establish the account-scoped persistent contracts needed by retention and
disconnect work without authorizing Google or storing a real provider identity.

Delivered:

- versioned runtime-validated provider-account and sync-state contracts,
- schema version 4 with a strict `encrypted_account_records` table,
- authenticated encryption of provider subject IDs, consent metadata, cursors,
  success timestamps, status, and typed safe failure codes,
- one account-state repository composed in the trusted main process using the
  existing OS-protected cache key and envelope format,
- idempotent state replacement and account-scoped deletion,
- structural verification that production composition uses the encrypted adapter.

Important decisions:

- reuse the existing key hierarchy instead of introducing another key or package,
- leave only opaque Posita account scope and allow-listed record kind queryable,
- keep provider state completely outside IPC and the renderer,
- implement storage before lifecycle orchestration so a future disconnect state
  machine has one validated source of truth.

Evidence: 14 test files and 59 tests passed with strict typechecking, structural
checks, and a production build. Tests cover encrypted round trips, plaintext
absence, replacement, cross-account isolation, metadata substitution, scoped
deletion, invalid-state refusal, and schema-v3 upgrade preservation.

Limitations: no provider account, OAuth token, sync cursor, Gmail request, polling,
retention maintenance, or disconnect workflow is active. Gate 2D remains in
progress; real-mail ingestion stays blocked.

## Gate 2D foundation — Lifecycle ownership and recovery journal

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add lifecycle recovery journal`

Goal: give future retention and deletion orchestration one crash-resumable source
of truth that remains readable after cryptographic erasure.

Delivered:

- versioned disconnect-account and delete-local-data operation contracts,
- separate allow-listed phase sequences and safe failure codes for each operation,
- schema version 5 with a strict non-sensitive lifecycle journal,
- immutable operation identity and account scope with idempotent phase updates,
- pending-operation recovery and completion-only journal cleanup,
- explicit ownership boundaries for provider, cached, user-corrected, derived,
  draft, pending-command, and lifecycle data,
- ADR-012 documenting why deletion progress sits outside the deletable key.

Important decisions:

- store only opaque operation/account IDs, phases, and safe errors in plaintext,
- never store addresses, provider identity, credentials, cursors, mail, derived
  content, or arbitrary errors in the recovery journal,
- keep the journal as progress state only; no current code performs revocation,
  credential deletion, mail deletion, compaction, or key deletion.

Evidence: 15 test files and 65 tests passed with strict typechecking, structural
checks, and a production build. Tests cover operation-specific validation,
idempotent updates, safe retry errors, pending recovery, immutable identity/scope,
completion-only cleanup, and preservation across schema-v3 upgrade.

Limitations: transition execution and user-facing retry status remain deferred.
No real account or private content is stored by the journal, and Gmail remains
disconnected.

## Gate 2D foundation — Deterministic 90-day retention

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add encrypted retention maintenance`

Goal: enforce the private-alpha retention promise over encrypted source and
derived data without parsing display labels or enabling background work.

Delivered:

- separate absolute ISO source timestamps while preserving human display labels,
- an injected-clock, exact-boundary 90-day retention policy,
- fail-closed behavior for missing, display-only, or malformed timestamps,
- conservative deletion of a whole derived topic and dependent brief items when
  any of its cited source messages expires,
- removal of people only when no retained source or topic references them,
- one validated encrypted-cache rewrite transaction for source and derived data,
- resumable sanitization, compaction, WAL truncation, and idempotent repeat runs,
- schema version 6 for timestamp preservation through the legacy fixture migration.

Important decisions:

- never infer retention time from “Today,” “Yesterday,” or another UI label,
- retain messages exactly on the cutoff boundary,
- prefer deleting derived context over preserving an uncited or partly grounded
  summary,
- keep accounts connected when their current 90-day cache becomes empty,
- compose the service without scheduling it on the Electron main event loop.

Evidence: 16 test files and 73 tests passed with strict typechecking, structural
checks, and a production build. Tests cover cutoff behavior, source-derived
eviction, people cleanup, invalid metadata refusal, idempotence, atomic encrypted
replacement, invalid replacement rollback, and sanitization completion.

Limitations: automatic scheduling, progress UI, older fixture-cache timestamp
compatibility, and account-disconnect execution remain deferred. Gmail and AI
remain disconnected.

## Gate 2D foundation — Account-removal projection

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add account removal projection`

Goal: define deterministic source, topic, brief, and person behavior when one
mailbox is removed, without deleting another account's source or preserving stale
derived claims.

Delivered:

- an account-scoped, idempotent local-data removal service,
- removal of the target account and all of its encrypted source messages,
- conservative eviction of every topic and brief touched by removed provenance,
- preservation of other-account sources even when their shared topic is evicted,
- preservation of untouched topics and people still referenced by retained data,
- reuse of the atomic encrypted-cache replacement and sanitization path,
- ADR-013 documenting the safety-versus-temporary-context tradeoff.

Important decisions:

- do not partially retain a topic summary, priority, status, or next action after
  one of its sources is removed,
- do not remove another account's source merely because a shared topic is evicted,
- treat an already absent account as a successful no-op for crash-safe retries,
- keep this as the local mail-data phase rather than an independent disconnect
  workflow or renderer command.

Evidence: 17 test files and 78 tests passed with strict typechecking, structural
checks, and a production build. Tests cover shared-topic eviction, unaffected
topic preservation, retained cross-account sources, reference-based people
cleanup, invalid account IDs, and idempotent retry behavior.

Limitations: credential revocation/deletion, encrypted provider-state deletion,
journal advancement, and user-visible progress are not orchestrated yet. Gmail
and AI remain disconnected.

## Gate 2D foundation — Crash-resumable account disconnect

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: orchestrate account disconnect`

Goal: coordinate the existing deletion primitives in a truthful durable order so
account disconnect can survive action failures and crashes without reporting a
false success.

Delivered:

- a versioned account-disconnect request/result contract,
- an idempotent authorization-revoker interface with deterministic test behavior,
- ordered revocation, refresh-credential deletion, encrypted account-state
  deletion, source/derived removal, SQLite sanitization, and completion,
- journal advancement only after successful action completion,
- safe phase-specific retry errors without raw provider or storage details,
- retry of the same action after a successful action/journal-write crash window,
- per-account single flight that shares identical work and rejects competing IDs,
- separation of logical encrypted replacement from the compaction phase.

Important decisions:

- treat already revoked credentials and already absent local records as success,
- retain completed journal evidence rather than deleting it inside the operation,
- keep the installation data key during one-account disconnect because remaining
  accounts share it,
- do not compose a fake revoker into production or expose disconnect over IPC.

Evidence: 18 test files and 92 tests passed with strict typechecking, structural
checks, and a production build. Tests cover ordered success, failure and retry at
all five actions, journal-write crashes after all five successful actions,
operation-target conflicts, invalid input, same-operation sharing, and competing
single-flight rejection.

Limitations: no Google revocation adapter, background pending-operation resumer,
user-facing status/consent, or full-installation delete-local-data orchestrator
exists. No OAuth credential or real account was used.

## How future entries should be written

For each material milestone, record:

- date and Git checkpoint,
- user or product problem addressed,
- scope delivered and explicitly deferred,
- major decisions and rejected alternatives when meaningful,
- verification evidence and observable result,
- limitations, failures, or follow-up work.

Never invent user research, adoption, performance, accuracy, or business metrics.
Label targets as targets and measured outcomes as measured outcomes.
