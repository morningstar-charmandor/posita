# Local Data Foundation

## Gate 2A–2D local storage foundation

Gate 2A replaces the renderer's direct fixture import with a real local data
path while keeping all content simulated:

```text
React renderer
  -> versioned Posita preload method
  -> validated read-only IPC request
  -> application service
  -> MailRepository interface
  -> SQLite repository
```

No Gmail, OAuth, keychain, model provider, background sync, or remote mailbox
mutation is connected. Gate 2B adds a production credential-storage boundary but
does not store a real credential or authorize Gmail access.

Gate 2C moves fixture source and derived data into authenticated encrypted records
and scrubs the legacy plaintext rows. Gmail remains disconnected.

## Database engine

Electron 43.4 embeds Node 24.18 and SQLite 3.53. Gate 2A uses the built-in
`node:sqlite` `DatabaseSync` API in the main process. This avoids a native npm
add-on and Electron ABI rebuilds. The synchronous API is acceptable for the
small bounded prototype snapshot; real sync and heavy indexing must move to a
worker or utility process before Gate 2 handles production-sized mailboxes.

Database construction uses defensive mode, a bounded busy timeout, foreign-key
enforcement, and extension loading disabled. File-backed databases use WAL;
tests use isolated in-memory databases.

## Schema versions

Schema version 1 contains the local mail foundation.

Normalized source and projection tables:

- `accounts`
- `people`
- `messages`
- `topics`
- `topic_participants`
- `topic_messages`
- `timeline_events`
- `brief_items`
- `brief_citations`

Forward-looking ownership tables, initially empty:

- `sync_state` for provider cursors per account,
- `derived_artifacts` for versioned AI-derived data and provenance,
- `user_corrections` for explicit human overrides,
- `audit_events` for confirmed mailbox mutations.

All tables are `STRICT`. Foreign keys are enabled. Ordering that affects the UI
is explicit rather than relying on insertion order.

Schema version 2 adds `protected_secrets`. It stores an allow-listed logical
credential name, protection-scheme identifier, OS-protected ciphertext, and
timestamps. The vault is main-process-only and is deliberately absent from IPC.
Credential plaintext is never written to SQLite.

The legacy sample-mail tables previously contained plaintext fixtures. They are
not approved for personal mail and remain empty after Gate 2C migration.

Schema version 3 adds `encrypted_records` and `encrypted_cache_state`. Private
record payloads use versioned AES-256-GCM envelopes. Only opaque IDs, allow-listed
record types, account scope, ordering, envelope scheme, and timestamps remain
queryable. All queryable metadata is authenticated with the ciphertext.

`encrypted_cache_state` makes the post-migration sanitization step resumable.
`sanitization-pending` forces WAL truncation, `VACUUM`, another WAL truncation,
and transition to `ready` before the cache can be treated as migrated.

Schema version 4 adds `encrypted_account_records` for the future provider-account
identity and incremental sync state. The versioned payload contains the provider
subject ID, consent version, connection timestamp, cursor, last success, and typed
safe failure code as applicable. Payloads use the existing authenticated cache
envelope and installation key. Only an allow-listed record kind and opaque Posita
account scope remain queryable; no address, provider subject, or cursor is stored
in plaintext.

Schema version 5 adds `account_lifecycle_operations`, a deliberately non-sensitive
crash-resume journal. It contains only a contract version, opaque operation ID,
allow-listed operation and phase, optional opaque account scope, safe error code,
and timestamps. Operation-specific database checks prevent disconnect and
installation-wide deletion phases from being mixed. Incomplete entries cannot be
removed through the repository. The journal is not encrypted with the installation
data key because it must remain readable after that key is deleted.

Schema version 6 adds nullable `messages.received_at_iso` only to the empty legacy
migration surface so newly seeded compatibility fixtures survive the controlled
plaintext-to-encrypted migration with an absolute source timestamp. Current
encrypted message JSON also carries this optional compatibility field. Retention
requires it and fails closed when a cache does not contain it; presentation labels
are never parsed as dates. Normal startup now upgrades only the exact historical
fixture dataset when every message lacks the field. It uses the existing encrypted
replacement and sanitization transaction, refuses mixed or changed datasets, and
does not run while account disconnect is pending. This adds no schema version.

Schema version 7 adds `local_action_confirmations`. It stores only contract
version, opaque confirmation and operation IDs, the allow-listed
`delete-local-data` action type, and confirmation/expiry timestamps. The entered
confirmation text is never persisted. Unique operation binding prevents one
confirmation from being reassigned to another destructive command. These records
are operational audit evidence, not encrypted mailbox content. After lifecycle
recovery, startup deletes records strictly before the current expiry boundary only
when no incomplete delete-local-data operation has the same operation ID. The
single SQL deletion is idempotent and preserves pending retries. No new schema is
required.

Retention replacements validate and encrypt the complete next dataset before
opening a write transaction. Source messages, derived topics, brief items, and
unreferenced people are replaced atomically. The transaction records
`sanitization-pending`. Logical replacement and sanitization are separate
repository methods: retention invokes both in one application operation, while
disconnect journals `compaction-pending` between them. Compaction and WAL
truncation complete before state returns to `ready`, and startup recovery handles
an interruption.

Account-data removal reuses the same replacement boundary. The application layer
computes retained accounts, source messages, untouched derived topics/briefs, and
referenced people before the repository encrypts anything. No account-removal SQL
path exists outside this repository transaction.

Installation-wide deletion uses narrower idempotent repository primitives. It
deletes every encrypted account-state row, deletes all encrypted mail records while
marking sanitization pending, and advances the lifecycle journal before running
compaction. Only after SQLite reaches `ready` does it delete the OS-protected data
key and destroy the shared in-memory encryption context. The non-sensitive journal
remains available to record completion.

Startup applies schema migrations and inspects the lifecycle journal before any
cache-key load/create call. A pending installation deletion uses raw deletion-only
SQLite helpers and vault erasure, so it does not need a protector or readable key.
After completion, the retained journal marker selects `local-data-deleted` mode;
normal encrypted repository construction and fixture seeding are skipped on that
startup and every later restart. Conflicting pending lifecycle rows fail closed.

## Migrations

Migrations are numbered, immutable, and applied in a transaction. Applied
versions are recorded in `schema_migrations`. Startup fails safely when a
database reports a newer schema version than the application understands.

A failed schema migration is rolled back. The Gate 2C application migration
encrypts every validated record before one transaction inserts ciphertext,
deletes legacy rows, and marks sanitization pending. Unexpected sync, derived,
correction, or audit rows block automatic migration rather than being discarded.
There is no automatic downgrade.

## Seeding and data ownership

The Gate 1 fixture dataset lives in `src/shared/fixtures.ts`. New installations
seed it directly as encrypted records; existing databases migrate it once.
Seeding is idempotent. The UI labels the snapshot as fixture data.

After seeding, the renderer never imports fixture data. It receives a versioned
snapshot from the application service, proving the same path that real local data
will use later.

## IPC contract

The renderer boundary exposes exactly one read-only application-state method:

```text
loadApplicationState({ version: 1 })
  -> Result<ApplicationStateV1, AppErrorV1>
```

The main process validates the calling `webContents`, main frame, request shape,
and response. In ready mode the response composes the fixture-backed mail snapshot
with the safe lifecycle-status projection. Deleted and recovery-required modes do
not carry mail data. The sandboxed preload is fully bundled as one CommonJS file
and exposes `loadApplicationState()` without exposing channel names or
`ipcRenderer`.

Gate 2D adds one separately authorized local-deletion capability:

```text
prepareLocalDataDeletion({ version: 1, action: "delete-local-data" })
  -> Result<LocalDataDeletionChallengeV1, LocalDataDeletionErrorV1>

executeLocalDataDeletion({ version: 1, opaque IDs, exact enteredText })
  -> Result<ExecuteLocalDataDeletionResultV1, LocalDataDeletionErrorV1>
```

Preparation performs a read-only lifecycle preflight and creates only an in-memory,
five-minute challenge. Execution is bound to the trusted window that received the
challenge and persists the non-private receipt before creating deletion work. The
entered phrase is never persisted. Neither method can target Gmail messages or any
provider mailbox mutation.

Errors use stable codes and safe messages. Database paths, SQL, stack traces, and
raw provider content never cross the bridge.

## Verification

The local-data and credential foundation requires tests for:

- migration application and idempotence,
- unsupported future schema rejection,
- fixture seeding and reconstruction,
- duplicate-seed prevention,
- request and response validation,
- application error mapping,
- renderer loading, success, and retryable error states,
- the existing Daily Brief → source → draft flow through a fake data source,
- credential namespace validation, protected round trips, replacement, deletion,
  unsupported schemes, unavailable OS protection, and absence of plaintext,
- envelope versioning, unique nonces, associated-data binding, tamper detection,
  wrong/missing/corrupt key failures, and bounded input,
- transactional legacy migration, interruption recovery, unexpected-data refusal,
  database/WAL/sidecar plaintext scans, and compacted ciphertext deletion.
- encrypted provider-account and sync-state round trips, replacement, account
  isolation, metadata authentication, scoped deletion, and invalid-state refusal.
- lifecycle phase persistence, safe retry errors, pending-operation recovery,
  immutable operation identity/scope, completion-only cleanup, and v3 upgrades.
- exact retention cutoff behavior, missing/invalid timestamp refusal, derived
  citation eviction, unreferenced-person cleanup, idempotence, exact legacy-fixture
  recognition, ambiguous-cache refusal, restart upgrade, atomic encrypted
  replacement, rollback on invalid data, and sanitization completion.
- account-scoped source deletion, touched-derived eviction, unaffected source and
  topic preservation, people recomputation, invalid IDs, and idempotent retries.
- ordered disconnect completion, action failures at every phase, journal-write
  crashes after every successful action, operation conflicts, and single flight.
- ordered installation deletion, action and journal-write failures at every phase,
  durable lifecycle exclusion, complete account-state removal, logical deletion
  status, compaction, OS-vault key erasure, and in-memory key destruction.
- exact-text confirmation, expiry, operation binding, idempotent confirmation
  persistence, authorization failure, confirmation-free recovery of existing work,
  recovery refusal to create work, exact-boundary receipt cleanup, pending-operation
  preservation, cleanup failure, and bounded safe lifecycle-status projection.
- pre-key-bootstrap recovery with a missing key, repeated deleted-mode restart,
  no fixture reseed or replacement key, terminal-phase completion, cancellation,
  conflicting-journal refusal, and keyless deletion-adapter behavior.
