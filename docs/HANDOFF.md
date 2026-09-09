# Posita Continuity Handoff

Last reviewed: 2026-09-09

This is the first document to read when Posita work continues in a new AI model,
thread, chat, or development session. It records current state and the safest
next move. Technical details remain in their linked source documents.

## Current state

**Latest owner-reported state and approval (2026-09-09):** owner reported the exact
quota-waiting copy after local setup, then the exact cooldown-ended copy after waiting.
These are owner-observed UI results, not an independently inspected database or proof
that Google's quota reset. The owner then approved exactly one controlled read-only
resume through **Resume Gmail sync → Read Gmail once**. No automatic repeat, mailbox
mutation, reconnect or reviewed-receipt reset is authorized.

The existing Electron process remains present but exposes no accessible window to the
agent. The agent has not clicked either resume control or dispatched a provider request.
**Next:** ask the owner to perform that one confirmed action in Posita and report its
result. Before any subsequent agent action, establish whether the owner has already
started it; never duplicate an uncertain attempt. Once dispatched, this approval is
spent even if the result is failure or unknown. Do not request a second attempt without
new approval. Startup and diagnostics remain on verified production source `ea49db8`.
This documentation-only checkpoint retains 95 files / 668 tests and changes no code,
dependency, architecture, schema or credentials. Earlier next-step statements below
are superseded by this pending one-read approval.

**Latest runtime check (2026-09-09):** owner approved loading `ea49db8` and starting
only the local cooldown. Process inspection found no running Posita, so nothing was
stopped. `npm run preview` rebuilt the unchanged verified source and launched the app
(terminal session `39281`). A Posita window was initially detected, then accessibility
reported no window; the OS lock-state flag confirmed the Mac is locked. No cooldown,
resume, reload, reviewed-menu or account control was invoked. No Gmail request or
refresh-token read ran. Normal startup uses private client configuration/cache inside
trusted main; no private values or mail content were emitted in inspection output.

**Immediate next step:** ask the owner to unlock the Mac, then inspect only safe status
labels in the already-running app. Invoke **Start Gmail cooldown** only if present and
verify the local waiting state. Do not restart again unnecessarily or substitute Resume.
If the state is different, report it before another action. This runtime/setup approval
does not authorize a Gmail read. Cooldown setup/presentation and live resume remain
unverified. Documentation-only follow-up; source and tests remain `ea49db8`, with full
verification passing 95 files / 668 tests. No new dependencies, abstractions or migrations.

**Latest offline milestone (2026-09-09):** owner approved ADR-066's bounded local quota
cooldown and explicit manual resume. Implemented using the existing sync command,
encrypted account state, clock, projection worker and lifecycle owner. New quota failures
persist a 15-minute pause, repeated failures extend it to 30 minutes then a one-hour cap.
This is a conservative local waiting rule, not Google's reset time. Full sync success
clears its history; partial page commits, cancellation and interrupted-state recovery
preserve it. A fresh pause is durably reserved before each permitted manual dispatch.

Legacy quota state remains unchanged on read. Its first explicit **Start Gmail cooldown**
action only saves the waiting period; no provider work. **Reload local status** reevaluates
readiness without Gmail access. After expiry, **Resume Gmail sync** requires a separate
confirmation with Cancel focused. Versioned quota intent distinguishes setup from resume
inside the existing request; trusted main rejects missing/stale intent, early calls,
overlap, invalid state/time and storage failure. No automatic retry was introduced.
Authentication/review restrictions and the consumed ADR-065 receipt remain unchanged.

Verification: 95 test files / 668 tests, strict types, renderer security/structure and
production build pass. Tests use only synthetic data: actual temporary database reopen,
ciphertext/non-migration checks, retained partial projection, exact expiry, capped backoff,
stale intent, failure paths, Strict Mode confirmation, and encrypted state through the
real lifecycle/IPC/preload chain with a fake reader. No credentials, private runtime data,
Gmail requests or app restarts were used. Runtime display and live quota resume remain
unverified; the last real observation is still partial retained mail plus quota failure.

**Exact next step:** with owner approval, load this verified build provider-inertly and
use only **Start Gmail cooldown**, then verify the local waiting presentation. Do not
assume the existing running app contains these changes. After the wait and local reload,
request separate explicit approval for exactly one confirmed read-only resume. That
attempt would test continuation from the encrypted cursor and exercise fixed HTTP
status/reason diagnostics if rejected. No new live read is authorized by this offline
approval. Never reset the consumed reviewed receipt, reconnect or infer a quota reset.

Change report: no dependency, new service, scheduler or SQL migration. Strict sync-state
V1 remains for ordinary/legacy records; V2 adds encrypted cooldown metadata on explicit
setup/new quota failure. Live-read V4 replaces V3 (no fallback); only fixed availability
categories cross IPC. The existing retry request retains ordinary behavior and adds an
exact optional versioned quota intent; no new channel or credential capability.

### Prior local diagnosis (superseded next-step instructions)

**Verified local diagnosis (2026-09-09):** encrypted saved sync state returned only
`QUOTA_EXHAUSTED` and its fixed disposition `retry-later`. The inspection used a temporary
trusted Electron main process, read-only SQLite plus `query_only`, the existing OS cache-key
protector, and the existing authenticated state repository/validator. Its vault wrapper
allowed only `CACHE_DATA_KEY_NAME`; Gmail refresh/client credentials and mail records were
not read. Only the fixed code/disposition were emitted, with no account IDs, timestamps,
cursors, counts or private payload. The key buffers were erased, the connection closed,
and the temporary script/bundle/directory removed. No provider graph, window, migration,
database write or network call was created by the inspector. The running product was not
restarted. Verification remains 94 files / 642 tests with full `npm run verify`.

This explains the blocked UI: the canonical policy classifies quota as `retry-later`,
but both public command and live-state projection permit only `retry-allowed`. The saved
category and earlier HTTP-stage evidence identify rate/usage limiting, not a new decoding
or authentication failure. The exact HTTP status, limit subtype and reset time were never
stored and remain unknown. Do not claim the limit has expired or that increasing quota,
reconnecting, or changing concurrency is the confirmed fix.

**Then-pending owner decision (now approved above):** approve an offline, bounded, user-initiated quota-resume/cooldown
flow using the existing sync owner, with safe visible paused status and no automatic retries.
This was the previously deferred `retry-later` recovery boundary. Existing conditional
read approval could not bypass that boundary; no
thirteenth provider attempt has run. A later live read still requires its exact scope to be
confirmed after the policy is reviewed and the verified runtime is loaded.
Change report: documentation/evidence only; no production code, dependency, abstraction,
schema, compatibility path, retry policy or receipt change.

### Earlier conditional approval and diagnostic checkpoints

**Latest conditional approval check (2026-09-09):** the owner approved exactly one
read-only retry only if the existing policy permits it. Privacy-filtered accessibility
inspection of the existing running app showed retained mail and local Reload, no Retry
control, and no active sync. No retry, reviewed-menu action, local reload, credential read,
restart, or provider request was invoked. The conditional provider attempt did not run.
The prior reviewed receipt remains consumed; no override or renewed receipt was created.

**Immediate next step:** inspect only the saved local safe error category through an
appropriate trusted, privacy-preserving path to explain the unavailable Retry control.
Do not infer quota, revoked access or the exact HTTP status from button absence. The
existing runtime was not relaunched, so do not assume it contains `c3eff6f` diagnostics;
any later permitted observation must first run the verified build. This approval is not
authority to reconnect, reset a receipt, change retry eligibility or bypass the control.
The remaining HTTP status/reason is still unobserved.

**Latest offline checkpoint (2026-09-09):** from clean published `d3717d5`, the
HTTP failure boundary now records fixed status categories (bad request, unauthorized,
forbidden, not found, rate limited, server error, unexpected status) and a single fixed
allow-listed reason category, or unclassified. These extend the existing batch-deduplicated
stage contract; no raw provider strings, status numbers, headers, error messages, URLs,
mail identifiers, counts or timing are logged. Error bodies keep their existing size/deadline
limits. Ambiguous/unknown reason shapes stay unclassified, not guessed.

The existing safe error mapping and retry policy are unchanged. Synthetic integration
proves a later HTTP failure leaves an earlier committed page/cursor intact and only an
explicit subsequent call resumes it. `npm run verify` passes 94 files / 642 tests, strict
types, security/structure and production build. No new dependencies, abstractions,
compatibility paths, schema, IPC, UI or provider capabilities; existing helpers/reporters
are extended. No credentials/private runtime data were read, no app restart or live request
was performed. Previously observed partial real mail remains the latest live evidence.

**Exact next step:** request approval for exactly one read-only retry through the existing
public control, only if trusted policy permits it. That attempt would resume the encrypted
checkpoint and exercise status/reason diagnostics if an HTTP failure recurs. Stop after
settlement or cancellation; no automatic retry, reconnect, receipt reset, policy override,
or thirteenth read is currently authorized. If Retry is unavailable, inspect safe local
status and return the blocker rather than bypassing it. A future successful attempt would
not retrospectively identify the earlier HTTP response. The old one-use receipt stays consumed.

### Historical investigation and implementation checkpoints

**Current priority: Gmail read failure only.** The provider-inert audit from verified
`dd69c5d` reproduced valid base64url padding rejection, ignored empty-inline external
text, and unsafe cancellation/late-commit behavior. These are corrected with synthetic
tests and fixed non-reflective failure categories; the documented `format=full` is used.
See [GMAIL_READ_DIAGNOSIS.md](GMAIL_READ_DIAGNOSIS.md) for the full path, ranked causes,
limits, primary sources and controlled-attempt plan. The actual sixth-attempt trigger
is still unknown. This is not a live Gmail success: last observed state remains connected,
live-empty, with policy-disallowed Retry hidden. No credentials/private configuration
were read, no product runtime was launched, and no twelfth Gmail attempt was authorized
or made during this investigation. Public documentation requests are not Gmail API reads.

**Completed approval (2026-09-08; historical):** the owner approved one-use reviewed recovery and
exactly one controlled twelfth read-only sync. ADR-065 extends only the trusted main
command for the reviewed `MALFORMED_PAYLOAD` state. Development menu **Diagnostics →
Reviewed Gmail read once…** selects the sole complete startup account and uses a native,
default-Cancel confirmation. After fresh connection/state validation, a fixed receipt
in existing `audit_events` is consumed before lifecycle dispatch. Restart, failure and
cancellation cannot renew it. The normal renderer/IPC retry policy remains unchanged.
Do not reconnect, rewrite durable errors, or run a thirteenth request. Implementation
is provider-inert verified; live execution and its result are not yet claimed here.

Change report: no dependency, schema, public IPC contract or renderer change. The existing
HTTP helper and batch diagnostic tracker were extracted into named infrastructure modules,
not parallel provider/coordinator services. The unpadded-only decoder is replaced by one
strict padded/unpadded decoder, not retained as a fallback. Existing retention, consent,
retry policy, credential ownership and encrypted-worker boundaries remain unchanged.
The cumulative narrative below is historical; this current summary and the diagnosis
document supersede its older next-step statements and test totals.

### Latest live result — 2026-09-08 (supersedes the live-empty descriptions below)

Implementation checkpoint `d8e1ef3` was fully verified and published before the owner-approved
observation. The first native confirmation expired during a long user pause: no credential
or provider stage ran and a read-only boolean check proved the fixed receipt was still unused.
That expired dialog was cancelled. On the user's continuation, the still-unused approval was
confirmed and **exactly one provider sync** ran; this was not a second Gmail request attempt.

The stage record proves credential refresh, token validation, profile/list, message retrieval,
canonical normalization and encrypted projection commit completed. A subsequent batch failed
at the fixed `gmail-message-http` boundary, then the trusted command and native result dialog
settled normally. There was no second provider sync. A read-only, keyless inspection confirmed
only two booleans: the one-use receipt is consumed and encrypted provider messages are present.
No counts, private payloads, message IDs, addresses, subjects or precise provider timing were
recorded. The original specific message-format trigger is not retrospectively proven.

A local-only Reload confirmed **Recent retained mail is visible in the app**. The app is left
open for the owner. The current installation is no longer live-empty: partial real Gmail mail
is retained encrypted, but the full sync is incomplete. Ordinary status remains truthful and
no sending, marking read, other mailbox mutation, reconnect, rotation or AI action occurred.

**Exact next step:** investigate the remaining HTTP rejection using only safe local evidence
or provider-inert diagnostics; its precise status/reason was not exposed by the current stage.
Do not call it quota, authentication, or another provider condition without evidence. The
review receipt stays consumed; no thirteenth provider attempt is authorized. Do not reset the
receipt or repeat the reviewed menu action. `npm run verify` remains 94 files / 609 tests;
this follow-up changes continuity records only, not the verified production implementation.

Reviewed-recovery change report: the new native menu adapter and SQLite receipt reuse
the existing command and `audit_events`; no duplicate sync owner or schema was added.
The trusted-only approval interface is absent from preload/IPC. Verification passes
94 test files / 609 tests, structure/security, typecheck and production build.

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
`invalid_request`; a bounded non-reflective classifier identified incomplete client-secret
configuration. After the secret was privately configured, the next owner-approved
authorization completed and durably stored one OS-protected refresh credential plus one
encrypted provider-account/sync pair. The installation atomically entered live mode and
removed its sample rows. Initial read-only sync then recorded the safe code
`PROVIDER_UNAVAILABLE` before any provider mail or cursor was stored. Aggregate inspection
confirmed one connected pair, zero provider-mail records, no lifecycle cleanup operation,
and live-empty UI with attention required; no credential or message content was exposed.
The narrowest standards-backed suspected cause is that Google's refresh response may include
an optional `id_token` for the granted `openid` scope, while Posita rejected that allow-listed
field. A bounded accept-and-discard compatibility fix is implemented with deterministic tests;
raw tokens were not logged, so live confirmation remains pending. The owner approved both a
narrow manual retry capability and, only if needed afterward, the existing confirmed disconnect/
reconnect fallback. The manual retry is now fully implemented and delegates only to the single
sync lifecycle owner. Its first approved live execution entered the read-only flow but did not
settle during the observed window; the UI remained busy and aggregate inspection still showed
zero provider-mail records. The local development process was stopped without disconnecting the
account or making another provider request. ADR-058 now adds a fixed whole-attempt deadline,
cancellation through the same lifecycle owner, and startup recovery for only persisted
interrupted `syncing` state.
The product is a runnable Electron desktop prototype using React, strict TypeScript,
and SQLite. The current installation is live-empty and shows no provider mail; deterministic
sample data remains only in repository fixtures and sample-mode tests.

The eleventh observation's local response defect is now resolved provider-inertly. React Strict Mode replays effect
setup/cleanup during development; the retry control set its mounted guard false during that replay and never restored
it, so a valid settled response was discarded. The same pattern existed in disconnect and open-original. All three
controls now restore their guards on every setup and have Strict Mode settlement coverage. The bounded live-mail read
contract is now v3 and projects only `available` or `unavailable` retry status from the extracted pure policy also used
by the trusted command. The renderer no longer infers provider permission from a broad attention state. No credential,
provider request, schema migration, dependency, AI, or mailbox mutation was involved. Canonical verification passes
88 test files and 547 tests. A later unlocked startup-only inspection confirmed the current real account remains
truthfully attention-required, keeps local-status reload and confirmed disconnect, and no longer exposes the
policy-disallowed Retry control. No control was invoked and no twelfth live request is authorized.

Milestone change report: `providerMailSyncRetryPolicy` is the one extracted pure policy module; the existing status
service and retry command now consume it, and the encrypted projection uses it only to emit the bounded v3
availability value. This replaces the policy's former placement inside the status service and adds no parallel owner.
Live-read v2 has been removed from source and is rejected at validation; there is no retained compatibility path or
intentional duplication. Existing IPC, preload, worker, encrypted repository, and lifecycle owners are retained.

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
- live snapshot v3 provenance that exposes only an available address/label, an
  explicit safe retry-availability value, or an
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

- no provider mail, people, topics, summaries, or drafts are currently stored in the
  live installation; repository fixtures remain deterministic sample/test assets,
- no summaries or drafts are produced by an AI provider,
- the desktop client ID and rotated secret are privately configured locally; one user
  authorization grant is stored only as an OS-protected refresh credential,
- the isolated `posita-mail-hub-2026` Google Cloud project has Gmail API, external
  testing consent, and the `Posita macOS Desktop` client configured,
- encrypted provider-account and sync-state tables contain one real connected account,
- Google authorization revocation has a real fixed-endpoint adapter and remains behind
  the confirmed public disconnect command; live revocation has not been exercised,
- Google access-token refresh has a real fixed-endpoint adapter, exercised only
  through deterministic HTTP and now once through the protected live credential; the
  first live refresh path recorded only the safe sync failure code,
- Google desktop authorization has a real PKCE/state/code/identity protocol adapter
  exercised through deterministic seams and the owner-approved live connection,
- loopback reception and the system-browser handoff have real bounded adapters and
  completed one owner-approved live flow,
- local deletion now includes the real protected connection and live-empty state but
  has not been invoked on them,
- account disconnect has exact preload/IPC/UI triggers guarded by a short-lived,
  same-window typed confirmation and an opaque durable confirmation-intent record,
- Gmail connection consent separates non-activating preparation from an explicit
  cancellable Continue-to-Google action; the latest owner-approved attempt produced
  one protected grant and encrypted account pair,
- authorization-session behavior has both a deterministic fake and a production-
  constructed Google protocol adapter; it is reachable only through the explicit
  trusted-window command and never exposes protocol values to the renderer,
- account-connection persistence is deterministic-tested and reachable only through
  the explicit trusted-window command,
- canonical provider-mail and sync behavior is exercised through deterministic fakes,
  an encrypted SQLite proof, file-backed workers, and one live attempt that stored no mail;
  retention and the bounded read-only live-state query are composed at startup,
  while source-detail is composed for bounded encrypted-local inspection and the
  provider write path is reachable only inside the inactive zero-account graph,
- the schema-v10 sample-to-live service was invoked by the production connection and
  durably removed sample rows before the failed initial sync,
- the provider-mail lifecycle owner is production-composed and starts with zero
  accounts; trusted inventory remains read-only and is not handed to automatic sync,
- a public account-scoped sync retry rechecks complete connection state and the fixed
  durable retry policy, refuses overlap, and returns only safe aggregate results,
- account consistency is not independently exposed; the recovery command uses it
  inside main without mutation or provider action,
- local account recovery remains only for inconsistent local records; the current real
  account pair is complete and does not need orphan recovery,
- sending and every other remote mailbox mutation are disabled.

Not implemented:

- live provider-ingestion evidence,
- pending-disconnect startup scheduling or automatic provider sync,
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

Current next step (2026-09-09): the conditional single-read approval decision at the top
of this handoff. The prior one-use reviewed read is complete and its receipt consumed.
The following chronology preserves earlier evidence;
it does not authorize another provider action or identify the actual failing message format.

The owner-approved connection completed and left one internally consistent protected account
in durable live mode. Initial read-only sync stored no provider mail and recorded only
`PROVIDER_UNAVAILABLE`. Google and OpenID documentation establish that `id_token` may appear
on refresh for an `openid` grant; Posita's previous parser rejected that optional field. The
bounded accept-and-discard fix and ADR-057's policy-gated manual retry command are now fully
verified. The first controlled live click did not settle and stored no provider mail. A bounded
whole-attempt and interrupted-status recovery fix is now implemented under ADR-058. The canonical
verification gate passes, and Posita completed a provider-inert restart so any persisted `syncing`
state could be recovered locally. Visual inspection was blocked only because the Mac was locked.
The later unlocked visual inspection passed: the connected account is shown as needing attention,
offers a fresh explicit retry, and is no longer trapped in `Syncing`. No control was invoked and
no Gmail request occurred during inspection. The owner then approved one more controlled retry.
It exceeded the intended ten-minute deadline, remained visibly busy, and stored zero provider-mail
records. Process evidence isolated an Electron/Node timer-liveness defect: the deadline timer had
been detached with `unref()`. The implementation now keeps that timer referenced and clears it on
normal settlement, with a regression test over the real timer handle. The attempt was stopped;
no disconnect, reconnect, third retry, AI call, or mailbox mutation occurred. A subsequent unlocked,
provider-inert inspection confirms the recovered account is attention-required with an explicit
retry available and is not displayed as `Syncing`. No control was invoked during that inspection.
A third explicitly approved read-only retry started exactly once, disabled duplicate input, and
remained visibly busy beyond the corrected ten-minute deadline. It was stopped without any other
control. Aggregate-only inspection found zero provider-mail records, one encrypted account record,
one encrypted sync-state record, and no unfinished lifecycle cleanup. A provider-inert restart then
returned the UI to attention-required with an explicit retry. The referenced-timer correction is
therefore insufficient in the real Electron path; no fourth provider request has been made.
Provider-inert Electron checks then exercised the exact retry command with a non-settling fake and its
validated IPC return path: they settled safely in 255 ms and 454 ms respectively. This rules out the
deadline command and desktop bridge in isolation. ADR-059 now production-composes one best-effort,
privacy-safe reporter over the remaining credential read, token request/response/validation, Gmail profile/list/
message-batch read, and encrypted projection commit stages. It logs only fixed stages/phases plus an
opaque account ID; no token, address, mail, payload, cursor, URL, or raw error can enter it.

The owner approved one fourth read-only diagnostic, and it ran exactly once. The stage stream proves that
protected credential read, the token HTTP request, and bounded token-response-body reading completed. No
Gmail profile/list/message stage started. The operation still did not return after the ten-minute command
deadline; a one-second read-only process sample showed Electron main idle rather than CPU-blocked. The app
was stopped without another control. Aggregate-only SQLite inspection found zero provider-mail records,
one encrypted account record, one encrypted sync-state record, and no unfinished lifecycle cleanup. A
provider-inert restart visibly recovered the account to attention-required with an explicit retry. No fifth
provider request is authorized, and no token validation, Gmail read, cursor, or successful sync is claimed.

The provider-inert follow-up found one standards-backed compatibility defect inside that exact boundary.
Google documents that the scope string returned with an access token may not textually match the requested
scope even when the grant is unchanged, and documents both `email` and the full
`https://www.googleapis.com/auth/userinfo.email` identifier for the same email permission. Posita previously
accepted only the short form. The token source now normalizes only that one documented alias, then still
requires the exact reviewed `openid`, email, and `gmail.readonly` set and rejects duplicates or widening. A
fixed `token-validation` diagnostic stage distinguishes bounded body transport from token acceptance.
Deterministic tests and a temporary, network-free exact Electron main-process harness prove the real token
source settles and enters the Gmail profile/list path with the full email URI. The harness and its output were
removed after the check. The separately approved fifth request then ran exactly once. Credential read, token
request, and bounded response reading completed; `token-validation` started and failed, and no Gmail stage
began. The command remained visibly busy during a short post-failure observation, so the runtime was stopped
without a second click. Aggregate-only inspection again found zero provider-mail records, one encrypted account,
one encrypted sync state, and no unfinished lifecycle cleanup. A provider-inert restart restored the truthful
attention-required UI.

That observation proves the remaining failure is response validation, but privacy-safe diagnostics deliberately
do not reveal which field caused it. A primary-documentation audit found one remaining incompatible rule:
Posita rejected every extra success-response key, while Google's desktop OAuth guidance says unrecognized fields
must be ignored. The bounded 16 KiB parser now ignores unused fields but still validates every consumed token,
expiry, type, ID-token, and exact-scope value. Deterministic token-source and token-to-Gmail tests pass with
documented and future extension fields. This is provider-inert compatibility evidence, not live Gmail success.

The owner then approved one sixth read-only observation. It completed token validation, Gmail profile, and Gmail
list, proving the refresh and least-privilege access path live. The bounded `gmail-message-batch` stage started and
failed before any projection commit. The UI did not return during a 30-second post-failure observation, so the
runtime was stopped without another click. Aggregate-only inspection found zero provider-mail records, one encrypted
account, one encrypted sync state, and no unfinished lifecycle cleanup. A provider-inert restart again restored the
attention-required UI with an explicit retry. The current safe evidence cannot distinguish individual-message HTTP/
body handling from canonical normalization, and neither is asserted as the cause.

The provider-inert follow-up now adds two fixed batch-scoped stages: `gmail-message-retrieval` covers bounded message
and external text-body HTTP/JSON handling, while `gmail-message-normalization` covers conversion into Posita's
canonical contract. A private per-batch tracker emits each stage/phase at most once and receives no message ID,
count, content, payload, raw error, URL, or timestamp. Tests prove successful completion, retrieval-only failure,
normalization-only failure, and non-reflection. The owner has approved exactly one seventh read-only observation
after this checkpoint; no eighth request is authorized.

The seventh command was invoked exactly once but emitted no credential, token, Gmail, or projection stage during a
five-minute observation. A one-second read-only sample showed Electron main idle. The process was stopped without a
second click; aggregate-only inspection found zero provider-mail records and no unfinished lifecycle operation. A
provider-inert restart restored the attention-required UI. This did not exercise the message-batch split and is not
a Gmail failure. The remaining pre-provider boundary includes connection inspection, the lifecycle queue and
retention suspension, and encrypted checkpoint preparation; it must be separated provider-inertly before any eighth
request.

The pre-provider path is now separated provider-inertly. Fixed `connection-preflight`, `lifecycle-queue`,
`retention-suspension`, and `sync-checkpoint-preparation` stages use the existing best-effort reporter and contain
only the opaque account scope plus fixed stage/phase. The queue marker completes only when its lifecycle-owned work
begins; an already-cancelled queued retry returns the existing timeout outcome without entering retention or provider
work. Tests cover normal settlement, preflight/checkpoint failures, queued cancellation, and arbitrary reporter
failure. Production passes one reporter through the retry command, lifecycle owner, coordinator, token source, and
Gmail adapter. Provider-inert code inspection also found that the accepted whole-attempt deadline was constructed
after connection preflight. It now starts before that check, returns the safe timeout even if preflight does not
cooperate, retains overlap exclusion until late settlement, and prevents an aborted late result from entering
retention or provider work. No credential was read and no Google request occurred. No eighth request is authorized.

The owner then approved exactly one eighth read-only command. It completed `connection-preflight`, emitted no
`lifecycle-queue`, credential, or Google stage, and remained visibly busy while Electron main sampled idle. The
runtime was stopped once without another control. Aggregate-only storage inspection found zero provider-mail records,
one encrypted account, one encrypted sync state, and no unfinished lifecycle operation. A provider-inert restart
restored the attention-required UI with retry available. This is not a Gmail result. Code inspection identified the
unmarked local boundary between those stages: encrypted sync-state loading and eligibility checks. A new fixed
`sync-state-read` stage wraps only the encrypted read and exposes no state value, policy result, path, timing, or raw
error. Deterministic completion and failure tests pass. A separate exact provider-inert integration uses the real
encrypted SQLite account-state repository, presence-only connection consistency check, lifecycle queue, retention
suspension, and trusted IPC handler; it settles with the full expected fixed-stage sequence. This rules out that
ordinary path in isolation but does not explain the live Electron-only wait. No ninth request is authorized.

The owner then approved exactly one ninth read-only command. It completed both `connection-preflight` and
`sync-state-read`, emitted no `lifecycle-queue`, credential, token, Gmail, or projection stage, and remained visibly
busy while Electron main sampled idle. The runtime was stopped once without another control. Aggregate-only storage
inspection found zero provider-mail records, one encrypted account, one encrypted sync state, and no unfinished
lifecycle operation. A provider-inert restart restored the attention-required UI with retry available. This rules
out a non-settling encrypted state read in that observation, but does not distinguish retry eligibility/lifecycle
dispatch from safe command-response settlement. No tenth request is authorized.

The remaining local boundary is now separated provider-inertly. Fixed `sync-retry-eligibility`,
`lifecycle-dispatch`, and `sync-retry-command` stages distinguish a policy-approved retry, the synchronous handoff
into the existing lifecycle owner, and preparation of a bounded safe command response before IPC validation. Tests
cover normal settlement, rejected eligibility, synchronous dispatch failure, and the exact encrypted-state-to-
trusted-handler path. Diagnostics remain best-effort and receive no state value, policy code, queue detail, timing,
provider payload, raw error, or credential. No provider request occurred. Canonical verification passes 88 test
files and 544 tests. A tenth live observation remains a separate owner decision.

The owner then approved exactly one tenth read-only observation. `connection-preflight` and `sync-state-read`
completed, `sync-retry-eligibility` failed, and `sync-retry-command` completed. No `lifecycle-dispatch`, lifecycle-
queue, credential, token, Gmail, message, or projection stage began. The renderer remained visibly busy after trusted
main had prepared its safe result, so the runtime was stopped once without another control. Aggregate-only storage
inspection found zero provider-mail records, one encrypted account, one encrypted sync state, and no unfinished
lifecycle operation. A provider-inert restart restored the attention-required UI. This proves a local retry-control
visibility/policy mismatch and narrows the unresolved busy state to IPC validation, Electron serialization, preload
validation, or renderer promise delivery. No eleventh request is authorized.

The trusted main IPC response boundary is now separated provider-inertly. Fixed `sync-retry-ipc-response` starts
only after the retry command promise settles and completes after exact response validation immediately before the
handler returns. Production injects the existing non-reflective reporter into IPC registration. Deterministic tests
cover valid response return, malformed-response replacement, arbitrary reporter failure, and the complete real
encrypted-state-through-trusted-handler stage order. No public contract, retry policy, UI behavior, persistence,
dependency, credential, or provider action changed. Canonical verification passes 88 test files and 545 tests. An
eleventh live observation remains a separate owner decision.

The owner then approved exactly one eleventh read-only observation. Retry eligibility failed, the safe command
completed, and `sync-retry-ipc-response` started and completed. The renderer remained visibly busy for a further
observation after the trusted handler returned. No lifecycle dispatch/queue, credential, token, Gmail, message, or
projection stage began. The runtime was stopped once without another control. Aggregate-only storage inspection found
zero provider-mail records, one encrypted account, one encrypted sync state, and no unfinished lifecycle operation.
A provider-inert restart restored the attention-required UI. This rules out the command and main IPC handler; the
remaining response defect is in Electron delivery, preload validation, or renderer promise settlement. No twelfth
request is authorized.

Encrypted account state, ownership, the crash-resume journal, deterministic
retention, account removal, disconnect, full local deletion, explicit confirmation,
safe status, full-deletion startup recovery, read-only lifecycle UI, and explicitly
confirmed local deletion are complete at their current layers. Continue in this order:

1. Treat the post-main response defect and durable retry-visibility mismatch as corrected and visually verified
   provider-inertly. The current durable state is policy-rejected, so do not restore or invoke Retry by assumption.
   The next provider-affecting recovery is an owner decision: retain the connected account for further provider-inert
   diagnosis, or use the existing typed-confirmation disconnect and later reconnect path. Keep the message-batch split
   live-unobserved. Do not issue a twelfth request without a new owner decision.
2. Treat the local account-connection recovery UI as complete at its current boundary. Do not add
   automatic account-pair repair; failed execution must continue to require fresh review.
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
   zero-account startup lifecycle graph as complete. Connection, retry, and confirmed
   disconnect UI/IPC boundaries are verified; retry now has four failed live observations,
   and the provider-inert post-token compatibility correction awaits a separate live decision.
6. Keep all provider work explicit. If retry fails, inspect safe status before deciding
   whether the approved typed-confirmation disconnect/reconnect fallback is warranted.

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
account record v2 and live snapshot v3 now project the verified encrypted mailbox
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
`LiveMailSnapshotV3` without adding a parallel domain or data source. The other
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
- Current verified baseline: 94 test files, 642 tests, strict typecheck, structure
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
