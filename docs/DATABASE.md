# Local Data Foundation

## Gate 2A objective

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
mutation is part of this gate.

## Database engine

Electron 43.4 embeds Node 24.18 and SQLite 3.53. Gate 2A uses the built-in
`node:sqlite` `DatabaseSync` API in the main process. This avoids a native npm
add-on and Electron ABI rebuilds. The synchronous API is acceptable for the
small bounded prototype snapshot; real sync and heavy indexing must move to a
worker or utility process before Gate 2 handles production-sized mailboxes.

Database construction uses defensive mode, a bounded busy timeout, foreign-key
enforcement, and extension loading disabled. File-backed databases use WAL;
tests use isolated in-memory databases.

## Schema version 1

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

## Migrations

Migrations are numbered, immutable, and applied in a transaction. Applied
versions are recorded in `schema_migrations`. Startup fails safely when a
database reports a newer schema version than the application understands.

A failed migration is rolled back. Gate 2A has no destructive migration and no
automatic downgrade. Future destructive transformations require a backup and
documented recovery path.

## Seeding and data ownership

The Gate 1 fixture dataset moves to `src/shared/fixtures.ts` so the trusted main
process can seed an empty database. Seeding is idempotent and occurs only when no
account exists. The UI labels the resulting snapshot as fixture data.

After seeding, the renderer never imports fixture data. It receives a versioned
snapshot from the application service, proving the same path that real local data
will use later.

## IPC contract

Gate 2A exposes exactly one read-only method:

```text
loadSnapshot({ version: 1 }) -> Result<AppSnapshotV1, AppErrorV1>
```

The main process validates the calling `webContents`, main frame, request shape,
and response. The sandboxed preload is fully bundled as one CommonJS file and
exposes only `loadSnapshot()`; it does not expose channel names or `ipcRenderer`.

Errors use stable codes and safe messages. Database paths, SQL, stack traces, and
raw provider content never cross the bridge.

## Verification

Gate 2A requires tests for:

- migration application and idempotence,
- unsupported future schema rejection,
- fixture seeding and reconstruction,
- duplicate-seed prevention,
- request and response validation,
- application error mapping,
- renderer loading, success, and retryable error states,
- the existing Daily Brief → source → draft flow through a fake data source.
