# Posita Architecture

The repository-level engineering contract is defined in `AGENTS.md` and the
machine-readable map in `project.agent.json`. `npm run verify` is the canonical
local completion gate. See `docs/ENGINEERING.md` for the rules that keep frontend,
backend, IPC, and future agent tools independently inspectable and testable.

## Decision summary

Gate 1 will use Electron, React, TypeScript, and Vite. Electron is selected for
the initial build because the current workspace has a supported Node toolchain
but no Rust toolchain, and because Gmail OAuth, OS keychain access, background
sync, and packaging all need a dependable desktop host.

This is not a permanent rejection of Tauri. Re-evaluate the host after Gate 2,
when real bundle size, memory use, native integration, and team constraints can
be measured rather than guessed.

## Process boundary

```text
React renderer
  | typed, allow-listed IPC only
Preload bridge
  | validates requests and responses
Electron main process
  |-- application services
  |-- SQLite repository
  |-- Gmail adapter
  |-- AI adapter
  `-- OS keychain
```

The renderer is treated as untrusted presentation code. It receives no Node.js
access, OAuth tokens, database handles, or provider credentials.

Required Electron controls:

- `contextIsolation: true`,
- `nodeIntegration: false`,
- renderer sandbox enabled,
- restrictive Content Security Policy,
- no remote content in privileged windows,
- navigation and new-window requests denied by default,
- narrow preload API with runtime schema validation.

## Layers

### Domain

Pure TypeScript types and rules for accounts, people, topics, messages, threads,
actions, briefs, citations, and drafts. Domain code does not import Electron,
React, Gmail, a database driver, or an AI SDK.

`ProviderMailMessageV1` and `ProviderMailThreadV1` are the sole canonical
provider-ingestion contracts. They carry account-scoped provider identity,
sender/recipient roles, absolute timestamps, normalized plain and reviewed HTML
bodies, labels, read state, bounded attachment metadata, and immutable source
provenance. Their exact validators reject unknown fields and unbounded payloads.
The older shared `Message` remains only the encrypted deterministic-fixture view;
it is not accepted at the provider boundary and will not be assigned invented
provider identity.

### Application

Use cases such as `buildDailyBrief`, `getTopicContext`, `searchMail`, and
`createDraft`. Use cases depend on interfaces, not provider implementations.

### Infrastructure

Adapters for Gmail, SQLite, the OS keychain, AI generation, clocks, logging, and
telemetry. Provider-specific data is normalized at this boundary.

### Presentation

React views and a small typed client for application use cases. Components render
structured results and citations; they do not parse unconstrained model prose.

## Initial domain model

- `Account`: a connected mailbox and its visible identity.
- `Message`: normalized immutable mail content with provider provenance.
- `Thread`: ordered messages from one provider conversation.
- `Person`: a user-correctable identity joining one or more addresses.
- `Topic`: a user-correctable grouping across threads and accounts.
- `ActionItem`: something needed from the user or another person.
- `BriefItem`: a ranked, explainable projection of source objects.
- `Citation`: a source message plus the excerpt or field supporting a claim.
- `Draft`: generated content, provenance, status, and target account.

Provider IDs are namespaced by account. Internal IDs are stable UUIDs. Derived
objects record their model/rule version and source message IDs so they can be
recomputed or deleted.

## Data ownership and storage

Gate 1 used renderer-imported versioned fixtures. Gate 2A now seeds those fixtures
idempotently into SQLite in the main process and serves a versioned snapshot
through validated, read-only IPC. The schema separates:

- normalized provider records,
- user-authored corrections,
- AI-derived summaries and classifications,
- sync state,
- audit events for user-approved mutations.

Gate 2B implements a main-process `SecretVault`: OAuth refresh tokens are
encrypted with asynchronous Electron `safeStorage` and stored as opaque SQLite
ciphertext. Insecure or unavailable OS protection fails closed. Access tokens
remain in main-process memory and are never persisted.

Gate 2C protects one random installation data key through that vault and stores
accounts, people, messages, topics, and brief items as independently authenticated
AES-256-GCM records. Queryable metadata is bound as associated data. Legacy
plaintext fixtures are migrated transactionally, followed by secure deletion,
WAL truncation, and compaction. No plaintext search index exists. Logs use opaque
IDs and must not contain message bodies, subjects, addresses, tokens, or drafts.

The main process performs one asynchronous key-unwrapping step at startup, then
uses the existing synchronous repository contract for the bounded snapshot. Key
loss, unknown envelopes, and authentication failures make local data unavailable;
they never trigger silent cache reset.

Gate 2D schema v4 reuses the same protected installation key and envelope format
for versioned provider-account identity and sync state. Provider subject IDs and
cursors remain encrypted. Only the record kind and opaque Posita account scope
are queryable, and both are authenticated. The repository is composed in the
trusted main process and has no preload or renderer surface.

Provider-account record v2 separates the provider's opaque subject from its
human-facing identity. The provider-verified mailbox address and optional bounded
user label share the existing authenticated encrypted payload; neither becomes
queryable SQLite metadata. The live status projection may expose only the address
and label for presentation, while the provider subject remains trusted-main-only.
Legacy simulated v1 provider-account payloads are rejected because no truthful
mailbox address can be inferred from an opaque subject.

Gate 2D schema v5 adds the operational lifecycle journal from ADR-012. It stays
outside the deletable key boundary and stores no private content, allowing a
future disconnect or delete-local-data workflow to resume after interruption or
cryptographic erasure. The journal records progress only. Startup can execute an
already-authorized full-deletion recovery; it cannot create new lifecycle work,
and pending disconnect remains inactive.

Ownership remains singular:

| Data | Authority and lifecycle owner |
| --- | --- |
| Remote messages, threads, labels, deletion | Provider through the future sync coordinator |
| Cached normalized source records and cursor projection | Encrypted repositories; reconciled from provider state |
| Provider identity and consent | Encrypted account-state repository |
| User corrections | Local user-owned record; never overwritten by provider or AI |
| Topics, briefs, classifications, embeddings | Derived store with source IDs; recomputed or evicted with sources |
| Drafts and pending commands | Local user/application state until explicitly confirmed or discarded |
| Disconnect and local-deletion progress | Non-sensitive lifecycle journal until completion |

### Retention maintenance

The Gate 2D retention service accepts an injected absolute clock and uses the
source message's validated ISO timestamp, never a presentation label such as
“Today.” The private-alpha cutoff is exactly 90 days; a message at the boundary is
retained. Missing or invalid source timestamps fail the operation before storage
changes.

Before retention can be scheduled, startup applies one controlled compatibility
rule for historical fixture caches. A cache is eligible only when every source
timestamp is absent and the complete decrypted dataset semantically equals the
known historical fixtures after omitting that field. Posita then replaces the
whole simulated dataset with the current timestamped fixtures through the existing
atomic encrypted rewrite and sanitization path. Mixed, edited, partial, or unknown
data fails closed. Pending disconnect startup skips this compatibility path.

If an expired message is a source for a topic, Posita removes the complete derived
topic and its dependent brief items rather than retaining an uncited summary.
Unreferenced people are removed; mailbox accounts remain. The encrypted repository
prepares and validates the replacement before a transaction, replaces source and
derived records together, records sanitization pending, then compacts and marks the
cache ready. Main owns one immediate startup pass and a bounded 24-hour cadence,
with a one-hour retry after a safe failure. For file-backed storage, dataset load,
retention planning, encrypted replacement, checkpointing, and `VACUUM` all run in
one dedicated worker operation; no private dataset crosses back to main. A bounded
status projection is included in the existing read-only application state and a
fixed notification asks trusted windows to refresh it in place.

The lifecycle owner is single-flight and cancellable at task boundaries. Full
local deletion first suspends and awaits maintenance so cleanup cannot rewrite
records while deletion is erasing them. Normal shutdown awaits active work and
destroys the worker adapter's trusted key copy. That copy is never persisted,
logged, or sent to the renderer and is also erased by successful full deletion.

The same packaged maintenance operation now preflights fixture retention and then
applies the fixed cutoff to every encrypted canonical provider-mail account. A
message exactly at the cutoff remains. Expired messages are removed; an affected
thread is re-encrypted with its retained message IDs or deleted when none remain.
All accounts are decrypted and planned before canonical mutation, opaque row IDs
remain account-scoped even when they collide, sync cursors are unchanged, and a
pending sanitization marker makes failed compaction resumable on the next pass.

### Account-removal projection

The Gate 2D account-data removal service operates on one opaque account ID and is
idempotent. It removes that account and its source messages in one encrypted-cache
replacement. A topic whose message list or event citations touch a removed source
is deleted with its dependent brief items; filtering only the citation would risk
retaining a stale summary, status, priority, or action. Sources from other accounts
remain and may be regrouped later. Unaffected topics remain, and a person remains
while any retained message or topic references them.

This service performs only the local mail-data phase. The disconnect orchestrator
invokes it after revocation, credential deletion, and provider-state deletion. It
has no independent renderer command.

### Account-disconnect orchestration

Gate 2D implements the application orchestrator described by ADR-014:

```text
revocation pending
  -> credential deletion pending
  -> encrypted account-state deletion pending
  -> account mail/derived deletion pending
  -> SQLite compaction pending
  -> completed
```

Each action is idempotent and the journal advances only afterward. If an action
fails, the same phase retains a safe retry code. If the action succeeds but the
journal write fails, resumption repeats that action safely. One in-memory
single-flight guard permits the same operation to share its promise and rejects a
different concurrent operation for that account.

The orchestrator is tested through an authorization-revoker interface. A bounded,
idempotent `GoogleOAuthRevoker` now implements that interface, but remains
uncomposed; there is no OAuth token, background resume scheduler, preload method,
or UI trigger. The installation data key is not deleted for one account because
other accounts share it.

### Full local-data deletion orchestration

ADR-015 defines a separate installation-wide state machine:

```text
all refresh credentials pending
  -> all encrypted account state pending
  -> all encrypted mail/derived records pending
  -> SQLite compaction pending
  -> OS-protected data-key deletion pending
  -> in-memory key destruction
  -> completed
```

Logical record deletion and physical sanitization are separate idempotent phases.
The key is erased only after private records and SQLite remnants are removed, and
the shared protector is destroyed before completion is journaled. Durable pending
work rejects an overlapping installation deletion or same-account disconnect,
including after a process restart.

ADR-016 adds a command gate before a new installation operation can exist. A
main-process confirmation service creates two opaque generated IDs, returns exact
consequence copy plus the required `DELETE LOCAL DATA` text, and keeps the
five-minute challenge in bounded memory. Correct confirmation persists only an
operation-bound, non-sensitive receipt. The deletion service verifies that receipt
before creating its journal. Its separate `resume` entry point refuses to create
work and can only continue an existing journal operation, even after confirmation
expiry.

ADR-021 bounds receipt lifetime without breaking retries. After lifecycle recovery,
startup atomically removes receipts whose expiry is strictly before the current
absolute clock and whose operation has no incomplete delete-local-data journal.
The exact expiry instant remains valid, and an incomplete operation protects its
receipt until completion. Cleanup has no renderer, IPC, timer, or provider surface.

The lifecycle status service reads the journal and projects only operation type,
opaque IDs, optional opaque account scope, bounded progress, safe stage names, and
allow-listed retry codes. A marker is described as `pending`, not “running,”
because persistent state cannot prove a worker is currently active.

ADR-017 composes a recovery-only path before normal key bootstrap. One named
startup owner inspects the lifecycle journal, rejects conflicting pending work,
and resumes full deletion through a keyless SQLite/vault adapter. It never calls
`loadOrCreate`, and a completed deletion marker returns a `local-data-deleted`
runtime on every later restart without reseeding fixtures. The Electron shutdown
owner aborts between phases; completed phase actions remain journaled.

One read-only application-state query now composes the mail snapshot and safe
lifecycle projection in main, validates the union in preload, and renders explicit
pending, retry-required, recovery-required, and local-data-deleted states. ADR-019
adds a separate local-deletion capability with fixed prepare and execute channels.
Preparation performs a lifecycle-conflict preflight but creates no journal or
receipt. Execution requires the exact operation-bound phrase from the same trusted
window, then uses the active deletion composition so the live protector is
destroyed before the UI transitions to deleted mode. No request can select a
provider account, credential, message, or remote action. Pending disconnects are
counted but not resumed because production has no Google
revocation adapter. Their presence requires the existing key and suppresses
fixture seeding, so startup cannot undo a completed local-mail phase. Recovery
uses the same async sanitization contract as active lifecycle work. File-backed
databases use one single-flight Node worker with a separate SQLite connection;
only bounded in-memory tests and the legacy migration adapter sanitize inline.
The phase remains atomic, so shutdown cancellation is observed between lifecycle
phases rather than interrupting `VACUUM` midway.

The same ready-state query carries the immutable `google-gmail-readonly-identity-v2`
consent projection. It contains reviewed public copy and capability metadata only:
no client ID, authorization URL, state, verifier, token, account identity, or
command. Settings renders that projection and keeps authorization disabled. This
avoids a second consent source of truth or a premature privileged IPC method.

The next internal boundary is `AccountAuthorizationAdapter`. It owns provider
authorization preparation, verified callback completion, and cancellation behind
provider-neutral application types. Inputs and outputs are exact, bounded, and
versioned; the successful grant is trusted-main-only and never an IPC type. The
deterministic fake proves one pending session, expiry, callback matching,
cancellation, and typed failures without network access. The real uncomposed
Google adapter implements S256 PKCE, state, exact loopback callback verification,
bounded code exchange, and verified OpenID/Gmail identity agreement through
injected infrastructure boundaries. The concrete loopback boundary listens only on
one ephemeral IPv4 localhost port, prefilters exact host/path/state, bounds requests
and lifetime, queues at most one callback, and returns copy that never reflects the
authorization response. A separate system-browser boundary validates the complete
Google authorization URL before invoking an injected Electron delegate. Neither is
composed in `index.ts`, so the disabled consent UI cannot start authorization or
open a browser.

`AccountConnectionActivationService` is the uncomposed trusted-main sequence owner
above those parts. It invokes the existing `AccountConnectionService`, registers
callback waiting before browser handoff, keeps both authorization URL and callback
out of renderer contracts, permits at most four non-consuming callback rejections,
and cancels the connection/listener when browser or callback delivery fails. A
verified callback is the explicit completion boundary: after that point the existing
authorization exchange and vault-before-encrypted-state persistence own the outcome
instead of racing cancellation against a possibly committed credential. Cleanup
failure is distinct recovery-required state. The coordinator has no startup, IPC,
preload, renderer, configured-client, or real-browser composition.

The future desktop client identifier has one inert infrastructure source:
`loadGoogleOAuthClientConfiguration`. It reads only `google-oauth-client.json` from
the absolute Posita application-data directory, refuses symbolic links and files
readable by other users on POSIX platforms, caps input at 4 KiB, and accepts only
the exact versioned `provider` and `clientId` fields. It explicitly rejects a client
secret and does not search the repository, environment variables, or alternate
locations. The result remains trusted-main-only and is not constructed by startup,
preload, IPC, or renderer code.

`AccountConnectionService` is the next trusted application layer above that
adapter. It validates begin output against the requested account, binds completion
to the pending session, rejects pre-existing or one-sided vault/account-state
records, and never returns the refresh credential. Completion stores the refresh
grant in `SecretVault` first and the encrypted provider-account projection second.
If the second write fails or has an ambiguous outcome, it removes account state
and then the credential; a cleanup failure becomes a distinct recovery-required
condition rather than a false success. Provider-unavailable and callback-rejected
authorization errors retain their in-memory session for retry. The coordinator is
tested only with deterministic fakes and is not composed in startup or IPC.

The coordinator also owns the single read-only consistency projection for this
cross-store boundary. For one validated opaque account ID it reports exactly one
of `absent`, `connected`, `credential-only`, or `provider-state-only`. It uses the
vault and encrypted account-state presence-only queries, so diagnosis does not
decrypt, return, or rotate either payload. Connection preflight consumes this
same projection rather than reimplementing consistency rules. Inconsistent state
blocks authorization, but
the query never repairs, deletes, or overwrites either store and remains outside
startup, preload, IPC, and UI.

`AccountConnectionRecoveryService` applies the approved conservative policy to a
diagnosed one-sided pair. Its exact versioned request is bound to an opaque
confirmation ID, operation ID, account ID, action, and expected orphan status. A
confirmation verifier must prove a durable short-lived receipt for that entire
request. The service refuses `connected` and `absent`, rejects stale status,
rechecks before consumption, atomically consumes the exact unused receipt, rechecks
again, deletes only the orphaned credential or the account's encrypted provider/
sync state, and verifies `absent` before reporting success. Consumption is durable
and occurs before mutation, preventing replay against newly recreated state; a
failed or interrupted deletion requires fresh confirmation.

The approved product composition adds one narrow command service and separate
prepare/execute IPC methods. Preparation accepts only a known opaque Posita account
ID; main independently derives the current orphan type and returns a five-minute
challenge. Execution is accepted only from the same trusted main frame and window,
confirms the exact phrase, persists the receipt, and then invokes the existing
discard policy. Complete and absent pairs are refused before a challenge exists.
The Settings surface labels every current account as sample data and covers checking,
not-needed, confirmation, progress, success, and safe failure states. The service
does not revoke, reconnect, reconstruct, open a browser, or contact a provider.

## Gmail synchronization

The uncomposed `GoogleMailReadAdapter` implements the approved initial 90-day
import followed by incremental history synchronization. It receives short-lived
access tokens through an injected trusted-main boundary, uses only fixed Google
HTTPS GET routes, caps response sizes and concurrent message reads, and emits the
existing canonical provider batch rather than exposing Google payloads. Its
opaque versioned cursor resumes full-list pages, history pages, and oversized
history records. It maps expired authorization, revoked permission, quota,
stale-history, malformed-response, cancellation, and temporary-provider failures
to the existing typed application errors. Deterministic injected-HTTP tests cover
this behavior without credentials or network use; production composition remains
inactive.

Its token boundary is now implemented by the uncomposed
`GoogleOAuthAccessTokenSource`. The source reads only the account-scoped refresh
credential from `SecretVault`, exchanges it at the fixed Google token endpoint,
and caches the short-lived access token only in trusted memory with a one-minute
expiry margin. Refresh is single-flight per account, independently cancellable by
waiters, bounded by time and response size, and explicitly invalidated on future
disconnect or destroyed on shutdown. Exact response validation refuses any scope
other than the reviewed full `gmail.readonly` URI. Client configuration remains an
injected value with no production instance, and no token or error detail crosses
IPC.

Sync operations remain idempotent, transactional at a batch boundary, resumable,
quota-aware, and isolated per account.

One application-owned sync coordinator is the only component permitted to call
provider adapters. Provider mail is the remote source of truth; the encrypted
cache is a projection, while user corrections, derived artifacts, drafts, and
confirmed commands retain separate ownership. Deduplication uses account-scoped
provider identity, and cross-account topic relationships never merge source
records or authorization contexts.

The credential-free `MailSyncCoordinator` now implements this application
boundary against `ProviderMailAdapter` and `MailSyncProjection` interfaces. It
performs a 90-day initial request, account single-flight, bounded cross-account
concurrency, normalized-batch validation, atomic batch-plus-cursor commits,
account-scoped provider-ID replay handling, versioned remote-deletion tombstones,
one complete atomic bounded replacement after an invalid cursor, and cancellation
for disconnect, supersession, and shutdown. Incremental projection commits delete
provider-authoritative records and repair threads in the same transaction as the
cursor. Bounded recovery collects every page before committing, so incomplete
recovery leaves the prior projection intact. The
deterministic provider/projection fakes prove these rules without credentials or
network access. A schema-v9 SQLite projection now proves authenticated
canonical message/thread persistence and atomic encrypted-cursor advancement with
opaque local row IDs. Its synchronous calls are limited to bounded in-memory tests
and worker internals; no sync startup owner, preload/IPC method, UI status, or
polling schedule is composed. File-backed reads and commits now have a packaged serial
worker adapter with a bounded validated protocol, transferable in-memory key copy,
safe errors, and explicit key cleanup. Its read-only operation is now composed for
live-mode application state; commit, delete, and sync ownership remain inactive.

A credential-free integration test now wires that coordinator to the packaged
file-backed projection worker and deterministic provider. It proves multi-page
initial commit, encrypted-cursor resume, replay classification, preservation of
an externally advanced cursor on conflict, provider cancellation, and teardown
of the worker's retained key. This test composition is not a startup owner,
polling schedule, provider adapter, renderer capability, or live mailbox path.

Schema v10 adds a separate installation-level mail-mode boundary. Startup seeds
the deterministic compatibility projection only in `sample`; `live` requires the
existing protected key and never falls back to fixtures. The first transition is
allowed only after the canonical connection inspector reports a complete local
credential/provider-state pair. Sample deletion, sanitization-pending state, and
the mode update share one transaction; physical compaction may retry afterward.
The mode has no ordinary reverse transition, so removing every account produces
live-empty rather than demo content. The transition service remains trusted-main-
only with no provider or renderer command, while the existing application-state
query now reads the durable mode on every load.

Live mode uses a separate exact read-model contract rather than converting
canonical records into the fixture dataset. One short-lived serial projection
worker decrypts and validates canonical account/message/thread records and returns
at most 50 newest summaries across at most 32 account scopes. The version-2 response
contains canonical source locators, encrypted-account-derived visible address/label
provenance, sender, timestamp,
subject, bounded plain-text preview, read state, and attachment count. It excludes
full bodies, recipients, remote provider IDs, provider-account subjects, cursors,
database paths, key material, and raw failures. Sample mode stays synchronous and
unchanged. The application-state method is asynchronous so file-backed decryption
never blocks Electron main.

The renderer distinguishes live-empty, recorded-syncing, offline, attention, and
cached-data states. It renders the already-bounded summary projection as a semantic
recent-mail list with visible human account identity, unread and attachment cues,
and direct selection of the exact encrypted local source. It never displays opaque
account scope, remote provider identity, or full body content in the list. The
open-original path remains a separate confirmed capability. Reload re-queries local
state only and never starts provider sync.

The canonical source-detail boundary now has one exact version-1 request keyed by
opaque Posita account and canonical message ID. The same serialized file worker
decrypts the account projection, returns exact found/missing state, and binds a
found result back to both requested IDs. Output contains canonical message/thread
identity, visible encrypted account identity, sender/recipients, timestamps,
subject, read state, safe attachment metadata, and at most 128 KiB of plain text
with an explicit truncation flag. It excludes provider message/thread/attachment
IDs, provider HTML, content IDs, labels, paths, keys, and raw failures. This source
is composed through one application service, trusted-main-frame IPC handler,
validating preload client, and renderer data source. The UI covers loading, exact
missing, safe error, retry, and stale-result suppression without external navigation.

The reviewed open-original boundary is a separate command. The renderer sends only
the same opaque Posita account/message pair after a two-step explicit confirmation.
The existing encrypted projection worker resolves the provider message ID and
verified mailbox address; neither crosses public IPC. Main derives one HTTPS
`mail.google.com` target, a second exact validator rejects scheme/host/path/query
widening, and a narrow OS adapter requests the default browser. Success means only
that the system accepted the request. Google does not document the Gmail web route
as a stable API, so live activation must revalidate it; failure is non-destructive
and bounded local source detail remains available.

`ProviderMailLifecycleOwner` now defines the credential-free composition order
above the existing sync coordinator, mail-mode service, retention owner,
disconnect service, and projection key lifecycle. It accepts at most eight exact,
unique trusted account requests at startup. A persisted connection activates live
mode before provider work; live-empty starts no provider work; offline sync is a
bounded retry-required result rather than a startup reset. Account batches keep
the coordinator's bounded concurrency while retention is suspended. Disconnect
globally suspends and settles sync before retention and local lifecycle mutation,
then resumes both on completion or safe failure. The same owner implements the
quiescence gate used before confirmed full deletion. Deletion composition can now
destroy every retained worker-key context in its data-key phase, while normal
shutdown settles sync and retention before destroying the projection key. This
owner is application-only and uncomposed; it adds no provider polling schedule,
account discovery, preload/IPC method, renderer status, or live adapter.

`ProviderMailSyncStatusService` is the single durable status writer for future
lifecycle-owned sync. It reuses encrypted account sync state, preserves the last
safe cursor and success time while work is running or fails, and validates the
account-bound coordinator result before advancing either. Cancellation returns the
record to idle. Typed failures map to one fixed disposition: retry allowed, retry
later, reconnect required, review required, or cancelled. The policy is descriptive
only; it never schedules provider work or exposes a mailbox command. The lifecycle
owner fails closed before provider I/O when the status write cannot be established.
Bootstrap composes the service in trusted main but still does not start the owner.

The final activation audit retains the current standalone retention scheduler and
read-worker shutdown only while provider sync is inactive. Approved Google
activation must reuse the same `WorkerThreadMailSyncProjection` for reads, commits,
account deletion, shutdown, and key erasure; construct one coordinator and one
lifecycle owner; then move retention start/stop, confirmed-deletion suspension, and
normal shutdown under that owner together. Provider reads must arrive with an
idempotent revoker and confirmed disconnect path so the product cannot enter a
half-live state with no safe removal owner.

`GoogleOAuthRevoker` is the first approved real adapter and remains uncomposed. It
implements the existing idempotent revocation contract, retrieves only the target
account's refresh token from `SecretVault`, posts it in the body to the fixed Google
HTTPS endpoint, and accepts only HTTP 200 or the documented `invalid_token` result
as success. Response bodies and time are bounded; raw provider detail and token
material are never returned or logged. Networking is injected for deterministic
tests, so no SDK or new dependency is required.

Startup now supplies the previously missing read-only account discovery boundary.
The encrypted account repository lists only validated opaque scopes for provider-
account records, while the vault lists only validated Google refresh-token scopes
without unprotecting values. `ProviderMailStartupInventoryService` compares their
bounded union, decrypts and validates provider identity only for complete pairs,
and returns deterministic sync requests for at most eight accounts. Any credential-
only or provider-state-only pair makes the whole result recovery-required; no
partial account list may start. The result remains trusted-main-only and does not
invoke mode activation, sync, retention, provider access, or recovery.

The inactive disconnect orchestrator's existing `mail-data-delete-pending` phase
now runs both fixture account removal and worker-backed canonical projection
removal before advancing its journal. Both actions are idempotent: if the second
fails after the first commits, retry safely repeats the fixture plan and then the
account-scoped canonical delete. This adds no provider or remote action.

Sync work uses bounded per-account batches and cross-account concurrency,
cancellation, explicit timeouts, and bounded backoff. Production sync, parsing,
indexing, and AI work run outside renderer and Electron main event loops.

Desktop authorization uses Authorization Code + PKCE through the system browser
and a loopback redirect. The first sync requests `gmail.readonly` only. See
`GMAIL.md` for scope progression and credential-lifetime rules.

Remote mutations are commands with an explicit confirmation record. Gate 2 only
requires creating a local draft; sending remains outside the alpha's default
capability until its safeguards are separately reviewed.

## AI pipeline

AI output is a versioned structured proposal, never an authority.

```text
normalized mail
  -> deterministic preprocessing
  -> bounded retrieval
  -> schema-constrained model output
  -> citation and policy validation
  -> stored derived object
  -> user-visible correction path
```

The app must reject malformed output, unsupported citations, unknown source IDs,
and actions outside the request. A deterministic fallback still exposes classic
mail and basic rule-based grouping if the model is unavailable.

## Testing strategy

- Unit tests: domain rules, ranking, normalization, and schema validation.
- Component tests: structured cards, source links, and interaction states.
- Integration tests: renderer-to-main contracts against temporary repositories.
- End-to-end tests: the Gate 1 vertical slice in a packaged-like environment.
- Gate 2 contract tests: recorded, redacted Gmail and AI fixtures.

No test is allowed to depend on a personal mailbox or production credential.

## Delivery sequence

Steps 1–5 are implemented through Gate 2A. Provider adapters remain deferred.

1. Establish domain types, fixtures, and visual tokens.
2. Render the desktop shell and Daily Brief from application services.
3. Connect topic, source-message, and draft interactions.
4. Add tests and accessibility checks for the vertical slice.
5. Introduce SQLite behind the existing repository interface.
6. Add Gmail and AI adapters one at a time behind feature flags.

Each step must leave the application runnable and preserve the approval boundary.
