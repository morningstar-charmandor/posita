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
Schema v7 stores only opaque, operation-bound confirmation receipts for destructive
local deletion; the typed confirmation text is never persisted.
Account removal now deterministically preserves unaffected sources while evicting
touched derived context. A crash-resumable disconnect orchestrator now coordinates
revocation, credential deletion, provider-state deletion, local-data removal, and
compaction through interfaces and deterministic tests. A separate installation-wide
orchestrator now journals deletion of all refresh credentials, encrypted account
state, mail records, SQLite remnants, the OS-protected data key, and its in-memory
copy. Both workflows remain non-user-triggerable: there is no live Google revoker
or lifecycle mutation IPC. New full deletion is guarded by a five-minute typed
confirmation bound to one operation, and pending journal state has a bounded
safe-status projection. One validated read-only application-state query now
renders pending, retry-required, recovery-required, and completed local-deletion
outcomes without exposing a lifecycle command. Gmail and AI providers
are not connected, no real OAuth credential exists, and sending is deliberately
disabled.

Startup now has one cancellable lifecycle-recovery owner. If a full deletion is
journaled, it resumes through deletion-only SQLite and vault operations without
loading or creating the encryption key. A completed marker keeps later restarts
in `local-data-deleted` mode and prevents fixture reseeding. Pending account
disconnect remains inactive because no live authorization revoker exists.

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
exposes one versioned read-only application-state method plus non-sensitive
desktop metadata. SQLite lives behind main-process repository and credential-vault
interfaces; the renderer receives only a validated application state. Source and
derived fixture records
use authenticated encryption with an OS-protected installation key. Neither the
key nor vault has an IPC surface. Personal-mail ingestion remains blocked until
account-scoped retention, disconnect, and deletion orchestration are complete.
