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

Provider-account payload version 1 now binds `consentVersion` to the exact reviewed
string `google-gmail-readonly-v1`, matching the shared consent and authorization
contracts. The table is known to contain no real or fixture provider account, so
this is a fail-closed contract correction rather than a data migration. A stale
simulated payload using the obsolete numeric value is rejected instead of guessed
or silently rewritten.

The credential-free account-connection coordinator treats this repository as the
second half of a cross-store commit. It writes the protected refresh credential
first, then this encrypted provider-account record. If the record write fails or
may have committed, it deletes account state before deleting the credential. A
cleanup failure is explicit recovery-required state, never a successful
connection. This behavior is deterministic application testing only; no account
record or production credential is created by startup.

A read-only consistency query now compares provider-account record presence with
protected-credential presence for one opaque account. It never decrypts either
payload, and it returns no provider identity or secret. `provider-state-only` and
`credential-only` remain fail-closed diagnostic states; no migration, automatic
repair, or silent deletion is attached to the query.

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
truncates WAL, and marks the cache ready. File-backed sanitization is executed by
one single-flight worker-thread adapter through a bounded versioned protocol; the
inline adapter exists only for in-memory tests and legacy migration. A failed
validation or encryption before
the transaction leaves the previous cache unchanged. Maintenance is not scheduled
or exposed over IPC yet.

Startup also uses this existing rewrite for one fixture-only compatibility case.
If every message timestamp is absent and the full decrypted dataset otherwise
equals the known historical fixtures, Posita replaces it with the current
timestamped fixture dataset and sanitizes storage. Any mixed timestamp state,
content edit, missing record, extra record, or other mismatch is refused before
mutation. Pending account disconnect bypasses this check so startup cannot restore
data already removed by lifecycle work.

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

The sanitizer is an async application contract rather than a repository method.
For a file database it opens a separate connection in a Node worker and maps any
worker or protocol failure to one safe retryable error. One adapter permits only
one active sanitization promise. The operation is intentionally not terminated
mid-`VACUUM`; lifecycle cancellation is honored between durable phases.

The recovery-only orchestrator is composed before key bootstrap. It can finish any
full-deletion phase when the key is already absent, and a completed journal marker
prevents later key generation and fixture reseeding. The user command is separately
composed only in ready mode and uses the live protector-destruction path; recovery
never uses that path or creates new work. No real account may connect until explicit user-facing consent/status and the
remaining lifecycle activation boundaries are tested.

Starting a new full deletion now requires a short-lived operation-bound
confirmation receipt. Resuming a journaled deletion is a separate capability and
cannot create an operation. The receipt and safe lifecycle status contain no
mailbox content and remain outside the deletable key boundary. The renderer sees
only bounded challenge/status fields and stable errors through validated IPC.

Account-connection recovery reuses the existing account-scoped provider/sync-state
deletion when those encrypted records are the only remaining half of a confirmed
connection pair. It never decrypts or reconstructs missing data, never touches a
different account, and verifies the presence-only result is `absent`. Schema v8
stores only bounded operational confirmation metadata outside encrypted private
records. Its exact receipt is atomically consumed before encrypted account-state
deletion and cannot be replayed. The approved ready-mode Settings composition
invokes this policy only through same-window, separately validated prepare and
execute methods. It adds no plaintext mailbox index, provider request, schema,
dependency, or access to a different account scope.
