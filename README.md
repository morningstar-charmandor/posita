# Posita

**Your inboxes, understood as one.**

Posita is a desktop-first personal mail hub organized around people, topics,
context, and actions rather than separate inboxes.

## Current status

Gate 1 is an offline interactive prototype. It includes a Daily Brief, topic
timeline with source citations, original-message inspection, a unified classic
mail view, and an editable draft flow. All content is realistic fixture data.
Sending is deliberately disabled.

Read the build boundaries before extending the prototype:

- [Agent contract](AGENTS.md)
- [Machine-readable project map](project.agent.json)
- [MVP scope](docs/MVP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision log](docs/DECISIONS.md)
- [AI-agent-friendly engineering](docs/ENGINEERING.md)
- [Original product vision](product-spec.md)

## Run locally

Prerequisites: Node.js 20.19 or newer and npm.

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
currently exposes only non-sensitive desktop metadata. Future Gmail, database,
keychain, and AI integrations belong in the main process behind narrow typed
contracts.
