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
content, or arbitrary error text. No deletion action executes yet.

Gate 2D now implements deterministic 90-day maintenance as an unscheduled
application service. It requires an absolute source timestamp, retains the exact
cutoff boundary, and fails before mutation if metadata is missing or invalid.
Expired source records and every topic/brief that depends on them are replaced in
one encrypted-cache transaction, followed by SQLite sanitization. This never
modifies Gmail. Automatic/background execution and user-visible status remain
deferred.

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
still blocked until 90-day maintenance and account-disconnect deletion operate on
the encrypted record model. Hardware-level forensic erasure is outside Posita's
control; key deletion provides cryptographic erasure.

## User-visible consent

The connect flow must explain the selected Gmail permissions, 90-day local
window, local encryption, AI-processing boundary, disconnect behavior, and the
fact that Posita cannot send or modify mail without a separate confirmed action.
Consent is versioned and auditable without storing addresses or message content.
