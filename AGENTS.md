# Posita Agent Contract

This file is the operating contract for every human or AI agent changing this
repository. It applies to the entire project unless a more specific `AGENTS.md`
exists deeper in the tree.

## Product state

- Current milestone: Gate 2D Google activation adapters in progress; the read-only
  Gmail adapter remains next and all production composition remains inactive.
- Current data: deterministic fixtures stored as authenticated encrypted records.
- Encrypted provider-account and sync-state storage is implemented but empty.
- A non-sensitive lifecycle journal and confirmed full local-deletion execution are implemented.
- Deterministic 90-day retention and exact legacy-fixture compatibility are implemented;
  encrypted file-backed maintenance runs at startup and on a bounded 24-hour cadence.
- The same worker-owned maintenance pass evicts expired canonical provider messages,
  repairs or removes affected provider threads, and resumes pending SQLite sanitization.
- Safe retention running, last-run, next-run, and retry status is visible in Settings.
- File-backed SQLite sanitization runs in a single-flight worker thread; the
  synchronous adapter remains only for bounded in-memory tests and legacy migration.
- Fixture and canonical provider-mail account removal are implemented in the
  inactive disconnect orchestrator's journaled mail-data phase.
- Disconnect orchestration has a real, uncomposed Google revoker plus deterministic
  fakes, but no production composition or UI trigger.
- Full local-data deletion is composed at startup and available through a narrow
  confirmed Settings & privacy flow; it affects Posita data only.
- New full deletion requires a bounded typed confirmation; safe lifecycle status,
  recovery, preload, IPC, and UI surfaces are implemented.
- Expired confirmation receipts are cleaned at startup unless their deletion
  operation remains pending.
- Startup keylessly resumes a pending full deletion and honors its completed
  marker without recreating a data key or reseeding fixtures.
- An OS-protected credential vault is implemented but contains no real token.
- A versioned read-only Gmail consent preview is visible in Settings; OAuth
  activation remains unavailable and no Google client or credential is configured.
- Provider-independent authorization-session contracts and a deterministic fake
  are implemented but are not composed into startup, preload, IPC, or UI.
- A credential-free account-connection coordinator proves authorization-to-vault-
  to-encrypted-state ordering and rollback, but it has no production composition.
- A production-composed trusted-main sync-status service durably records syncing,
  success, cancellation, and typed failure state with one fixed safe retry policy;
  the inactive lifecycle owner uses its contract and fails closed before provider
  work when status persistence is unavailable.
- Read-only account-connection consistency inspection distinguishes absent,
  connected, credential-only, and provider-state-only states without automatic repair.
- A confirmed discard-only policy and one-use durable confirmation producer for
  one-sided local connection state are composed through a narrow, same-window
  Settings recovery flow. It is local-only and refuses complete or absent state.
- A versioned canonical provider-independent source-message/thread contract and
  one credential-free sync coordinator are verified.
- Schema v10 adds a durable one-way sample/live mode marker; activating live mode
  requires a complete connected-account pair, atomically removes sample records,
  and never reverts or reseeds samples after account removal.
- Schema v9 and an uncomposed credential-free SQLite projection persist canonical
  provider messages/threads with their encrypted account cursor atomically.
- A bounded serial worker-thread adapter owns file-backed canonical projection
  reads/commits and key cleanup. Its bounded read-only live-state operation is
  composed at product startup; commit and production sync remain uncomposed.
- The application-state query selects exact sample or live snapshot contracts
  from durable mode. Live output is capped at 50 summaries and 32 account scopes.
- Versioned encrypted provider-account state now separates the hidden provider
  subject from a verified mailbox address and optional user-defined display label;
  the status renderer shows this human identity without exposing the opaque scope.
- The renderer exposes bounded encrypted-local summary presentation, source
  inspection, and a two-step confirmed Gmail browser handoff. Every summary keeps
  visible account provenance and selects its exact local source.
- A versioned canonical source-detail contract and worker-backed query are
  composed through one fixed validated preload/IPC/UI path with exact found/missing
  state, a 128 KiB plain-text limit, recipients, safe attachment metadata, loading,
  safe error/retry, stale-result suppression, and no provider IDs or HTML.
- A live-mode-only open-original command derives encrypted provider provenance in
  the worker, constructs and validates one Gmail HTTPS target in main, requires
  explicit UI confirmation, returns no URL/provider ID, and performs no mailbox mutation.
- Credential-free integration verifies the sync coordinator against that real
  file-backed worker with deterministic provider data; product startup remains uncomposed.
- Provider-mail payloads and source identities are authenticated ciphertext;
  only opaque local storage IDs, opaque account scope, and record kind are queryable.
- The deterministic fixture `Message` remains a sample-presentation compatibility
  record and is never accepted as provider-ingestion data.
- One credential-free provider-mail lifecycle owner now defines startup activation,
  concurrent account sync, retention exclusion, disconnect quiescence, deletion
  suspension, shutdown, and sync-worker key teardown, but remains uncomposed.
- A production-composed read-only startup inventory compares bounded encrypted
  provider-account scopes with protected refresh-credential scopes without
  decrypting credentials. It returns sync requests only for complete pairs and
  reports one-sided state as recovery-required; it does not start sync.
- Gmail, production provider-mail projection composition, pending-disconnect
  scheduling, and model providers are not connected.
- Sending mail is intentionally disabled.
- The final production-composition audit is complete. No smaller credential-free
  implementation milestone remains before the real read-only Google adapter and
  idempotent revoker decision gate.
- The owner approved adapter implementation only. A bounded idempotent Google OAuth
  revoker is implemented without a dependency and remains uncomposed; credentials,
  account connection, ingestion, and live network use remain unapproved.
- Product promise: **Your inboxes, understood as one.**

Do not imply that fixture-backed behavior is connected to real mail or AI.

## Read first

Read these sources in order before a material change:

1. `project.agent.json` — machine-readable repository map and invariants.
2. `docs/HANDOFF.md` — current state, blockers, and next recommended milestone.
3. `README.md` — current status and commands.
4. `docs/MVP.md` — release gates and scope.
5. `docs/ARCHITECTURE.md` — process and layer boundaries.
6. `docs/DECISIONS.md` — accepted decisions and their consequences.
7. `docs/PRIVACY.md` — retention, encryption, consent, and deletion boundaries.
8. `docs/GMAIL.md` — authorization and least-privilege scope contract.
9. `docs/GATE_2D_READINESS.md` — activation blockers and next credential-free milestone.
10. `docs/ENCRYPTED_CACHE.md` — cache threat model, envelopes, migration, and limits.
11. `product-spec.md` — long-term vision, not the current implementation scope.

When these disagree, the narrower current-milestone document wins. Record a new
decision before intentionally changing an accepted architectural boundary.

## Repository map

- `src/shared/`: pure cross-process domain types. No React or Electron imports.
- `src/renderer/`: untrusted presentation process. No Node, Electron, secrets,
  provider SDKs, filesystem access, or direct database access.
- `src/main/`: trusted desktop host and future application/infrastructure layer.
- `src/preload/`: minimal allow-listed bridge; never expose generic IPC methods.
- `scripts/`: deterministic local project checks; no network dependency.
- `docs/`: scope, architecture, decisions, and engineering policy.
- `out/`: generated build output; never edit or review as source.

## Required workflow

1. Inspect the relevant code, tests, docs, and current Git state.
2. State assumptions when the request leaves material product behavior open.
3. Make the smallest coherent change at the correct architectural layer.
4. Add or update tests for behavior, contracts, migrations, and failure paths.
5. Update docs and `project.agent.json` when commands, entry points, milestones,
   data ownership, or invariants change.
6. Maintain project continuity in the same change:
   - update `docs/HANDOFF.md` after any material change to current state or next step,
   - append `docs/PROJECT_HISTORY.md` for milestones and meaningful decisions,
   - update `docs/CASE_STUDY.md` when portfolio narrative, evidence, or assets change.
7. Run `npm run verify` before handing off. Report any check that could not run.

Preserve unrelated user changes. Never replace a working implementation merely
to match a preferred style.

## Branch policy

- `main` contains stable, fully verified project checkpoints.
- `staging` is the persistent integration branch for future development.
- Begin normal project work from the latest `staging`. Use a short-lived
  `codex/<purpose>` branch when work is risky, parallel, or needs isolated review.
- Merge completed feature work into `staging` first. Promote `staging` to `main`
  only after `npm run verify`, documentation continuity updates, and a clean diff.
- Keep `main` and `staging` on the public origin. Never force-push either shared
  branch or rewrite their published history.

## Engineering rules

- TypeScript is strict. Avoid `any`; validate unknown data at boundaries.
- Domain rules are pure and deterministic. Inject clocks, IDs, providers, and
  storage rather than reading global state inside domain code.
- Prefer small named modules with explicit inputs and outputs over implicit
  singletons or cross-layer imports.
- Search for equivalent behavior before adding code. Extend one coherent source
  of truth instead of creating a parallel service, helper, manager, repository,
  state store, or compatibility path without a documented migration need.
- Treat line count as a complexity signal, never a quality target. Review a
  normal source file above roughly 600 lines, or a 300–500-line change for a
  small feature, for mixed responsibilities or duplication. These are review
  triggers, not limits for migrations, schemas, tests, or necessary adapters.
- Keep one source of truth for each concept. Do not duplicate domain types in UI,
  IPC, database, and provider code.
- External payloads and model output require versioned schemas and runtime
  validation before entering the domain.
- Commands that mutate state must be narrow, idempotent where possible, and
  return structured results with stable error codes.
- Queries and generated claims must retain provenance to source message IDs.
- Use migrations for persistent schema changes; never mutate user data silently.
- Feature flags must default to the safer behavior.
- Expensive database, sync, parsing, indexing, and AI work must not block the
  renderer or Electron main event loop. Give background work one lifecycle owner,
  bounded concurrency, cancellation, and cleanup on supersession or shutdown.
- Add no dependency until existing code and platform APIs have been evaluated.
  Record its purpose, security/permission impact, maintenance risk, and removal
  cost; keep production versions exact.
- Logs use opaque identifiers and never include message bodies, subjects,
  addresses, drafts, access tokens, refresh tokens, or model prompts.

## Frontend rules

- Components render structured application results; they do not call Gmail,
  model providers, databases, or privileged Electron APIs.
- Preserve the accepted Electron stack while making Posita behave like a
  first-class macOS desktop app: keyboard operation, native window conventions,
  contextual menus/dialogs where useful, responsive resizing, and reduced-motion
  support. OS integration remains in trusted main-process adapters.
- Use semantic HTML and accessible names so both people and automation can
  operate the interface. Prefer roles and labels over test-only selectors.
- Every asynchronous surface needs loading, empty, error, offline, and retry
  behavior before it is considered complete.
- Always show account provenance for mail and a path to the original source.
- Generated content must be labeled, editable, and distinguishable from source
  content. Destructive or external actions require explicit user confirmation.
- Split a module when it owns more than one independent feature or becomes hard
  to understand in one reading. Organize by product feature, not file type alone.

## Backend and agent-tool rules

- Provider adapters normalize external data before application use cases see it.
- One canonical provider-independent mail model owns messages, threads,
  recipients, timestamps, labels, attachments, and provenance. Every provider
  record, cursor, credential lookup, and future mutation is scoped to exactly one
  Posita account; cross-account topics never erase source-account identity.
- One trusted sync coordinator owns all provider I/O. Screens and AI features
  consume application state and may request a sync command, but never fetch a
  mailbox independently or start their own polling loop.
- Providers remain authoritative for remote mail; the encrypted local cache is a
  resumable projection with explicit reconciliation rules. Deduplication and
  provider threading are centralized and idempotent, never reimplemented by UI
  or AI features.
- OAuth tokens stay in the OS keychain/main process; never return them over IPC.
- Tool names are verb-first and stable, with one capability per tool.
- Tool inputs and outputs are bounded JSON-compatible objects with documented
  schemas, explicit versions, and actionable typed errors.
- Retrieval and AI generation are separate steps. Model output is a proposal,
  never an authority or a direct mailbox command.
- No autonomous send, delete, archive, label, or account change. A user-approved
  command and auditable confirmation record are required.
- Provide deterministic fake adapters for every external service so agents and CI
  can test without credentials, personal mail, network access, or billable calls.

## Definition of done

A change is done only when:

- its observable behavior and failure modes are covered by tests,
- `npm run verify` passes,
- the renderer security boundary still passes `npm run check:structure`,
- documentation describes any new command, boundary, schema, or decision,
- continuity and case-study records distinguish implemented, simulated, measured,
  and deferred work without relying on conversation history,
- no secret, personal mailbox data, generated output, or cache is committed, and
- the handoff clearly distinguishes implemented, simulated, and deferred work.
- the handoff reports new dependencies and abstractions, removed or retained
  compatibility paths, and any intentional duplication.
