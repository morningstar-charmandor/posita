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

## Gate 2D foundation — Crash-resumable full local-data deletion

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: orchestrate local data deletion`

Goal: delete all locally held mailbox data and its shared encryption key in a
durable order without claiming success after only logical record removal.

Delivered:

- a versioned installation-wide deletion request/result contract,
- ordered refresh-credential, encrypted account-state, encrypted mail/derived
  record, SQLite sanitization, OS-vault data-key, and in-memory key deletion,
- separate idempotent all-record deletion and sanitization repository primitives,
- journal advancement only after successful phase completion,
- safe retry after action failure and every action/journal-write crash window,
- in-memory and durable exclusion of competing installation deletion,
- durable exclusion between full deletion and same-account disconnect,
- bulk refresh-token deletion that does not depend on decrypting mail or account
  state and also removes orphaned allow-listed credentials.

Important decisions:

- erase the shared installation key only after record removal and compaction,
- destroy the live protector key before journal completion,
- retain the non-sensitive lifecycle journal after cryptographic erasure,
- do not compose or expose deletion until startup can resume key-erasure state
  without creating a replacement key or reseeding fixtures,
- add no dependency, schema, renderer IPC, live credential, or compatibility path.

Evidence: 19 test files and 114 tests passed before final checkpoint verification.
Coverage includes ordered completion, failure/retry at all five phases,
journal-write crashes after each successful phase, operation conflicts, restart-
durable exclusion, account-state enumeration/deletion, logical deletion status,
compaction, OS-vault key erasure, and in-memory key destruction.

Limitations: the service is verified through interfaces and deterministic fakes
but is not startup-composed, scheduled, or user-triggered. There is no safe
post-deletion bootstrap, background resume owner, confirmation/status UI, OAuth
credential, real account, or claim of hardware-forensic erasure.

## Gate 2D foundation — Lifecycle authorization and safe status

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add lifecycle authorization contracts`

Goal: ensure a new full local-data deletion requires explicit current user intent
without making crash recovery depend on a still-open UI or surviving encryption key.

Delivered:

- a versioned five-minute `DELETE LOCAL DATA` confirmation challenge,
- generated opaque confirmation and operation IDs with exact operation binding,
- bounded in-memory pending challenges and exact-key request validation,
- schema version 7 and an immutable SQLite confirmation receipt containing only
  opaque IDs, action type, and confirmation/expiry timestamps,
- idempotent confirmation response recovery and safe persistence errors,
- confirmation enforcement before any new delete-local-data journal operation,
- a separate resume request that only accepts an existing journal operation,
- a safe lifecycle-status projection with bounded stages, progress, retry state,
  allow-listed failure codes, and no claim that pending work is currently running,
- ADR-016 documenting the authorization/recovery separation.

Important decisions:

- never persist the typed confirmation phrase,
- treat confirmation as authorization to create one operation, not authorization
  that must remain valid for every crash retry,
- let recovery bypass expired confirmation only after a durable operation exists,
- refuse to create an operation through the recovery entry point,
- expose no preload, IPC, renderer command, or UI before startup recovery is safe,
- add no dependency, credential, private payload, or provider connection.

Evidence: 22 test files and 134 tests passed before final checkpoint verification.
Coverage includes exact text, expiry, bounded challenges, idempotence, immutable
SQLite binding, corrupt receipt refusal, unauthorized operation refusal,
confirmation-storage failure, confirmation-free resume, resume-not-found safety,
safe progress mapping, and lifecycle-status storage failure.

Limitations: no background owner invokes recovery at startup, and the current
bootstrap can still recreate a key and reseed fixtures after erasure. Confirmation
and status are application contracts only; there is no user-facing surface, receipt
retention/cleanup policy, OAuth credential, real account, or live deletion.

## Gate 2D foundation — Restart-safe full-deletion recovery

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: add restart-safe lifecycle recovery`

Goal: make an already-authorized full deletion survive process restarts without
requiring its erased key and without allowing normal fixture bootstrap to undo it.

Delivered:

- one named startup lifecycle-recovery owner before cache-key bootstrap,
- a deletion-only SQLite/vault adapter that never loads, creates, decrypts, or
  replaces the installation key,
- recovery from every full-deletion phase when the key is already absent,
- a durable `local-data-deleted` runtime selected by the completed journal marker,
- repeated-restart prevention of replacement-key creation and fixture reseeding,
- fail-closed handling for conflicting pending lifecycle operations,
- existing-key enforcement and fixture-reseed suppression for pending disconnect,
- cancellation between phases through one Electron shutdown-owned abort signal,
- shared raw deletion/sanitization primitives instead of parallel recovery SQL,
- a latest-installation-deletion repository query that includes completion,
- deterministic dependency-injected bootstrap tests with no OS credential access,
- ADR-017 documenting pre-key-bootstrap recovery and its scaling boundary.

Important decisions:

- inspect migrations, lifecycle state, and the vault before calling key
  `loadOrCreate`,
- let the completed deletion marker act as a tombstone until a future explicit
  start-fresh command defines how it is cleared,
- do not automatically resume disconnect without a real idempotent revocation
  adapter,
- fail closed rather than choose between conflicting destructive journal entries,
- keep current bounded fixture compaction at startup but require a worker or
  Electron utility process before real mailbox volume,
- expose no new IPC, renderer mutation, live provider, or credential.

Evidence: 25 test files and 147 tests passed before final checkpoint verification.
Coverage includes key-missing recovery, terminal key-phase recovery, repeated
restart emptiness, no fixture reseed, no replacement key, conflicting journal
refusal, shutdown cancellation, keyless action behavior, latest completed-marker
loading, pending-disconnect reporting, pending-disconnect empty-cache protection,
and the pre-existing phase crash matrix.

Limitations: the renderer currently receives the generic unavailable-data state
rather than a dedicated deleted/pending/retry view. Full deletion still has no
production initiation path. Disconnect recovery, production-scale off-main-thread
compaction, confirmation-receipt cleanup policy, OAuth, and real mail remain deferred.

## Gate 2D foundation — Read-only lifecycle application state

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: expose read-only lifecycle state`

Goal: make lifecycle outcomes truthful and operable in the renderer without
activating deletion, disconnect, or any other mutation capability.

Delivered:

- one versioned `loadApplicationState` IPC query replacing the renderer-facing
  snapshot-only method,
- main-process composition of fixture mail and safe lifecycle status into one
  coherent ready-state response,
- runtime validation in main and preload for ready, deleted, recovery-required,
  pending, and retry-required states,
- a dedicated completed-local-deletion screen that distinguishes Posita data from
  the provider mailbox,
- a fail-closed startup recovery-required screen with no action control,
- accessible pending and attention notices with bounded progress and visible
  account provenance,
- ADR-018 and updated repository, architecture, database, continuity, and case-
  study documentation.

Important decisions:

- keep mail and lifecycle reads in one query so the renderer cannot combine
  snapshots from different moments,
- represent bootstrap failure as a read-only recovery-required state,
- keep the preload surface at one read method,
- expose no confirmation, retry, disconnect, or deletion command in this slice.

Evidence: 26 test files and 157 tests passed before final checkpoint verification.
Coverage includes strict request and response validation, trusted-frame IPC,
preload protocol rejection, application-state composition, deleted and recovery
screens, pending progress, retry-required announcements, and absence of a retry
mutation control.

Limitations: all displayed mail remains fixture-backed. Pending disconnect is not
resumed, the recovery-required screen relies on app restart rather than an IPC
retry command, and full local deletion has no production initiation path. OAuth,
Gmail, AI, sending, and every remote mailbox mutation remain disconnected.

## Gate 2D foundation — Confirmed local-deletion capability

Date: 2026-08-24
Checkpoint: use the Git commit whose subject is `feat: activate confirmed local deletion`

Goal: let the user delete Posita's local data without weakening the existing
authorization, encryption, recovery, or renderer trust boundaries.

Delivered:

- fixed versioned prepare and execute methods for one local-deletion capability,
- exact runtime validation in preload and main with stable allow-listed errors,
- read-only lifecycle-conflict preflight before any challenge is created,
- five-minute challenge delivery bound to the trusted window that prepared it,
- exact `DELETE LOCAL DATA` entry before the non-private receipt is persisted,
- ready-mode composition of credential deletion, account-state removal, cache
  deletion, SQLite sanitization, protected-key erasure, and live-key destruction,
- immediate transition to the durable local-data-deleted UI after completion,
- an accessible Settings & privacy dialog covering overview, preparation,
  confirmation, progress, error, retry, cancel, and completed states,
- ADR-019 plus updated privacy, cache, architecture, handoff, and case-study records.

Important decisions:

- keep preparation non-destructive and separate from execution,
- keep the read-only application-state query free of mutation behavior,
- bind the challenge to its originating trusted window as defense in depth,
- preflight durable conflicts before recording confirmation to avoid accumulating
  authorized operations that cannot start,
- permit a previously authorized journal operation to retry after confirmation
  expiry while refusing to create new work from an expired challenge,
- expose no account, message, provider, credential, SQL, or filesystem target.

Evidence: 28 test files and 174 tests passed before final checkpoint verification.
Coverage includes exact contract validation, malformed preload responses, trusted-
window binding, unavailable-state refusal, conflict preflight, no-work preparation,
text mismatch refusal, ordered active deletion, safe phase failure, post-expiry
authorized retry, real encrypted bootstrap deletion, key erasure, repeated-restart
deleted mode, UI disabled states, explicit consequence copy, errors, and retry.

Limitations: current mail is deterministic fixture data and no real OAuth credential
exists. SQLite sanitization is synchronous for the bounded prototype and must move
off the main event loop before real mailbox volume. Confirmation-receipt cleanup,
live disconnect, Gmail, AI, sending, packaging, and external-user evidence remain
deferred.

## Gate 2D foundation — Legacy fixture retention compatibility

Date: 2026-08-27
Checkpoint: use the Git commit whose subject is `feat: upgrade legacy fixture retention metadata`

Goal: make historical fixture-only installations eligible for deterministic
retention without guessing dates or creating a migration rule that could overwrite
unknown data.

Delivered:

- a pure compatibility planner within the existing retention source of truth,
- exact semantic recognition of the complete historical fixture dataset with all
  source timestamps absent,
- replacement with current timestamped fixtures through the existing atomic
  encrypted rewrite and SQLite sanitization path,
- fail-closed refusal for mixed, edited, partial, and otherwise unknown caches,
- startup composition only in normal ready mode, explicitly bypassed while an
  account disconnect is pending,
- ADR-020 and aligned privacy, cache, database, architecture, continuity, and
  portfolio documentation.

Important decisions:

- never parse presentation labels such as “Today” into retention dates,
- never repair a cache from a partial match or message IDs alone,
- replace only deterministic sample data and never apply this policy to provider
  records,
- reuse the existing repository rewrite and sanitization boundaries rather than
  introducing a second migration framework.

Evidence: 28 test files and 179 tests passed before final checkpoint verification.
Coverage includes exact legacy recognition, complete-cache no-op, mixed and edited
cache refusal before mutation, invalid reference refusal, and a real encrypted
cache restart upgrade.

Limitations: retention remains unscheduled. Confirmation-receipt cleanup and
production-scale off-main-event-loop sanitization remain the next lifecycle work.
No dependency or schema migration was added; Gmail, AI, sending, and live account
disconnect remain deferred.

## Gate 2D foundation — Confirmation-receipt cleanup

Date: 2026-08-27
Checkpoint: use the Git commit whose subject is `feat: clean expired deletion confirmations`

Goal: minimize retained operational authorization metadata without breaking a
safe retry of already-authorized deletion work.

Delivered:

- one narrow repository cleanup capability using the existing confirmation and
  lifecycle tables,
- strict expiry comparison that retains a receipt at the exact boundary,
- atomic preservation of receipts linked to incomplete delete-local-data journals,
- deterministic removal after expiry when no pending operation needs the binding,
- startup composition after lifecycle recovery establishes authoritative state,
- existing safe storage-error mapping for invalid clocks and cleanup failures,
- ADR-021 and aligned architecture, privacy, database, handoff, agent, and case-
  study documentation.

Important decisions:

- preserve an expired receipt while in-process retry can still require its exact
  confirmation-to-operation binding,
- let restart recovery remain confirmation-free for already-journaled work,
- remove completed or unstarted expired receipts rather than retaining audit rows
  indefinitely,
- add no timer, renderer method, IPC channel, dependency, or schema migration.

Evidence: 28 test files and 185 tests passed before final checkpoint verification.
Coverage includes exact expiry, pending-operation preservation, completion cleanup,
idempotence, invalid-boundary refusal, storage and clock failures, and real startup
cleanup against SQLite.

Limitations: cleanup currently runs at startup rather than on a recurring schedule.
Production-scale SQLite sanitization remains synchronous and must move off the
Electron main event loop before real mailbox volume. Gmail, AI, sending, and live
account disconnect remain deferred.

## Gate 2D foundation — Off-main-thread SQLite sanitization

Date: 2026-08-27
Checkpoint: use the Git commit whose subject is `feat: move sqlite sanitization off main thread`

Goal: prevent secure SQLite compaction from blocking Electron's main event loop
before Posita handles mailbox-scale encrypted data.

Delivered:

- one async application-level storage-sanitizer contract shared by retention,
  fixture compatibility, disconnect, active deletion, and startup recovery,
- a single-flight Node worker-thread adapter for every file-backed runtime,
- one packaged worker entry with an exact bounded versioned message protocol,
- a separate SQLite connection inside the worker for WAL checkpoint, `VACUUM`,
  final checkpoint, and resumable cache-state completion,
- stable safe failure mapping without returning raw worker or database details,
- focused real-file tests for deleted-byte removal, completion state, concurrent
  call coalescing, worker failure, and refusal of unsupported in-memory paths,
- ADR-022 and aligned agent, cache, database, privacy, architecture, handoff, and
  portfolio documentation.

Important decisions:

- keep sanitization as one atomic lifecycle phase and honor shutdown cancellation
  between phases instead of terminating `VACUUM` midway,
- retain the inline adapter only for bounded in-memory tests and the one-time
  legacy plaintext migration, which keeps its existing connection owner,
- centralize sanitization outside `MailRepository` rather than retaining duplicate
  repository and recovery compaction paths,
- add no dependency, schema migration, renderer method, IPC channel, provider,
  timer, or compatibility layer.

Evidence: 29 test files and 188 tests passed before final checkpoint verification.
The production build emits a distinct `out/main/sqliteSanitizationWorker.js` entry.

Limitations: retention and account lifecycle scheduling remain inactive. The
worker phase is intentionally non-interruptible once started. Gmail, AI, sending,
live account disconnect, and explicit connect consent remain deferred.

## Gate 2D foundation — Read-only Gmail consent preview

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: add gmail consent preview`

Goal: make Posita's future Gmail access understandable and reviewable before any
authorization capability or credential exists.

Delivered:

- one immutable `google-gmail-readonly-v1` shared consent contract,
- exact runtime validation of scope, retention, and disclosure copy,
- composition into the existing read-only ready-state query rather than a new IPC
  capability,
- an accessible Settings preview covering `gmail.readonly`, the 90-day import and
  rolling cache, local encryption, inactive AI processing, and disconnect effects,
- a visibly disabled connection action with explicit no-client/no-credential copy,
- truthful sample-mode labels for fixture mailboxes, briefs, search, and drafts,
- ADR-023 and aligned Gmail, privacy, architecture, handoff, agent, and portfolio
  documentation.

Important decisions:

- reviewing consent creates no authorization state, account, token, browser flow,
  or persisted receipt,
- any scope or copy change requires a reviewed versioned contract change,
- keep the renderer as a structured presentation layer and avoid duplicating
  consent constants in UI code,
- add no dependency, schema migration, provider adapter, IPC method, credential,
  external action, or compatibility path.

Evidence: 29 test files and 190 tests passed before final checkpoint verification.
Coverage includes exact consent validation, malformed scope/disclosure rejection,
main/IPC composition, disabled activation, and truthful fixture labeling.

Limitations: the browser-control runtime was unavailable during the automated
checkpoint, so layout assurance came from semantic component tests and production
build verification. OAuth remains entirely inactive. No real Gmail account, AI
provider, credential, or mailbox data was used.

## Gate 2D foundation — Authorization-session contract and deterministic fake

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: add authorization session contract`

Goal: make the future Gmail authorization lifecycle precise and testable before
adding a Google client, browser flow, credential, live account, or UI activation.

Delivered:

- one provider-independent trusted-main `AccountAuthorizationAdapter` with
  versioned begin, complete, and cancel operations,
- exact validation of the reviewed `google-gmail-readonly-v1` consent and single
  `gmail.readonly` scope,
- bounded HTTPS authorization targets, explicit-port loopback callbacks, session
  identity, expiry, provider subject, and refresh-grant contracts,
- stable typed failures for invalid requests, overlap, missing or expired sessions,
  rejected callbacks, and provider unavailability,
- one deterministic credential-free fake covering a single pending session,
  exact expiry, cancellation, callback preservation, retry, and safe failures,
- alignment of encrypted provider-account consent validation with the reviewed
  string identity, plus rejection coverage for the obsolete numeric placeholder,
- ADR-024 and aligned agent, architecture, Gmail, privacy, cache, database,
  handoff, project-map, and portfolio documentation.

Important decisions:

- keep successful refresh grants inside the trusted main-process contract and
  require a future coordinator to move them directly into `SecretVault`,
- keep the fake out of production startup and enforce that boundary structurally,
- serialize one pending authorization session in the fake to make overlap explicit,
- add no dependency, schema migration, renderer method, IPC channel, Google
  configuration, browser action, external request, or production credential,
- add no compatibility path for the numeric consent placeholder because encrypted
  provider-account storage is verified empty; unexpected stale simulated data
  fails closed instead of being rewritten.

Evidence: 30 test files and 198 tests passed before final checkpoint verification.
Coverage includes exact request and grant validation, scope widening, unknown
fields, overlap, cancellation, mismatched callbacks, exact expiry, retryable
provider failure, encrypted persistence, and obsolete-consent rejection.

Limitations: no real OAuth adapter, PKCE generation, loopback listener, browser
launch, code exchange, credential persistence, account creation, startup
composition, preload/IPC command, or enabled UI action exists. No real Gmail
account, AI provider, credential, mailbox data, or network call was used.

## Gate 2D foundation — Credential-free account-connection coordination

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: coordinate account connection persistence`

Goal: prove how an authorized account becomes durable across the credential vault
and encrypted account-state repository without activating OAuth or using a real
credential.

Delivered:

- one trusted `AccountConnectionService` over the existing authorization, vault,
  and account-state interfaces,
- exact begin-input and provider-output validation with pending session/account
  binding,
- preflight rejection for already connected and one-sided credential/provider
  state before authorization and again before persistence,
- vault-first, encrypted-provider-state-second completion ordering,
- reverse cleanup of ambiguous provider-state writes and their stored credential,
- a distinct recovery-required failure when cleanup cannot prove both records are
  absent,
- preservation of retryable provider and callback failures without losing the
  in-memory authorization session,
- structural enforcement that neither the coordinator nor deterministic
  authorization fake enters production composition,
- ADR-025 and aligned agent, architecture, Gmail, privacy, handoff, project-map,
  and portfolio documentation.

Important decisions:

- never return the refresh grant from the coordinator; success returns only the
  validated encrypted provider-account projection,
- refuse inconsistent existing state instead of overwriting or silently deleting it,
- treat a provider-state save as potentially committed when it throws, deleting
  account state before removing the credential,
- keep explicit recovery as the next design step rather than inventing a hidden
  startup repair or renderer mutation,
- add no dependency, schema migration, compatibility path, production composition,
  IPC method, UI activation, Google client, browser action, external request, or
  real credential.

Evidence: 31 test files and 209 tests passed before final checkpoint verification.
Coverage includes successful ordering, invalid input, existing and inconsistent
state, credential-write failure, ambiguous state-write rollback, rollback failure,
provider retry, mismatched grants, cancellation, and stable safe errors.

Limitations: no recovery command for one-sided state exists yet. The service is
not composed into startup, preload, IPC, Settings, or a real provider. No Gmail
account, AI provider, production credential, personal mailbox data, browser, or
network call was used.

## Gate 2D foundation — Read-only account-connection consistency

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: diagnose account connection consistency`

Goal: make cross-store connection failures diagnosable without decrypting a
credential or inventing an automatic destructive repair policy.

Delivered:

- one exact versioned consistency result on the existing
  `AccountConnectionService`,
- deterministic classification of `absent`, `connected`, `credential-only`, and
  `provider-state-only` for one validated opaque account ID,
- reuse of the same result by authorization preflight so consistency rules remain
  one source of truth,
- a narrow `SecretVault.has` contract and SQLite implementation that checks
  protected-record presence without unprotecting or rotating the credential,
- a matching encrypted provider-account presence query that avoids payload
  decryption and provider-identity materialization,
- strict output-shape validation that rejects additional credential-like fields,
- stable invalid-request and storage-verification failures,
- ADR-026 and aligned agent, architecture, Gmail, privacy, database, encrypted-
  cache, handoff, project-map, and portfolio documentation.

Important decisions:

- diagnosis returns only opaque account identity and an allow-listed status,
- do not repair, delete, overwrite, reconnect, or contact Google from inspection,
- keep the capability in the trusted application layer and outside startup,
  preload, IPC, and UI,
- extend the existing coordinator and vault contracts instead of adding a second
  consistency service or decrypting credentials for presence checks,
- add no dependency, schema migration, compatibility path, destructive command,
  production composition, external action, or real secret.

Evidence: 31 test files and 214 tests passed before final checkpoint verification.
Coverage includes all four states, exact result validation, malformed account IDs,
no store mutation, connection-preflight reuse, and real SQLite presence queries
that succeed while credential or provider-state decryption is forced to fail.

Limitations: no recovery command exists. Choosing whether to discard an orphaned
local side and require reconnection remains an explicit owner decision. No real
Gmail account, AI provider, credential, personal mailbox data, browser, network
call, or renderer behavior was used.

## Gate 2D foundation — Confirmed one-sided connection recovery policy

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: define confirmed connection recovery`

Goal: encode the approved conservative recovery policy without exposing a
destructive product command or weakening full-deletion confirmation.

Delivered:

- one exact versioned recovery request bound to confirmation, operation, opaque
  account, discard action, and expected one-sided status,
- one main-process-only recovery service that reuses canonical consistency
  inspection and existing account-scoped deletion capabilities,
- refusal of complete, absent, stale, malformed, and unconfirmed recovery,
- deletion of only the orphaned credential or encrypted provider/sync state,
- post-deletion verification of `absent` and an explicit reconnect requirement,
- stable safe confirmation, deletion, state-change, and incomplete-result errors,
- structural enforcement that recovery stays outside startup, preload, and IPC,
- ADR-027 and aligned architecture, privacy, Gmail, encrypted-cache, handoff,
  project-map, agent-contract, and portfolio documentation.

Important decisions:

- discard orphaned local state instead of inferring or reconstructing missing data,
- bind confirmation to the exact account and diagnosed orphan type so a stale
  receipt cannot authorize a different deletion,
- keep full-deletion confirmation unchanged and defer a dedicated durable producer
  rather than widening its installation-scoped schema prematurely,
- never revoke, reconnect, contact Google, expose recovery to the renderer, or
  present deterministic behavior as live account handling,
- add no dependency, schema migration, compatibility path, startup composition,
  external action, credential, personal data, or mailbox mutation.

Evidence: 32 test files and 221 tests passed before final checkpoint verification.
Coverage includes both discard paths, complete/absent refusal, stale expected
state before and after confirmation, invalid and failing confirmation, deletion
failure, incomplete deletion, exact input validation, single-side mutation, and
reconnect-required output.

Limitations: the confirmation verifier is a required contract, not a production
producer. No durable recovery receipt schema, challenge UI, preload/IPC command,
startup composition, real account, credential, browser, or network call exists.

## Gate 2D foundation — Durable account-recovery confirmation

Date: 2026-08-28
Checkpoint: use the Git commit whose subject is `feat: persist recovery confirmation`

Goal: supply the approved discard-only recovery policy with distinct, durable,
short-lived authorization without exposing it to the running product.

Delivered:

- schema version 8 and a strict SQLite receipt containing only opaque recovery
  identifiers, opaque account scope, expected orphan status, action, timestamps,
  and optional consumption time,
- a bounded in-memory prepare challenge after canonical consistency preflight,
- exact five-minute typed confirmation whose entered text is never persisted,
- atomic one-use consumption bound to account, status, operation, action, and
  validity window before any local deletion,
- semantic idempotent persistence independent of object property order, rebinding
  refusal, replay refusal, deterministic strict-boundary cleanup, safe inspection/
  storage errors, and injected clock/ID sources,
- ADR-028 and aligned database, privacy, handoff, project-map, README, and portfolio
  documentation.

Important decisions:

- keep account recovery confirmation separate from installation-wide full deletion,
- refuse challenge creation unless one exact orphan state is currently diagnosed,
- check consistency before consumption and again before deletion,
- require fresh confirmation after a failed or interrupted deletion instead of
  adding a parallel recovery-operation journal,
- keep the producer, repository, and recovery command outside startup, preload,
  IPC, and UI,
- add no dependency, compatibility path, provider action, credential, personal
  data, or mailbox mutation.

Evidence: 34 test files and 229 tests pass under the declared Node 24.18 runtime.
Coverage includes state preflight and inspection failure, exact binding, typed
text, expiry, order-independent idempotency, rebinding, one-use consumption,
replay refusal after deletion failure, malformed input, cleanup boundaries, and
safe storage failures. Strict typecheck, structural security checks, and all
production Electron builds pass.

Limitations: no recovery startup composition, preload/IPC method, renderer UI,
Google adapter, live account, browser, network call, or credential exists. The
running application cannot invoke this destructive policy.

## Gate 2D milestone — Confirmed local connection recovery interface

Date: 2026-08-31
Checkpoint: use the Git commit whose subject is `feat: activate local connection recovery`

Goal: make the approved one-sided local recovery policy usable without activating
Gmail, exposing secrets, or allowing the renderer to choose destructive behavior.

Delivered:

- one ready-mode command service that maps the existing consistency inspector,
  schema-v8 confirmation producer, discard policy, vault, and encrypted account-
  state repository into bounded safe results,
- separate versioned prepare and execute contracts with runtime validation in
  preload and main,
- main-owned diagnosis of `credential-only` versus `provider-state-only`; the
  renderer supplies only a known opaque Posita account ID,
- same-main-frame and same-window challenge ownership, revoked when the window
  closes and released after one execute attempt,
- an extracted accessible Settings panel covering account selection, checking,
  not-needed, typed confirmation, progress, success, and retry/review states,
- explicit sample labels and repeated copy that Gmail is not connected, contacted,
  deleted, or changed,
- production composition coverage using a deterministic orphaned test credential,
  plus shared-contract, command, IPC, preload, UI, failure-path, and structural tests,
- ADR-029 and aligned agent, README, architecture, database, privacy, Gmail,
  encrypted-cache, handoff, project-map, and portfolio documentation.

Important decisions:

- do not expose consistency as a generic renderer query or allow presentation code
  to select which local store is deleted,
- refuse absent and complete pairs before a challenge is created,
- keep the exact phrase and entered text ephemeral while persisting only bounded
  account/status/operation metadata,
- release window authority after any execution result; a failed or interrupted
  deletion requires fresh review and confirmation,
- reuse the existing consistency rule through one exported application function
  rather than compose the inactive authorization adapter or duplicate state logic,
- add no dependency, schema migration, compatibility path, Google adapter, browser
  action, external request, real account, personal data, or remote mailbox mutation.

Evidence: 36 test files and 245 tests pass, including a file-backed bootstrap path
that creates a deterministic orphaned credential, prepares and confirms recovery,
removes only that credential, and verifies the pair is absent. Strict typecheck,
renderer structure/security checks, and production Electron builds pass. These are
engineering measurements, not external-user outcome metrics. A desktop visual and
accessibility-tree check also verified the Settings entry, local-only warning,
sample labels, account-specific controls, and normal no-recovery-needed result.

Limitations: the running build contains sample accounts and normally reports that
no recovery is needed. Gmail authorization, account connection, revocation, sync,
AI providers, and remote mailbox actions remain unavailable. The interface does
not automatically repair startup state or reconstruct missing connection data.

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
