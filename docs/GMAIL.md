# Gmail Authorization Boundary

## Current status

Gmail is not connected and Posita does not yet contain a Google OAuth client ID.
This document is the contract for the next implementation gate; it does not
authorize live mailbox access.

Settings now renders a credential-free consent preview identified as
`google-gmail-readonly-v1`. The exact projection is carried through the existing
validated read-only application-state response and requests only `gmail.readonly`.
Its activation button is disabled. It creates no authorization state, PKCE
verifier, browser navigation, token, provider account, or consent receipt.

Gate 2D now defines the provider-independent main-process authorization-session
interface and a deterministic fake. The boundary accepts only the reviewed
`google-gmail-readonly-v1` consent and `gmail.readonly`, requires an HTTPS
authorization target and an explicit-port loopback callback, permits one pending
session, and models exact expiry, cancellation, callback rejection, and safe
provider failure. A validated successful result contains the provider subject and
refresh credential only inside the trusted main-process contract so a future
coordinator can move it directly into encrypted account state and `SecretVault`.

The fake uses conspicuous test-only values, performs no network or browser action,
and is not composed at startup. The real Google adapter, PKCE generation, loopback
listener, system-browser launch, code exchange, credential persistence, account
creation, preload/IPC command, and enabled UI action remain unimplemented.

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

## Desktop OAuth flow

Posita will use Google's installed-desktop application flow with Authorization
Code + PKCE and a temporary loopback redirect listener bound to the local host.
The system browser handles Google authentication. Posita must verify the OAuth
`state`, redirect origin, one-time code, and PKCE verifier before exchanging the
code in the main process.

The authorization code, verifier, state, and access token are memory-only and
short-lived. Only the refresh token is persisted, under the allow-listed name
`oauth.google.<opaque-account-id>.refresh-token`, through `SecretVault`.

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

The future Gmail adapter lives in main-process infrastructure behind a
provider-independent application interface. It must:

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
success so a crash before journal advancement can retry safely. The current build
uses deterministic test implementations only; no Google revocation request or
credential is configured, and the orchestrator has no UI/IPC trigger.

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
encrypted atomic projection and complete local lifecycle. The sample-to-live
transition, production sync lifecycle, and remaining connection/disconnect
activation gates still require review.
