# Posita

**Your inboxes, understood as one.**

Posita is a desktop-first personal mail hub organized around people, topics,
context, and actions rather than separate inboxes.

Public repository: [github.com/morningstar-charmandor/posita](https://github.com/morningstar-charmandor/posita)

## Current status

Gate 2C is an encrypted local-data prototype. It includes a Daily Brief,
topic timeline with source citations, original-message inspection, a unified
classic mail view, and an editable draft flow. Realistic fixture data is seeded
idempotently as independently authenticated AES-256-GCM records in a versioned
local SQLite database and loaded through validated, read-only Electron IPC. A
per-installation data key is protected by the operating-system vault. Gmail,
account lifecycle/retention, and AI providers are not connected. No real OAuth
credential exists, and sending is deliberately disabled.

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
exposes one versioned read-only data method plus non-sensitive desktop metadata.
SQLite lives behind main-process repository and credential-vault interfaces; the
renderer receives only a validated snapshot. Source and derived fixture records
use authenticated encryption with an OS-protected installation key. Neither the
key nor vault has an IPC surface. Personal-mail ingestion remains blocked until
account-scoped retention, disconnect, and deletion orchestration are complete.
