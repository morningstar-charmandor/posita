# Gmail Authorization Boundary

## Current status

Gmail is not connected and Posita does not yet contain a Google OAuth client ID.
Real desktop authorization protocol, read-only, idempotent revocation, and refresh-
to-access-token adapters are implemented but uncomposed. This document does not
authorize live mailbox access.

Posita can now project its durable `live` installation mode through a bounded
worker-backed application snapshot. That local read model is not Gmail access: it
starts no sync, uses no credential, and exposes no remote provider IDs or cursor.
Its renderer provides bounded recent-mail summaries, local source inspection, and
a reviewed, confirmed browser handoff. These are encrypted-cache views, not proof
of a current Gmail connection or provider sync.

Settings now renders a credential-free consent preview identified as
`google-gmail-readonly-identity-v2`. The exact projection is carried through the
existing validated read-only application-state response and requests `openid`,
`email`, and `gmail.readonly`. It explains that identity scopes establish the
hidden stable Google subject and verified mailbox address but do not permit mail
mutation. Its activation button is disabled. It creates no authorization state,
PKCE verifier, browser navigation, token, provider account, or consent receipt.

Normal startup now performs a credential-free, trusted-main inventory over at most
eight local account scopes. It compares encrypted provider-account presence with
protected Google refresh-credential presence without unprotecting credential values.
Only complete pairs become future lifecycle requests; any one-sided pair withholds
the whole ready inventory. The result does not authorize, connect, or sync Google.

Gate 2D now defines the provider-independent main-process authorization-session
interface and a deterministic fake. The boundary accepts only the reviewed
`google-gmail-readonly-identity-v2` consent and exact three-scope set, requires an HTTPS
authorization target and an explicit-port loopback callback, permits one pending
session, and models exact expiry, cancellation, callback rejection, and safe
provider failure. A validated successful version-2 result contains the provider
subject, verified mailbox address, and refresh credential only inside the trusted
main-process contract so a future
coordinator can move it directly into encrypted account state and `SecretVault`.

The fake uses conspicuous test-only values, performs no network or browser action,
and is not composed at startup. A real `GoogleDesktopAccountAuthorizationAdapter`
now implements S256 PKCE, cryptographic state, an exact `127.0.0.1` callback check,
bounded code exchange, verified OpenID `sub`/email, and agreement with Gmail profile
identity. Its loopback URI and HTTP transport are injected and deterministic in
tests. It never opens a browser itself. The matching uncomposed loopback listener
now binds one ephemeral IPv4 localhost port with strict host/path/state, header,
request, queue, and five-minute lifetime bounds. Its browser response never reflects
callback data. The separate system-browser launcher validates the entire exact
Google URL and uses an injected Electron delegate; deterministic tests never invoke
the OS. Production client configuration, credential persistence, account creation,
preload/IPC command, enabled UI action, browser launch, and live provider request
remain unimplemented.

The credential-free `AccountConnectionActivationService` now proves how these
pieces must be used together without activating them. It begins through the existing
connection service, registers the callback waiter before browser handoff, retries
only the protocol adapter's non-consuming callback rejection up to a fixed limit,
and completes through the existing vault-before-encrypted-state transaction. It
cancels on browser/listener failure and reports uncertain cleanup distinctly. The
authorization URL and callback never enter renderer data. This coordinator is not
constructed by startup and has no preload, IPC, Settings action, configured client,
credential, browser invocation, account, or provider request.

Gate 2D also defines a credential-free `AccountConnectionService` above the
authorization adapter. It verifies that the opaque Posita account has neither an
existing provider record nor refresh credential before authorization and again
before persistence. A valid grant is stored in `SecretVault` before its encrypted
provider-account projection. Failed or ambiguous account-state writes trigger
reverse cleanup of account state and credential; incomplete cleanup is reported
as recovery-required. The returned result contains provider identity and consent
metadata but never the refresh credential. This service uses deterministic fakes
only and is not a Google client, production credential path, startup component,
IPC capability, or enabled connection action.

The coordinator can now diagnose the local connection pair without contacting
Google. Its versioned main-only result distinguishes no records, both records,
credential-only, and provider-state-only. It returns no provider subject or token,
and its vault presence check does not decrypt the credential. This status blocks
new authorization when either side is inconsistent and performs no automatic
repair. The separately confirmed Settings recovery command can discard one
diagnosed orphaned local side; reconnecting Gmail remains impossible in this build.

The local recovery service now encodes the approved policy: after
an exact account- and orphan-status-bound confirmation, discard only the orphaned
credential or encrypted provider/sync state and require a fresh connection. It
refuses a complete connection and performs no revocation or Google request. The
dedicated schema-v8 producer atomically consumes an exact unused receipt before
local deletion, preventing replay; a failed attempt needs fresh confirmation.
Separate same-window prepare and execute methods expose this only in Settings.
Main derives the orphan type from presence-only local inspection; the renderer
cannot choose it. The current account choices are visibly labeled as samples, and
normal checks report that no recovery is needed. This composition does not add a
Google adapter, OAuth client, browser action, provider request, real credential,
live account, or mailbox mutation.

The credential-free connection path now persists provider-account record v2. Its
opaque provider subject remains hidden; its verified mailbox address and optional
bounded user label are encrypted in the same account-scoped payload. The live
status projection exposes only the address/label and uses an explicit unavailable
identity for incomplete local state. No renderer command can set a label yet.

A provider-independent source-detail query is now composed against deterministic
encrypted canonical data and the packaged worker. It uses only Posita account and
message IDs and returns bounded plain text, recipients, safe attachment metadata,
canonical provenance, and exact found/missing state. Gmail IDs, provider HTML, and
attachment/content IDs remain inside authenticated ciphertext. A separate live-
mode-only open-original command resolves the provider message ID and verified
mailbox address inside the trusted worker, constructs and validates one HTTPS Gmail
target in main, and asks the OS browser only after a second explicit user confirmation.
The renderer receives no URL or provider ID, and the command performs no Gmail API
request or mailbox mutation. Google documents immutable API message IDs, but not
this Gmail web route as a stable public contract; revalidate it before live activation.

Gate 2D now also defines the canonical provider-independent message/thread
contract and one credential-free `MailSyncCoordinator`. Exact validators require
account-scoped provider identity, sender and recipient roles, absolute timestamps,
normalized plain and reviewed HTML bodies, labels, read state, bounded attachment
metadata, and immutable source provenance. The coordinator proves one 90-day
initial path, single-flight account work, bounded cross-account concurrency,
atomic batch/cursor commits, replay deduplication, one bounded invalid-cursor
resync, cancellation, and typed failures using deterministic fakes. It has no
production sync composition. Schema v9, its file-backed worker, fixed 90-day
retention, and journaled account removal are verified but remain empty and do not
authorize provider access.

The coordinator and file-backed worker are now exercised together using only the
deterministic provider. Multi-page initial sync, incremental replay, encrypted
cursor resume, conflict refusal, cancellation, and key teardown are verified.
This is a credential-free test boundary, not a Gmail adapter, polling owner,
startup composition, connection command, or live-account path.

The never-activated provider batch is now version 2. It carries bounded remote-
deletion tombstones as well as normalized messages and threads. Incremental commits
remove those cached provider messages, repair or remove their threads, and advance
the encrypted cursor atomically. An invalid cursor now collects the complete bounded
90-day replacement before one commit, so a partial recovery never erases the cache
and a completed recovery does not retain provider mail absent from Gmail. This
changes no local correction, derived, draft, or pending-command ownership.

One credential-free `ProviderMailLifecycleOwner` now defines how a future trusted
composition must operate: live-mode activation precedes initial sync, retention
does not overlap sync batches, disconnect/deletion first suspend and settle sync,
and shutdown destroys the projection worker key only after work finishes. A
live-empty startup starts no provider work; offline startup returns a safe retry-
required outcome. The owner receives no token and remains outside Electron
startup, preload, IPC, UI, Google, and network composition.

The owner now writes account-scoped encrypted sync status through one trusted-main
service: syncing before provider work, idle with a validated cursor and success time
afterward, idle on cancellation, and a typed error on failure. A fixed descriptive
policy separates retry, delayed retry, reconnect, review, and cancellation. It does
not automatically retry or contact Google, and status-storage failure prevents the
provider call from starting.

The final activation audit requires provider reads and revocation to arrive as one
reviewed lifecycle composition. A single existing projection worker must own reads,
sync commits, account deletion, shutdown, and key erasure; the existing coordinator
must remain the only provider I/O owner; and the lifecycle owner must replace the
standalone retention/deletion/shutdown gates when activated. Adapter implementation
is complete; credential configuration, account connection, production composition,
and real ingestion remain separate approval gates.

The approved `GoogleOAuthRevoker` uses `POST https://oauth2.googleapis.com/revoke`
with the account-scoped protected refresh token in the form body, never the URL.
It accepts HTTP 200 and Google's exact `invalid_token` response as idempotent
success, because that code means the token is already expired or revoked. All
other outcomes are bounded and mapped to safe errors. The implementation follows
Google's current [desktop OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app)
and [revocation endpoint contract](https://developers.google.com/identity/openid-connect/reference#tokenrevoke).
It remains outside startup, disconnect composition, IPC, and UI and has never been
called with a real credential.

The approved `GoogleMailReadAdapter` uses fixed `gmail.googleapis.com` GET routes
for profile anchoring, 90-day message listing, full message reads, text MIME-body
reads, and incremental history. It receives only a short-lived access token from
an injected trusted-main source; OAuth refresh and client configuration remain
outside the adapter. Opaque versioned cursors preserve full-list pages, history
pages, and bounded offsets for large history records. Responses, text bodies,
identities, labels, recipients, and attachments are bounded before canonical use.
Only text MIME bodies are fetched; binary attachment bodies remain remote.

Normalization creates deterministic account-scoped local IDs, retains encrypted
provider provenance for later source opening, emits plain text rather than provider
HTML, and maps permanent or concurrent disappearance to batch-v2 tombstones.
Authentication, permission, quota, invalid-history, malformed-data, cancellation,
and transport outcomes remain typed and redacted. Official behavior is based on
Google's [full/partial synchronization guidance](https://developers.google.com/workspace/gmail/api/guides/sync),
[message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
and [history listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list).
The adapter uses injected deterministic HTTP in tests and has never contacted Gmail.

The matching `GoogleOAuthAccessTokenSource` now reads one account-scoped refresh
credential from `SecretVault` and exchanges it at the fixed Google token endpoint.
Its client ID and HTTP transport are injected; no production configuration exists.
It keeps the access token only in trusted memory, refreshes within a one-minute
expiry margin, shares one cancellable refresh per account, bounds time and response
bytes, refuses a returned scope set other than exact `openid`, `email`, and the
full `gmail.readonly` URI,
and exposes account invalidation plus teardown. Missing or `invalid_grant`
authorization is distinct from retryable storage/provider failure. Deterministic
tests use conspicuous tokens and no network.

## Desktop OAuth flow

Posita will use Google's installed-desktop application flow with Authorization
Code + PKCE and a temporary loopback redirect listener bound to the local host.
The system browser handles Google authentication. Posita must verify the OAuth
`state`, redirect origin, one-time code, and PKCE verifier before exchanging the
code in the main process.

The authorization code, verifier, state, and access token are memory-only and
short-lived. Only the refresh token is persisted, under the allow-listed name
`oauth.google.<opaque-account-id>.refresh-token`, through `SecretVault`.

One identity decision remains before this flow can implement the existing grant
contract. Gmail [`users.getProfile`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
under `gmail.readonly` returns the verified mailbox address, but the stable non-
reused Google `sub` identifier is an [OpenID claim](https://developers.google.com/identity/openid-connect/openid-connect).
Requesting it requires additional identity scopes (`openid` and `email`), while
reusing the email address as the hidden provider subject would weaken the accepted
identity split. Do not choose either path or change consent copy without explicit
owner approval.

## Scope progression

The first live sync requests only `gmail.readonly`. It is enough to read messages
and must be reviewed as a restricted Google scope before distribution.

Additional scopes are separate product capabilities and separate consent:

- Draft creation may later request `gmail.compose` only when that feature is
  implemented and the user explicitly enables it.
- `gmail.modify`, `mail.google.com`, sending, deletion, archive, and label changes
  are outside the first live-sync gate.

Posita never widens scopes silently. A new capability requires an ADR, updated
consent copy, provider-contract tests, and a fresh user authorization.

## Adapter contract

The Gmail adapter now lives in main-process infrastructure behind the existing
provider-independent application interface. It:

- namespace provider IDs by opaque Posita account ID,
- perform a bounded 90-day import and resumable history sync,
- normalize and validate Google payloads before domain use,
- be idempotent at a documented batch boundary,
- expose typed, redacted, retry-aware errors,
- never log provider payloads or credentials, and
- have a deterministic fake with redacted fixtures and no network dependency.

No Gmail SDK, OAuth response, credential, or provider-specific payload may cross
the preload bridge.

Gate 2D schema v4 now provides the encrypted application-side records needed for
future provider identity and cursor state. These records are versioned, runtime
validated, account-scoped, and main-process-only. They contain no live Google
identity or cursor and do not implement authorization or synchronization.

Gate 2D also defines the authorization-revoker interface used by account
disconnect. Revocation must be idempotent: an already revoked or absent grant is
success so a crash before journal advancement can retry safely. A real bounded
Google revoker is implemented behind that interface and tested through injected
deterministic HTTP, but it remains uncomposed. No Google request or credential is
configured, and the orchestrator has no UI/IPC trigger.

## Normalized record and account isolation

Before live sync, the shared mail contract must represent one canonical Posita
message rather than a Gmail-shaped message. At minimum it needs:

- stable internal ID and opaque Posita account ID,
- provider message and thread IDs namespaced by that account,
- sender and recipient identities,
- sent/received timestamps,
- subject plus normalized plain and reviewed HTML body representations,
- labels/read state and attachment metadata,
- immutable provider provenance needed to open the original source.

Raw Gmail response objects and unbounded provider metadata remain inside the
adapter. A credential, cursor, remote ID, or command for one account must never be
accepted under another account's authorization context. A future mutation derives
its target account from the validated source/draft command, not an arbitrary
renderer-selected credential.

## Sync ownership and source of truth

Exactly one trusted sync coordinator owns Gmail I/O. UI screens and AI features
may request a typed sync command or render sync status; they never call Gmail,
refresh tokens, or start per-screen fetch loops.

Gmail is authoritative for remote messages, threads, labels, and remote deletion.
The encrypted Posita cache is a resumable local projection. User corrections,
derived topics/briefs, local drafts, and confirmed pending commands have separate
ownership and must not be overwritten as if they were provider fields.

Each account sync is single-flight and transactionally commits a bounded batch
with its next cursor. Work is cancellable on shutdown, account disconnect, or
supersession. Cross-account concurrency is bounded and quota-aware.

## Deduplication, threading, and recovery

The canonical source identity is `(accountId, providerMessageId)`. Provider thread
IDs are also account-scoped. Replaying a page or history event is idempotent.

Messages that look alike across accounts—including forwarded or copied mail—stay
as separate source records with separate provenance. The topic layer may relate
them but never collapses their authorization or source identity. Content-hash
heuristics cannot be a destructive deduplication key.

Retry transient idempotent reads with bounded exponential backoff, jitter, and
Google retry guidance. Do not retry indefinitely. Authentication expiration,
permission revocation, quota exhaustion, offline state, malformed payloads, and
invalid history cursors are distinct typed failures. Cursor recovery uses a
documented bounded resync window and never silently wipes local corrections or
derived provenance.

The fixture-oriented shared `Message` type intentionally remains a sample-only
compatibility view and is not a provider contract. Posita will not invent Gmail
IDs or recipient metadata to migrate it. `GATE_2D_READINESS.md` keeps live Gmail
authorization and ingestion blocked until the new canonical records have an
encrypted atomic projection and complete local lifecycle. Schema v10 now settles
the sample-to-live rule: the first complete connection must atomically remove
samples and durably enter live mode, and later disconnects must never reseed them.
Production sync lifecycle and the remaining connection/disconnect activation
gates still require review.
