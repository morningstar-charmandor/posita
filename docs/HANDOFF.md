# Posita Continuity Handoff

Last reviewed: 2026-09-04

This is the first document to read when Posita work continues in a new AI model,
thread, chat, or development session. It records current state and the safest
next move. Technical details remain in their linked source documents.

## Current state

Posita has completed the **Gate 2D credential-free lifecycle foundation, Google
desktop authorization protocol, bounded loopback/browser infrastructure, trusted
connection-activation sequence, and an inert strict local client-credential
configuration source, plus a provider-inert production ownership graph**. Exact identity consent is approved; the
owner has now created an isolated Google Cloud project named `Posita` with project
ID `posita-mail-hub-2026`. Gmail API is enabled, external testing consent is
configured for OpenID identity, verified email, and Gmail read-only, and one
desktop client named `Posita macOS Desktop` exists. Its credential bundle was not
retained or copied into the repository. Its client ID and newly rotated secret are
stored only in the owner-readable local application-data file and pass Posita's strict
version-2 loader. The one-time value was transferred through the system clipboard,
which was immediately cleared; no downloaded credential bundle is retained. The trusted runtime ownership
graph is assembled and starts with zero accounts. A validated Settings/preload/IPC
path now separates local preparation from an explicit cancellable Continue-to-Google
command. Trusted main creates the opaque account ID, performs authorization and
initial activation, and attempts journaled disconnect rollback if activation fails.
A paired five-minute, same-window typed-confirmation disconnect removes Posita's
authorization and local account data without changing Gmail. These commands are
implemented and verified. On 2026-09-04 the owner was added as the project's first
OAuth test user and completed Google's read-only browser consent. Google delivered
the response to Posita's exact loopback listener, proving the browser and local callback
path with a real dedicated account. The first response was safely rejected before token
exchange because Google included allow-listed issuer, scope, account-index, hosted-domain,
and consent metadata beyond the deterministic `code`/`state` fixture. Posita was cancelled
locally; no credential, connected account, provider read, or live mail was stored. A narrow
compatibility fix now validates those bounded fields, rejects unknown, duplicated, or
widened metadata, and continues to derive authority only from the token and identity
endpoints. Fresh owner-approved retries reached Google's token endpoint, which returned
`invalid_request`; a bounded non-reflective classifier then identified the specific
cause as incomplete client-secret configuration. Posita discarded the provider's free-
text description and stored no grant, credential, account, provider mail, or live mail.
The new client-configuration implementation passes 83 test files and 504 tests,
strict typecheck, renderer structure/security checks, localhost callback integration,
and the production build. The next step is a fresh runtime readiness check followed by
an action-time owner decision before starting another Google authorization attempt.
The product is a runnable Electron desktop prototype using React, strict TypeScript,
and SQLite. All visible mail is deterministic sample data.

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
- SQLite schema versions 1–10 with transactional migrations, encrypted seeding,
  and a durable one-way sample/live installation mode,
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
- a reviewed `google-gmail-readonly-identity-v2` consent projection inside the
  existing read-only application state, with an accessible Settings preview for
  exact identity/read scopes, retention, encryption, AI inactivity, disconnect,
  and a prepare-only readiness action that cannot start activation,
- a bounded provider-independent authorization-session contract with exact
  read-only consent/scope, HTTPS launch, loopback callback, expiry, cancellation,
  trusted-main-only grants, and stable safe errors,
- a deterministic credential-free authorization fake proving lifecycle and
  failure behavior without startup, preload, IPC, UI, browser, or network composition,
- a real Google desktop authorization protocol adapter, now constructed only inside
  the provider-inert production graph, proving PKCE,
  state and loopback callback verification, bounded exchange, exact scopes, and
  verified OpenID/Gmail identity agreement through injected boundaries,
- a real provider-inert ephemeral IPv4 loopback listener with exact host/path/state,
  request/lifetime/queue bounds, safe non-reflective browser responses, cancellation,
  and deterministic shutdown,
- a provider-inert system-browser launcher that validates the exact reviewed Google
  authorization URL before an injected Electron delegate; tests never open the OS,
- encrypted provider-account validation aligned to the reviewed string consent
  identity, with obsolete numeric simulated records rejected before persistence,
- a trusted credential-free account-connection coordinator that preflights vault
  and provider state, binds completion to its pending account/session, persists
  vault-before-encrypted-state, and rolls back both on ambiguous state failure,
- an unexposed activation coordinator that registers callback waiting before exact
  browser handoff, bounds non-consuming callback rejection, completes only through
  that connection coordinator, observes pre-exchange cancellation, and makes
  cleanup failure explicit,
- stable duplicate, inconsistent-state, storage, invalid-provider-result, and
  cleanup-recovery failures without exposing the refresh grant,
- a versioned read-only consistency result for absent, connected, credential-only,
  and provider-state-only account pairs, reused by connection preflight,
- a vault presence capability that diagnoses protected credential existence
  without unprotecting, rotating, returning, deleting, or overwriting the value,
- an encrypted provider-account presence capability that avoids decrypting or
  returning provider identity during consistency inspection,
- an approved main-process-only recovery policy that requires an exact account-
  and orphan-status-bound confirmation, refuses complete and absent accounts,
  rechecks stale state, discards only the orphaned local side, verifies `absent`,
  and requires a fresh connection,
- a dedicated five-minute recovery confirmation producer that preflights the
  diagnosed orphan state and persists only opaque account/status-bound receipt
  metadata in schema v8, atomically consumes an exact receipt before deletion,
  and remains distinct from installation-wide deletion confirmation,
- a ready-mode local account-recovery command composed from the canonical
  presence-only inspector, schema-v8 confirmation producer, vault, encrypted
  account-state repository, and existing discard-only recovery policy,
- separate validated prepare/execute preload and IPC methods, with the challenge
  bound to the same trusted main-frame window and released after one attempt,
- an accessible Settings recovery surface covering sample-account selection,
  read-only checking, no-recovery-needed, exact typed confirmation, progress,
  success, safe errors, and fresh-review behavior,
- main-owned orphan diagnosis: the renderer supplies only a known opaque account
  ID and cannot choose credential versus encrypted provider-state deletion,
- a main-owned automatic retention lifecycle with an immediate startup pass,
  bounded 24-hour cadence, one-hour safe retry, and single-flight execution,
- a packaged retention worker that keeps file-backed load, planning, authenticated
  rewrite, checkpointing, and compaction off Electron main and the renderer,
- deletion/shutdown coordination that awaits maintenance and erases the worker
  adapter's trusted in-memory key copy without exposing it over IPC,
- bounded running, last-run, next-run, and attention-required retention status in
  Settings, refreshed in place through one validated fixed notification,
- a Gate 2D lifecycle-readiness audit that verifies the credential-free local
  foundation and records the remaining activation blockers,
- one exact versioned canonical provider-independent source-message/thread model
  with account-scoped provenance, recipient roles, normalized body forms, labels,
  read state, bounded attachment metadata, and strict unknown-field rejection,
- one credential-free sync coordinator constructed inside the zero-account production
  graph, with a 90-day initial request,
  per-account single-flight, bounded cross-account concurrency, normalized-batch
  validation, account-scoped replay deduplication, atomic projection/cursor
  ordering, remote-deletion tombstones, one complete atomic bounded invalid-cursor
  replacement, and explicit cancellation,
- deterministic provider and atomic-projection fakes that prove isolation,
  replay, cursor recovery, typed failures, rollback, supersession, and shutdown
  behavior without credentials, provider access, or persistence,
- an initially empty schema-v9 canonical provider-mail projection with opaque
  account-scoped local row IDs and authenticated encrypted message/thread payloads,
- atomic normalized batch plus encrypted cursor commits with account isolation,
  replay/update classification, cursor-conflict protection, tamper rejection,
  transaction rollback, account-scoped deletion, and keyless full deletion,
- one packaged serial worker adapter for file-backed checkpoint reads and commits,
  with bounded validated messages, safe typed failures, queue limits, key transfer,
  malformed-result rejection, and explicit retained-key destruction,
- account-scoped canonical projection deletion required by the inactive
  disconnect orchestrator's durable mail-data phase, including safe retry after
  fixture removal has already committed,
- one shared fixed-window policy for fixture and canonical mail, with exact
  boundary retention, deterministic provider-message eviction, encrypted thread
  repair/removal, cursor preservation, and account-scoped opaque-row handling,
- canonical retention composed into the existing startup/daily file-backed
  maintenance worker, including resumable sanitization after an interrupted pass,
- credential-free end-to-end sync integration through the deterministic provider,
  application coordinator, and real file-backed encrypted projection worker,
  covering multi-page commits, encrypted-cursor resume, replay, real conflicts,
  cancellation, and retained-key teardown,
- one credential-free provider-mail lifecycle owner that orders live activation,
  bounded startup/account sync, retention exclusion, disconnect quiescence,
  confirmed-deletion suspension, shutdown, and projection-worker key teardown,
- one production-composed read-only startup inventory that compares at most eight
  encrypted provider-account scopes with protected credential scopes, returns
  deterministic sync requests only for complete pairs, and reports any one-sided
  state as recovery-required without unprotecting credentials or starting sync,
- one production-composed trusted-main sync-status service that records syncing,
  validated success checkpoints, cancellation, and typed failures in the existing
  encrypted account state, plus one fixed descriptive retry policy,
- lifecycle fail-closed behavior that refuses provider work when the initial
  durable status write is unavailable, without scheduling an automatic retry,
- a real Google OAuth revoker in the provider-inert graph that reads only the selected protected
  token, uses the fixed HTTPS form-body endpoint, bounds time and response bytes,
  and treats only absent/HTTP-200/documented-invalid-token cases as success,
- a real read-only Gmail adapter in that graph with injected short-lived token and
  HTTP boundaries, fixed GET routes, 90-day full sync, resumable history cursors,
  four-at-a-time message reads, bounded responses, and stable safe failures,
- a real provider-inert trusted-main access-token source that reads only one
  account-scoped protected refresh credential, uses Google's fixed bounded token
  exchange, caches bearer access only in memory with an expiry margin, coalesces
  per-account refresh, supports cancellation/invalidation/teardown, and refuses
  returned scope widening,
- canonical Gmail normalization with deterministic account-scoped IDs, recipients,
  labels, read state, safe attachment metadata, plain/HTML-only/external MIME text,
  no retained provider HTML, and no binary attachment-body download,
- a strict provider/commit batch v2 that atomically applies bounded remote-deletion
  tombstones, repairs affected threads, and advances the encrypted cursor,
- bounded stale-cursor recovery that collects every provider page before one
  authoritative 90-day replacement, leaving storage untouched if collection fails,
- a final production-composition audit proving that startup inventory, encrypted
  status, one sync coordinator, one projection worker, retention, deletion,
  disconnect, and shutdown have a coherent activation path without a second owner,
- one production `composeGoogleProviderLifecycle` graph that constructs the approved
  Google authorization, token, read, sync, disconnect, retention, and teardown owners;
  startup passes an explicit empty account list, so construction cannot contact Google,
- bounded startup outcomes for connected/live, interrupted sample activation,
  disconnected live-empty, and offline retry-required states without reseeding,
- a mode-aware application-state query that preserves the exact fixture snapshot
  in sample mode and selects a separate canonical live snapshot immediately after
  the durable schema-v10 transition,
- a production-composed read-only projection-worker operation capped at 50 newest
  summaries and 32 account scopes, with canonical source locators and
  account provenance but no bodies, recipients, remote provider IDs, provider
  subjects, cursors, paths, keys, or raw errors,
- provider-account record v2 with a provider-verified encrypted mailbox address,
  optional bounded user display label, hidden provider subject, exact validation,
  and fail-closed rejection of legacy simulated v1 payloads,
- live snapshot v2 provenance that exposes only an available address/label or an
  unavailable safe state, while status UI no longer renders opaque account scope
  as human identity,
- an exact canonical source-detail v1 contract and existing-worker operation keyed
  by opaque Posita account/message IDs, with found/missing state, request/result
  rebinding, visible account identity, recipients, safe attachment metadata, and
  a 128 KiB plain-text cap with explicit truncation,
- source-detail exclusion of provider account/message/thread/attachment IDs,
  content IDs, provider HTML, labels, paths, keys, and raw worker failures,
- one fixed trusted-main-frame source-detail IPC/preload capability and renderer
  data source with request/output validation at every process boundary, composed
  only when the durable installation mode is live,
- explicit encrypted-local source selection with loading, exact missing, safe
  error, retry, unmount/supersession suppression, recipients, safe attachment
  metadata, bounded plain text, and explicit external-action separation,
- one live-mode-only open-original command that resolves encrypted provider
  provenance in the worker, constructs and exactly validates a Gmail HTTPS target
  in main, requires two-step user confirmation, and returns no URL/provider ID,
- truthful live-empty, recorded-syncing, offline, attention-required, and cached-
  data renderer states with local-status reload, bounded canonical recent-mail
  presentation, and local source inspection,
- read-worker key inclusion in confirmed full deletion and graceful normal shutdown
  that settles accepted reads before key erasure,
- an explicit fixture compatibility decision: existing encrypted sample messages
  remain a presentation view and never receive fabricated provider provenance,
- truthful sample-mode labels that do not describe fixture accounts, briefs, or
  deterministic drafts as live Gmail or production AI,
- deterministic credential-free verification through `npm run verify`.

Simulated or deliberately inactive:

- all accounts, people, topics, messages, summaries, and drafts are fixtures,
- generated-looking summaries and drafts are not produced by an AI provider,
- the desktop client ID and rotated secret are privately configured locally; no user
  authorization grant or refresh credential is configured or stored,
- the isolated `posita-mail-hub-2026` Google Cloud project has Gmail API, external
  testing consent, and the `Posita macOS Desktop` client configured,
- encrypted provider-account and sync-state tables contain no real account,
- Google authorization revocation has a real fixed-endpoint adapter, exercised only
  through injected deterministic HTTP and unreachable without a public command,
- Google access-token refresh has a real fixed-endpoint adapter, exercised only
  through an injected fake token and deterministic HTTP; production constructs it
  with the private client credential pair but supplies no account,
- Google desktop authorization has a real PKCE/state/code/identity protocol adapter,
  exercised only through injected loopback and deterministic HTTP boundaries and
  constructed in production without a caller,
- loopback reception and the system-browser handoff have real bounded adapters,
  exercised only through local deterministic HTTP and a fake desktop delegate,
- local deletion operates only on deterministic fixture-backed Posita data because
  no real account or credential exists,
- account disconnect has exact preload/IPC/UI triggers guarded by a short-lived,
  same-window typed confirmation and an opaque durable confirmation-intent record,
- Gmail connection consent separates non-activating preparation from an explicit
  cancellable Continue-to-Google action; owner-approved live attempts reached the
  loopback callback and token endpoint but did not produce a grant or account,
- authorization-session behavior has both a deterministic fake and a production-
  constructed Google protocol adapter; it is reachable only through the explicit
  trusted-window command and never exposes protocol values to the renderer,
- account-connection persistence is deterministic-tested and reachable only through
  the explicit trusted-window command,
- canonical provider-mail and sync behavior is exercised only through
  deterministic fakes, an encrypted SQLite proof, and file-backed workers;
  retention and the bounded read-only live-state query are composed at startup,
  while source-detail is composed for bounded encrypted-local inspection and the
  provider write path is reachable only inside the inactive zero-account graph,
- the schema-v10 sample-to-live service is trusted-main-only and unexposed; it
  has been verified with deterministic connected state but has no production
  connection, sync-start, preload, IPC, or UI caller,
- the provider-mail lifecycle owner is production-composed and starts with zero
  accounts; trusted inventory remains read-only and is not handed to automatic sync,
- account consistency is not independently exposed; the recovery command uses it
  inside main without mutation or provider action,
- local account recovery is active only for inconsistent local records and has no
  real account to recover; normal sample accounts report that recovery is not needed,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- completed real-account authorization and evidence from a private-client-secret retry,
- live provider-ingestion evidence,
- automatic provider sync retry or pending-disconnect startup scheduling,
- any remote mailbox mutation control,
- automatic pending-disconnect resume with a live idempotent revocation adapter,
- a model provider, embeddings, classification, retrieval, or generation,
- automatic pending-disconnect lifecycle scheduling,
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

The owner-approved live exercise verified the browser, exact loopback callback, and
token-endpoint handoff without storing a user credential or account. Callback compatibility
is closed with bounded allow-listed metadata. After the token endpoint identified the
configured client's secret requirement, the owner approved a one-time secret rotation and
private placement. Posita now loads an exact version-2 client ID/secret pair only from its
owner-readable application-data file and submits the secret only in trusted-main token
requests. Legacy version 1 fails closed. All 83 test files and 504 tests pass with the full
verification gate. Start the updated app and confirm local readiness; stop for a separate
action-time owner decision immediately before a fresh Google authorization attempt because
success may store a protected refresh credential, activate live mode, and begin read-only sync.

Encrypted account state, ownership, the crash-resume journal, deterministic
retention, account removal, disconnect, full local deletion, explicit confirmation,
safe status, full-deletion startup recovery, read-only lifecycle UI, and explicitly
confirmed local deletion are complete at their current layers. Continue in this order:

1. Keep pending disconnect visible but inactive until a reviewed command/resume path
   can invoke the composed idempotent Google revoker.
2. Treat the local recovery UI as complete at its current boundary. Do not add
   automatic startup repair; failed execution must continue to require fresh review.
3. Treat automatic retention scheduling and its Settings status as complete at
   the current fixed 90-day boundary. Do not add configurable retention yet.
4. Treat canonical fixed-window retention, journaled account removal, worker
   integration, schema-v10 mode, provider-mail lifecycle ordering, and the status-
   only live application read model as complete at their credential-free layers.
   Encrypted user-readable account identity is complete at its credential-free
   storage and status boundary. The bounded canonical source-detail query is also
   complete at its contract, encrypted projection, and native-worker boundary.
   Its bounded summary list, loading, missing/stale, safe-error, and retry UI and
   confirmed main-derived browser handoff are now composed. The bounded trusted
   startup account inventory, durable lifecycle status, safe explicit sync-retry
   policy, and final production-composition audit are complete.
5. Treat the approved Google authorization, loopback/browser infrastructure,
   reader, revoker, access-token source, strict local client-credential source, and
   zero-account production lifecycle graph as complete. The paired connection and
   disconnect UI/IPC boundary is also verified. Stop for the person's direct account
   choice and Google consent before treating any browser result as authorization.
6. Keep real Gmail ingestion inactive until the person completes the exact approved
   consent with a dedicated test account and Posita verifies the resulting local state.

Do not solve encrypted search casually. Any index must avoid becoming a second
plaintext mailbox. Record the selected search tradeoff in `docs/DECISIONS.md`.

Milestone change report: canonical provider mail contracts, sync ownership,
encrypted atomic persistence, fixed-window retention, disconnect deletion, and
coordinator-to-worker operation and one lifecycle owner are credential-free
verified, not activated for ingestion. The owner excludes retention during sync,
settles provider work before disconnect/deletion, and tears down worker keys.
Schema v10 now durably separates sample and live installations: a
complete local connection is required, sample deletion and mode activation are
atomic, cleanup is retryable, and disconnect/restart never reseeds samples.
Schema v9 remains the
single canonical projection and the existing sync-state repository remains the
cursor source of truth. The automatic retention worker now performs bounded
canonical decrypt/plan/delete/thread-rewrite/sanitization work without a plaintext
index. Production composition now includes only the mode-aware worker read, the
existing application-state IPC path, and a bounded summary/local-inspection live
renderer. Those presentation steps added no dependency, provider adapter, sync
start, external action, secret, personal mailbox data, or mutation. One intentional
compatibility distinction remains:
the legacy `Message` is a deterministic sample-presentation record, while only
`ProviderMailMessageV1` may enter future provider ingestion. There is no conversion
path because Posita will not invent provider provenance. The live renderer now
shows only the existing bounded summary projection with human account provenance
and exact source selection. That renderer step added no dependency, schema,
provider adapter, credential, network request, external action, secret, personal
mailbox data, or mutation. Provider-
account record v2 and live snapshot v2 now project the verified encrypted mailbox
address plus optional label while keeping the provider subject hidden; label
editing remains unexposed. The canonical source-detail query now returns bounded
plain text and safe metadata through the existing worker and a fixed validated
trusted-main-frame preload/IPC/UI path without provider IDs or HTML. Open-original
now resolves provider identity only inside the trusted worker/main boundary and
requires explicit browser confirmation. The trusted startup inventory and encrypted
sync-status service are composed read-only/inert. The lifecycle owner, approved Google
adapters, one projection worker, coordinator, retention gate, disconnect service, and
shutdown path are now assembled by one production factory. Startup passes zero accounts,
so status writes, provider access, mode activation, and sync do not run. Provider batch
v2 closes the remote-deletion and stale-
cursor replacement gap, and the real bounded Gmail reader now emits that contract.
The vault-backed memory-only access-token source now supplies the reader's trusted
credential boundary without configuration or activation. The exact identity consent,
bounded desktop authorization-code/PKCE protocol core, short-lived loopback/exact-
browser boundaries, trusted connection-activation sequence, and paired confirmed
disconnect command are now implemented and fully verified with injected seams. The
next milestone is a person-completed dedicated-account authorization exercise, not
an automatic credential or account connection.
The new presentation abstraction is `LiveMailSummaryList`; it consumes the existing
`LiveMailSnapshotV2` without adding a parallel domain or data source. The other
recent abstractions are the shared `LiveMailMessageDetailV1` and open-original
command contracts, the trusted `ProviderMailSourceDetailSource` and
`ProviderMailOriginalSourceLocatorSource`, `OpenProviderMailOriginalService`, and
the narrow `GmailExternalUrlOpener`; the existing projection and worker remain the
single storage/read owner. No dependency, schema migration, compatibility path,
or intentional duplicate repository/service was added. The existing encrypted
projection-worker path is retained, and the undocumented Gmail web route remains
an explicit revalidation risk before live activation. `tsconfig.web.json`
now permits explicit TypeScript import extensions, matching the existing Node
configuration so one shared runtime validator works in both the bundled renderer
graph and directly executed worker graph.
The new activation-preflight abstraction is `ProviderMailStartupInventoryService`;
the existing encrypted account repository and protected vault each add one narrow
scope-list operation, and bootstrap retains the exact result without starting the
existing lifecycle owner. No dependency, schema, compatibility path, duplicate
repository/service, credential decryption, public contract, provider action, or
intentional duplication was added.
The new status abstraction is `ProviderMailSyncStatusService`; it reuses the existing
encrypted account-state repository and current live-status read model. The lifecycle
owner depends on its narrow contract. No dependency, schema, compatibility path,
duplicate state store, IPC/UI command, provider action, or intentional duplication
was added.
The final audit added no abstraction or compatibility path. The subsequent approved
composition replaces standalone retention/read shutdown ownership when strict local
configuration is available and retains it only as the fail-closed fallback.
The new infrastructure abstraction is `GoogleOAuthRevoker`; it implements the
existing `AccountAuthorizationRevoker` contract with injected fetch and reuses the
existing `SecretVault`. No dependency, schema, compatibility path, duplicate
service, IPC/UI command, credential, account, network test,
personal data, or intentional duplication was added.
The matching infrastructure abstractions are `GoogleMailReadAdapter`, its narrow
`GoogleAccessTokenSource`, and `googleMailNormalizer`; they implement the existing
provider contract and canonical model rather than adding another sync owner or mail
shape. No dependency, schema, compatibility path, OAuth
configuration, credential, account, real network test, personal data, mailbox
mutation, or intentional duplication was added.
The concrete `GoogleOAuthAccessTokenSource` implements that existing narrow token
contract over `SecretVault`. It adds no token repository: access tokens remain only
in its bounded memory cache, while refresh credentials remain exclusively in the
vault. No dependency, schema, compatibility path, credential, browser action,
account, network test, personal data, mailbox
mutation, or intentional duplication was added.
The new `GoogleDesktopAccountAuthorizationAdapter` implements the existing
provider-independent session contract with injected loopback and HTTP boundaries.
It adds no parallel connection coordinator or token store. The original 527-line module
was reviewed as one cohesive bounded protocol boundary containing its validators and
exchange steps; no dependency, schema, compatibility path, browser action,
credential, account, live request,
personal data, mailbox mutation, or intentional duplication was added.
The live callback milestone extends that adapter without a second protocol owner.
`googleOAuthTokenExchangeFailure` is the one extracted helper for fixed, non-reflective
token-error classification; it was split after the adapter crossed the complexity-
review threshold and keeps the adapter at 585 lines. No dependency, schema, compatibility
path, persisted diagnostic, secret, personal data, mailbox mutation, or intentional
duplication was added.
The `GoogleOAuthLoopbackRedirectServer` and `GoogleOAuthSystemBrowserLauncher`
are narrow infrastructure boundaries around Node HTTP and Electron external-open.
The shared `googleOAuthProtocol` policy is the single source of truth for exact
authorization endpoint, loopback, client, state, PKCE, and scope validation. No
dependency, schema, compatibility path, listener at startup, real browser action,
credential, account, provider
request, personal data, mailbox mutation, or intentional duplication was added.
The existing `loadGoogleOAuthClientConfiguration` infrastructure source remains the only
client-credential configuration path. Its exact version-2 owner-readable file contains
the desktop client ID and secret, refuses symlinks, unknown fields, legacy version 1,
and fallback searches, and returns only to trusted startup composition, never public contracts.
The same pair feeds only the authorization-code and refresh-token requests in trusted main.
No dependency, schema migration, compatibility path, duplicate service, user credential,
account, provider request, personal data, mailbox mutation, or intentional duplication was added.
Private placement uses that existing loader and leaves all provider actions inactive.
`composeGoogleProviderLifecycle` is the single new
ownership factory. It reuses the existing adapters, services, repository contracts,
and worker; adds no parallel compatibility path; and deliberately starts the owner
with zero accounts. The worker's asynchronous shutdown is awaited so accepted local
reads settle before key destruction.
The `AccountConnectionActivationService` composes the existing connection,
callback, and browser interfaces without adding a second persistence coordinator.
It is reachable only through the fixed trusted-window connection command. The new
public command adds no dependency, schema, compatibility path, credential, account,
real browser/provider action, personal data, mailbox mutation, or intentional duplication.
The new `composeGoogleProviderLifecycle` module is the single production ownership
root for the existing authorization, token, reader, sync, projection, disconnect,
retention, and teardown abstractions. It adds no second repository, coordinator,
worker, scheduler, compatibility path, dependency, schema, credential, network
request, or intentional duplication. The retained standalone retention and
read-worker shutdown path is used only when strict client configuration is unavailable.
The new `GoogleAccountConnectionPreflightService` is a read-only capability over
that existing composition availability. Its fixed public result carries reviewed
consent metadata and safe notices only; it cannot expose an account ID, authorization
URL, callback, or credential, and it cannot call the activation coordinator. The
preload client, renderer data source, and Settings panel reuse the same versioned
contract. No dependency, schema, repository, compatibility path, authorization
session, browser action, account, credential, provider request, or mailbox mutation
was added.

The new `GoogleAccountConnectionCommandService` reuses the single activation and
lifecycle owners, generates account scope in trusted main, and attempts journaled
disconnect rollback before exposing an activation failure. The paired
`GoogleAccountDisconnectCommandService` reuses the existing consistency inspector,
lifecycle owner, and `audit_events` table with exact same-window typed confirmation.
No dependency, schema migration, compatibility path, duplicate repository/service,
credential, personal data, provider request, or mailbox mutation was added.

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
- Current verified baseline: 83 test files, 504 tests, strict typecheck, structure
  checks, and production Electron build passing.
- Desktop visual/AX check: Settings exposes the local-only recovery controls and
  an `Automatic retention status` region with next/last check, zero-removal result,
  encrypted-local-only scope, and explicit Gmail non-mutation copy. Sample labels
  and account-specific accessible controls remain intact.

Native verification migrated the development database to schema v3 with 21
encrypted records, zero legacy account rows, a `ready` cache state, an
OS-protected installation key, and no known fixture plaintext found in the
database, WAL, or shared-memory sidecar scan.

Use `git log --oneline` for newer checkpoints; Git remains the authoritative
record of exact file-level changes.
