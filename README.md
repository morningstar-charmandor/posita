# Posita

**Your inboxes, understood as one.**

Posita is a desktop-first personal mail hub organized around people, topics,
context, and actions rather than separate inboxes.

## Current status

Gate 2A is a local-data prototype. It includes a Daily Brief, topic timeline with
source citations, original-message inspection, a unified classic mail view, and
an editable draft flow. Realistic fixture data is seeded idempotently into a
versioned local SQLite database and loaded through validated, read-only Electron
IPC. Gmail and AI providers are not connected. Sending is deliberately disabled.

Read the build boundaries before extending the prototype:

- [Agent contract](AGENTS.md)
- [Machine-readable project map](project.agent.json)
- [MVP scope](docs/MVP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision log](docs/DECISIONS.md)
- [Local data foundation](docs/DATABASE.md)
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
[project.agent.json](project.agent.json). Together they describe the current
milestone, source-of-truth order, repository entry points, safety invariants, and
definition of done. Changes to architecture, commands, entry points, or project
state must update those interfaces in the same change.

## Trust boundary

The React renderer has no Node.js access. Electron context isolation and process
sandboxing are enabled, navigation is denied by default, and the preload bridge
exposes one versioned read-only data method plus non-sensitive desktop metadata.
SQLite lives behind a main-process repository interface; the renderer receives
only a validated snapshot. Future Gmail, keychain, and AI integrations remain in
the main process behind narrow typed contracts.
