# Privacy and Retention Policy

## Gate 2B boundary

Posita currently contains deterministic sample mail only. The SQLite sample
dataset is not encrypted and must never be replaced with personal mail. Real
mailbox ingestion remains disabled until the encrypted-cache and deletion
requirements in this document are implemented and tested.

Gate 2B implements one production security primitive: OAuth refresh credentials
can be stored in a main-process-only vault protected by Electron's asynchronous
`safeStorage` API. On macOS this uses Keychain, on Windows it uses DPAPI, and on
supported Linux desktops it uses the selected secret store. Posita fails closed
when asynchronous encryption is unavailable and rejects Linux `basic_text` and
`unknown` backends.

The deterministic fake protector is test-only. It demonstrates adapter behavior
and makes plaintext-persistence assertions possible; it provides no security and
must never be used by production composition code.

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

Retention configuration is deferred to Gate 3. A future setting may shorten the
window but must not silently lengthen an existing user's window.

## Encrypted-cache prerequisite

Before enabling real Gmail sync, sensitive SQLite values must use authenticated
envelope encryption:

1. Generate a random per-installation data-encryption key.
2. Protect that key with the OS-backed credential protector.
3. Encrypt every sensitive value with AES-256-GCM, a unique nonce, and bound
   associated data identifying its table, field, and record.
4. Store only versioned ciphertext envelopes in SQLite.
5. Test tamper detection, key loss, migration, deletion, backup sidecars, and the
   absence of plaintext across the database, WAL, and temporary files.

Search or indexing must not introduce a second plaintext copy. Real ingestion is
blocked until this prerequisite passes the canonical verification gate.

## User-visible consent

The connect flow must explain the selected Gmail permissions, 90-day local
window, local encryption, AI-processing boundary, disconnect behavior, and the
fact that Posita cannot send or modify mail without a separate confirmed action.
Consent is versioned and auditable without storing addresses or message content.
