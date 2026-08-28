# Posita

**Your inboxes, understood as one.**

Posita is a desktop-first personal mail hub organized around people, topics,
context, and actions rather than separate inboxes.

Public repository: [github.com/morningstar-charmandor/posita](https://github.com/morningstar-charmandor/posita)

## Current status

Gate 2D is in progress on top of the encrypted local-data prototype. Posita
includes a Daily Brief,
topic timeline with source citations, original-message inspection, a unified
classic mail view, and an editable draft flow. Realistic fixture data is seeded
idempotently as independently authenticated AES-256-GCM records in a versioned
local SQLite database and loaded through validated, read-only Electron IPC. A
per-installation data key is protected by the operating-system vault. Schema v4
adds versioned encrypted provider-account and sync-state records with strict
account isolation; those tables contain no real account. Schema v5 adds an opaque,
non-sensitive lifecycle journal that can survive deletion of that encryption key.
Schema v6 and a deterministic application service add fail-closed 90-day
retention with atomic derived-data eviction; it is not scheduled automatically.
Startup upgrades only an exact historical fixture cache whose messages all lack
absolute timestamps. It replaces that known simulated dataset with the current
timestamped encrypted fixtures and refuses mixed, edited, partial, or unknown data.
Schema v7 stores only opaque, operation-bound confirmation receipts for destructive
local deletion; the typed confirmation text is never persisted. Startup removes
strictly expired receipts unless their deletion operation is still pending, so a
safe in-process retry cannot lose its authorization binding.
Account removal now deterministically preserves unaffected sources while evicting
touched derived context. A crash-resumable disconnect orchestrator now coordinates
revocation, credential deletion, provider-state deletion, local-data removal, and
compaction through interfaces and deterministic tests. A separate installation-wide
orchestrator now journals deletion of all refresh credentials, encrypted account
state, mail records, SQLite remnants, the OS-protected data key, and its in-memory
copy. Account disconnect remains non-user-triggerable because there is no live
Google revoker. Full local deletion is now available under Settings & privacy
through separate prepare and execute IPC methods. Execution requires a five-minute
typed confirmation bound to one operation, and pending journal state has a bounded
safe-status projection. One validated read-only application-state query now
renders pending, retry-required, recovery-required, and completed local-deletion
outcomes. No other lifecycle command is exposed. Gmail and AI providers
are not connected, no real OAuth credential exists, and sending is deliberately
disabled.

Settings now includes a validated `google-gmail-readonly-v1` connection-consent
preview. It explains the planned `gmail.readonly` scope, 90-day encrypted local
window, inactive AI-provider boundary, and disconnect behavior. The connect action
is intentionally disabled: no Google OAuth client, credential, or live account is
configured.

The trusted backend now defines a bounded provider-independent authorization
session contract and deterministic fake for credential-free testing. It validates
the reviewed consent, read-only scope, HTTPS authorization target, loopback
callback, expiry, cancellation, and safe failures. Nothing composes this adapter
into startup or exposes it through preload, IPC, Settings, or a browser.

A trusted account-connection coordinator now composes that interface with the
existing vault and encrypted account-state contracts in credential-free tests.
It preflights duplicate or inconsistent state, stores a successful refresh grant
in the vault before provider identity, and removes both on an ambiguous state
write. Cleanup failure becomes an explicit recovery-required error. The service
is not production composition and has no renderer, browser, network, or real-token
path.

The same coordinator now provides a main-process-only, versioned consistency
inspection for one opaque account. It reports only `absent`, `connected`,
`credential-only`, or `provider-state-only`. A new vault presence query checks
for protected credential existence without decrypting or re-protecting it. No
repair, deletion, startup check, IPC response, or UI status is activated.

The approved local recovery policy and its dedicated durable confirmation producer
are implemented as trusted, uncomposed services. Schema v8 stores only opaque,
short-lived account/status-bound recovery receipts; the exact typed challenge text
is never persisted. Recovery refuses complete
or already-absent connections, rechecks for stale state, and deletes exactly the
orphaned credential or encrypted provider/sync state. Success returns the account
to `absent` and requires a fresh connection. Both services remain outside startup,
preload, IPC, and UI, so they cannot affect local data in the running build.

Startup now has one cancellable lifecycle-recovery owner. If a full deletion is
journaled, it resumes through deletion-only SQLite and vault operations without
loading or creating the encryption key. A completed marker keeps later restarts
in `local-data-deleted` mode and prevents fixture reseeding. Pending account
disconnect remains inactive because no live authorization revoker exists.
File-backed retention, fixture compatibility, disconnect, and deletion sanitization now run
through one single-flight worker-thread adapter, keeping `VACUUM` and WAL
checkpoint work off Electron's main event loop. Bounded in-memory tests retain an
explicit inline adapter; the existing one-time legacy plaintext migration remains
inline so its migration transaction keeps one connection owner.

Preparing local deletion only returns bounded consequence copy and two opaque IDs;
it creates no deletion journal. The execute request is accepted only from the same
trusted window after exact `DELETE LOCAL DATA` confirmation. It removes Posita's
local fixture cache, stored Posita credentials, and encryption key, but never
deletes or changes provider mail.

Read the build boundaries before extending the prototype:

- [Agent contract](AGENTS.md)
- [Machine-readable project map](project.agent.json)
- [Continuity handoff](docs/HANDOFF.md)
- [Project history](docs/PROJECT_HISTORY.md)
- [Portfolio case study](docs/CASE_STUDY.md)
- [MVP scope](docs/MVP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision log](docs/DECISIONS.md)
- [Local data foundation](docs/DATABASE.md)
- [Privacy and retention](docs/PRIVACY.md)
- [Encrypted cache](docs/ENCRYPTED_CACHE.md)
- [Gmail authorization boundary](docs/GMAIL.md)
- [AI-agent-friendly engineering](docs/ENGINEERING.md)
- [Original product vision](product-spec.md)

## Run locally

Prerequisites: Node.js 24.18.x and npm 11.16.x.

```bash
npm install
npm run dev
```

## Verification

The canonical completion gate is:

```bash
npm run verify
```

It checks repository structure and security boundaries, type safety, automated
behavior, and the production bundle without requiring credentials or network
access.

## Branch workflow

- `main` contains stable verified checkpoints.
- `staging` is the persistent integration branch for ongoing development.
- Feature work is integrated into `staging` and promoted to `main` only after the
  canonical verification and documentation gates pass.

Future development sessions should normally begin from an up-to-date `staging`.

## Working with AI agents

Every agent should begin with [AGENTS.md](AGENTS.md) and
[project.agent.json](project.agent.json), then read
[the continuity handoff](docs/HANDOFF.md). Together they describe the current
milestone, source-of-truth order, repository entry points, safety invariants,
known blockers, next step, and definition of done. Project state, milestone
evidence, and portfolio narrative are maintained in-repository so continuation
never depends on access to an earlier conversation.

## Trust boundary

The React renderer has no Node.js access. Electron context isolation and process
sandboxing are enabled, navigation is denied by default, and the preload bridge
exposes one versioned read-only application-state method and two narrowly scoped
prepare/execute methods for confirmed local deletion, plus non-sensitive desktop
metadata. SQLite lives behind main-process repository, sanitization, and
credential-vault interfaces; file-backed compaction runs in a dedicated worker
and the renderer receives only a validated application state. Source and
derived fixture records
use authenticated encryption with an OS-protected installation key. Neither the
key nor vault has an IPC surface. Personal-mail ingestion remains blocked until
account-scoped retention, disconnect, and deletion orchestration are complete.
