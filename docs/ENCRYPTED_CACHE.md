# Encrypted Private-Data Cache

## Gate 2C objective

Gate 2C moves all sample source and derived mail data out of plaintext SQLite
columns and into versioned authenticated ciphertext records. It establishes the
storage boundary required before real Gmail ingestion, but it does not connect
Gmail or make the current fixture content live.

## Threat model

The encrypted cache is designed to protect mailbox content when an attacker
obtains Posita's SQLite database, WAL, shared-memory sidecar, backup, or temporary
files without access to the signed-in operating-system account and its protected
storage key.

It protects confidentiality and tamper detection for cached source content and
derived private data at rest. It does not protect against:

- a compromised operating system or process while Posita is running,
- malware able to read Posita memory or use the signed-in user's keychain,
- content intentionally displayed in the renderer or captured from the screen,
- swap, hibernation, filesystem snapshots, or SSD remanence outside Posita's
  control,
- malicious provider payloads before boundary validation,
- attachments, because attachment ingestion is not implemented.

SQLite cleanup and tests prevent application-visible plaintext in the database
and sidecars. They are not a forensic secure-erasure claim for storage hardware.
The strongest deletion guarantee is cryptographic erasure by deleting the
OS-protected data key, combined with SQLite record deletion and compaction.

## Key hierarchy

Posita generates one random 256-bit data-encryption key per installation. The
raw key is encoded only long enough to pass through the main-process
`SecretVault`, where asynchronous Electron `safeStorage` protects it under the
allow-listed name `cache.installation.data-key-v1`.

The key is never exposed through IPC, logged, committed, or stored in plaintext.
If encrypted records exist but the protected key is missing or invalid, startup
fails closed. Posita must not generate a replacement key over unreadable data.

## Envelope version 1

Each record payload is canonical JSON encrypted independently with AES-256-GCM:

```text
magic "PSTA" | version 0x01 | 12-byte nonce | 16-byte tag | ciphertext
```

Every encryption uses a cryptographically random unique 96-bit nonce. The
authenticated associated data is a canonical JSON array containing:

```text
Posita cache protocol, envelope version, table, field,
record type, record ID, account scope, display position
```

Changing ciphertext or any bound metadata causes decryption to fail. Plaintext
and envelope sizes are bounded before allocation. Unknown versions, malformed
headers, wrong keys, wrong metadata, and invalid JSON fail with typed internal
errors that do not cross IPC as raw cryptographic details.

## Schema version 3

`encrypted_records` contains only:

- allow-listed record type,
- opaque record ID,
- optional opaque account scope,
- display position,
- envelope scheme and ciphertext,
- non-sensitive timestamps.

Accounts, people, messages, topics (including their timeline and relationships),
and brief items are stored as separate encrypted JSON records. The existing
normalized v1 tables remain as an empty legacy migration surface and must never
receive real mail.

`encrypted_cache_state` records whether post-migration sanitization is pending or
complete. Startup resumes sanitization before reading the cache after an
interruption.

## Schema version 4

`encrypted_account_records` extends the same envelope and key hierarchy to two
future-provider records: `provider-account` and `sync-state`. Their payloads are
versioned and runtime validated before use. Provider subject IDs, consent data,
sync cursors, success timestamps, and typed failure state are ciphertext. The
allow-listed record kind and opaque Posita account scope are queryable and bound
as associated data.

The account-state repository is main-process-only and is composed at startup with
the existing cache protector. It stores no real account yet and does not authorize,
sync, poll, disconnect, or expose anything over IPC.

## Schema version 5 operational exception

The lifecycle journal is intentionally not an encrypted private-data record. It
contains only opaque IDs, allow-listed phases, and safe error codes and must remain
readable if a delete-local-data workflow has already erased the installation key.
ADR-012 defines this narrow exception. Private account state, provider identity,
cursors, source mail, and derived content remain encrypted.

## Retention rewrite

Gate 2D retention prepares a complete validated set of new encrypted envelopes
before mutation. One transaction replaces expired source and dependent derived
records and marks sanitization pending. The existing recovery path compacts SQLite,
truncates WAL, and marks the cache ready. A failed validation or encryption before
the transaction leaves the previous cache unchanged. Maintenance is not scheduled
or exposed over IPC yet.

Account-data removal uses this same validated rewrite rather than issuing
independent record deletes. This keeps removal of account sources, touched derived
objects, and unreferenced people atomic. The disconnect orchestrator invokes the
rewrite at `mail-data-delete-pending` and performs storage sanitization only after
the journal advances to `compaction-pending`.

## Legacy fixture migration

For an existing Gate 2B database:

1. Apply schema version 3 without altering legacy rows.
2. Load and validate the complete fixture dataset.
3. Encrypt every record before beginning the write transaction.
4. Insert all ciphertext, delete legacy rows in dependency order, and mark
   sanitization pending in one transaction.
5. Enable SQLite secure deletion, truncate WAL, compact with `VACUUM`, truncate
   WAL again, and mark the cache ready.

Forward-looking legacy tables must be empty. Migration fails rather than silently
discarding unexpected sync, derived, correction, or audit data.

New installations seed fixtures directly into encrypted records and never write
mail plaintext to SQLite.

## Query and search boundary

Gate 2C decrypts the small bounded snapshot in the trusted main process and then
validates the reconstructed domain dataset. It creates no plaintext search index.

Production-scale search is unresolved. A future design must explicitly evaluate
decrypt-and-scan in a worker, keyed blind indexes with leakage tradeoffs, and
encrypted local search alternatives. It requires a separate ADR and threat-model
update before implementation.

## Deletion boundary

The repository separates logical encrypted-record deletion from SQLite
sanitization. Full deletion journals removal of refresh credentials and encrypted
account state, deletes all mail/derived ciphertext, compacts SQLite and truncates
WAL, then deletes `cache.installation.data-key-v1` from the OS-protected vault and
destroys the live protector key. Repeating any action after a journal-write crash
is safe, and key deletion is deliberately last.

The orchestrator is not composed into the product. Startup recovery must first be
able to finish `data-key-delete-pending` without creating a replacement key, and
the fixture bootstrap must not reseed after a user deletion. No real account may
connect until those activation boundaries and explicit consent/status are tested.
