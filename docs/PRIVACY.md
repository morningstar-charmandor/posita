# Privacy and Retention Policy

## Gate 2D boundary

Posita currently contains deterministic sample mail only. Gate 2C stores that
dataset as independently authenticated encrypted records and migrates existing
fixture databases away from plaintext. Real mailbox ingestion remains disabled
until account-scoped retention, disconnect, and deletion orchestration are
implemented and tested. Gate 2D has started by encrypting and validating the
future provider-account identity and sync-state records; no real account exists.

Gate 2B implements one production security primitive: OAuth refresh credentials
can be stored in a main-process-only vault protected by Electron's asynchronous
`safeStorage` API. On macOS this uses Keychain, on Windows it uses DPAPI, and on
supported Linux desktops it uses the selected secret store. Posita fails closed
when asynchronous encryption is unavailable and rejects Linux `basic_text` and
`unknown` backends.

The deterministic fake protector is test-only. It demonstrates adapter behavior
and makes plaintext-persistence assertions possible; it provides no security and
must never be used by production composition code.

Gate 2C generates a separate random 256-bit installation data key, protects it
through the OS-backed vault, and uses AES-256-GCM for source and derived record
payloads. See `ENCRYPTED_CACHE.md` for the threat model and explicit limits.

## Data classes

| Class | Examples | Storage rule |
| --- | --- | --- |
| Credentials | OAuth refresh token | OS-protected vault only; main process only |
| Ephemeral credentials | OAuth authorization code, PKCE verifier, access token | Main-process memory only; never persisted |
| Source mail | Addresses, headers, subject, body, attachments | Encrypted local cache before real ingestion |
| Derived private data | Topics, summaries, drafts, embeddings, corrections | Encrypted local cache with source provenance |
| Operational data | Opaque account ID, migration version, safe error code | Plaintext only when it cannot reveal mailbox content |

No credential, source mail, derived private data, prompt, or embedding is
permitted in logs, telemetry, crash breadcrumbs, fixtures, or committed files.

## Private-alpha retention defaults

These defaults settle the Gate 2 product decision and must be visible before the
first mailbox is connected:

- The initial import is limited to messages received in the previous 90 days.
- Cached source mail follows a rolling 90-day window. Content outside that window
  is removed locally during maintenance; Gmail is not modified.
- Derived artifacts whose cited sources are removed are deleted in the same
  maintenance transaction. Posita must not retain an uncited summary as memory.
- OAuth refresh credentials remain only while an account is connected. Access
  tokens remain in memory and expire normally.
- Disconnecting an account revokes local use, deletes its vault credential, sync
  cursor, cached source mail, and account-scoped derived data. It never deletes
  or changes mail in Gmail.
- “Delete local data” removes every local mailbox cache and derived artifact while
  leaving the application and remote mailboxes intact.

If deletion cannot complete, Posita must disable that account, show a retryable
safe error, and retain a local deletion-pending marker. It must not report a
successful disconnect or reconnect in the background.

Schema v5 implements the persistence boundary for that marker. The journal stores
only opaque IDs, allow-listed phases, and safe error codes. It deliberately stays
outside the installation data-key boundary so deletion can resume after key loss;
it never stores provider identity, addresses, cursors, credentials, mail, derived
content, or arbitrary error text.

Gate 2D now implements deterministic 90-day maintenance as an unscheduled
application service. It requires an absolute source timestamp, retains the exact
cutoff boundary, and fails before mutation if metadata is missing or invalid.
Expired source records and every topic/brief that depends on them are replaced in
one encrypted-cache transaction, followed by SQLite sanitization. For a file-backed
cache, checkpoints and `VACUUM` execute in a dedicated worker thread. This never
modifies Gmail. Automatic/background execution and user-visible status remain
deferred.

Historical encrypted sample caches receive one narrow startup compatibility
upgrade. Posita replaces them only when every timestamp is absent and all other
data exactly matches the known deterministic fixture dataset. The replacement
uses current absolute fixture timestamps; it does not derive dates from display
labels. Mixed, edited, partial, and unknown caches fail before mutation. This rule
cannot be applied to real provider data.

Gate 2D also implements the local source/derived projection for removing one
account. Other accounts' source messages are never deleted merely because they
shared a topic. Any topic touched by the removed account is deleted rather than
retaining a possibly stale or uncited interpretation; untouched topics and still
referenced people remain. The projection is idempotent and is the local mail-data
phase used by the disconnect orchestrator.

The Gate 2D disconnect orchestrator now connects these local phases at the
application layer: authorization revocation, refresh-credential deletion,
encrypted provider-state deletion, account source/derived removal, and SQLite
sanitization. It persists the next phase only after an idempotent action succeeds
and retains a safe error on failure. There is no live revocation adapter, account,
background resumer, or user trigger, so this is verified orchestration rather than
an active disconnect feature.

The installation-wide deletion orchestrator now removes all stored Google refresh
credentials, encrypted provider state, encrypted mail and derived records, SQLite
remnants, and finally the OS-protected installation key and its in-memory copy.
Every phase is retryable and journaled after success; durable pending work prevents
overlap with account disconnect. Startup now resumes this workflow before key
bootstrap using deletion-only operations. A completed marker prevents later key
recreation and fixture reseeding. This remains non-user-triggerable: user-facing
account disconnect and every remote mutation remain deferred. Full local deletion
is user-triggerable through Settings & privacy. Preparing it creates only a bounded
in-memory challenge; exact confirmation is bound to one operation and the trusted
window that received it. Pending, retry-required, recovery-required, and deleted
states are visible.

ADR-016 now implements the pre-command confirmation boundary. A challenge expires
after five minutes, requires the exact text `DELETE LOCAL DATA`, is bound to one
generated operation ID, and is held only in bounded memory until confirmed. The
database receipt contains opaque IDs, action type, and timestamps; it does not
contain the entered text, account identity, mail, credentials, or arbitrary copy.
An existing journal operation can be resumed after confirmation expiry, but the
recovery entry point cannot create new destructive work. Safe status projection is
available only through the validated read-only application-state query. The typed
phrase crosses the narrow execute boundary but is not logged or persisted.

Receipt cleanup runs at startup after lifecycle recovery. A receipt is removed
only when it is strictly expired and no incomplete local-deletion journal refers
to its operation. The exact expiry boundary is retained, as is an expired receipt
needed to bind an in-process retry of already-authorized work. Completed or
unstarted expired receipts are eligible for deterministic removal; cleanup never
touches Gmail or encrypted mailbox content.

Recovery never decrypts content and succeeds even when the protected data key is
already absent. Cancellation leaves the current journal phase available for the
next restart. Conflicting lifecycle state fails closed rather than choosing which
destructive operation to trust. Pending disconnect is not automatically resumed
until a real idempotent authorization revoker exists.

Sanitization is a non-interruptible lifecycle phase: Posita records progress
before it starts and observes shutdown cancellation at the next phase boundary.
Worker failures expose only a stable safe code and leave the durable operation
available for retry. No private content, database path, or raw worker error is
sent to the renderer or written to lifecycle state.

Retention configuration is deferred to Gate 3. A future setting may shorten the
window but must not silently lengthen an existing user's window.

## Encrypted-cache implementation

Gate 2C implements the authenticated envelope requirements:

1. Generate a random per-installation data-encryption key.
2. Protect that key with the OS-backed credential protector.
3. Encrypt every sensitive value with AES-256-GCM, a unique nonce, and bound
   associated data identifying its table, field, and record.
4. Store only versioned ciphertext envelopes in SQLite.
5. Test tamper detection, key loss, migration, deletion, sidecars, and the absence
   of known plaintext across application-visible database files.

Search or indexing must not introduce a second plaintext copy. Real ingestion is
still blocked until lifecycle recovery and consent safely activate the verified
retention and deletion services. Hardware-level forensic erasure is outside
Posita's control; key deletion provides cryptographic erasure.

## User-visible consent

The connect flow must explain the selected Gmail permissions, 90-day local
window, local encryption, AI-processing boundary, disconnect behavior, and the
fact that Posita cannot send or modify mail without a separate confirmed action.
Consent is versioned and auditable without storing addresses or message content.

Gate 2D now exposes the reviewed `google-gmail-readonly-v1` consent contract in
the existing read-only application state. Settings shows the exact read-only
scope, rolling 90-day window, local encryption boundary, inactive AI provider,
and disconnect outcome. It also states that Gmail is not connected. The contract
is runtime validated as an exact shape, and the authorization control is disabled;
no consent acceptance, OAuth client, credential, browser flow, or account record
is created by viewing it.

The authorization-session contract remains main-process-only and explicitly marks
its successful refresh credential as a value that must move directly into
`SecretVault`. Its authorization URL, callback, provider subject, and credential
have no renderer or persistence surface in this milestone. The deterministic fake
contains only test fixtures, performs no external action, and is not production
composition. Real credential handling still requires separate approval and
end-to-end composition review.

The credential-free account-connection coordinator now proves the only accepted
cross-store write order: vault credential first, encrypted provider-account state
second. It preflights both stores, refuses partially existing state, and performs
reverse cleanup if provider-state persistence fails. It never returns a refresh
credential, and deterministic tests verify that an ambiguous state write leaves
neither record. If cleanup itself fails, the service reports a stable recovery-
required condition instead of claiming connection or silently overwriting data.
No production token or account has passed through this code.
