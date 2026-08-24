# Posita Architecture

The repository-level engineering contract is defined in `AGENTS.md` and the
machine-readable map in `project.agent.json`. `npm run verify` is the canonical
local completion gate. See `docs/ENGINEERING.md` for the rules that keep frontend,
backend, IPC, and future agent tools independently inspectable and testable.

## Decision summary

Gate 1 will use Electron, React, TypeScript, and Vite. Electron is selected for
the initial build because the current workspace has a supported Node toolchain
but no Rust toolchain, and because Gmail OAuth, OS keychain access, background
sync, and packaging all need a dependable desktop host.

This is not a permanent rejection of Tauri. Re-evaluate the host after Gate 2,
when real bundle size, memory use, native integration, and team constraints can
be measured rather than guessed.

## Process boundary

```text
React renderer
  | typed, allow-listed IPC only
Preload bridge
  | validates requests and responses
Electron main process
  |-- application services
  |-- SQLite repository
  |-- Gmail adapter
  |-- AI adapter
  `-- OS keychain
```

The renderer is treated as untrusted presentation code. It receives no Node.js
access, OAuth tokens, database handles, or provider credentials.

Required Electron controls:

- `contextIsolation: true`,
- `nodeIntegration: false`,
- renderer sandbox enabled,
- restrictive Content Security Policy,
- no remote content in privileged windows,
- navigation and new-window requests denied by default,
- narrow preload API with runtime schema validation.

## Layers

### Domain

Pure TypeScript types and rules for accounts, people, topics, messages, threads,
actions, briefs, citations, and drafts. Domain code does not import Electron,
React, Gmail, a database driver, or an AI SDK.

### Application

Use cases such as `buildDailyBrief`, `getTopicContext`, `searchMail`, and
`createDraft`. Use cases depend on interfaces, not provider implementations.

### Infrastructure

Adapters for Gmail, SQLite, the OS keychain, AI generation, clocks, logging, and
telemetry. Provider-specific data is normalized at this boundary.

### Presentation

React views and a small typed client for application use cases. Components render
structured results and citations; they do not parse unconstrained model prose.

## Initial domain model

- `Account`: a connected mailbox and its visible identity.
- `Message`: normalized immutable mail content with provider provenance.
- `Thread`: ordered messages from one provider conversation.
- `Person`: a user-correctable identity joining one or more addresses.
- `Topic`: a user-correctable grouping across threads and accounts.
- `ActionItem`: something needed from the user or another person.
- `BriefItem`: a ranked, explainable projection of source objects.
- `Citation`: a source message plus the excerpt or field supporting a claim.
- `Draft`: generated content, provenance, status, and target account.

Provider IDs are namespaced by account. Internal IDs are stable UUIDs. Derived
objects record their model/rule version and source message IDs so they can be
recomputed or deleted.

## Data ownership and storage

Gate 1 used renderer-imported versioned fixtures. Gate 2A now seeds those fixtures
idempotently into SQLite in the main process and serves a versioned snapshot
through validated, read-only IPC. The schema separates:

- normalized provider records,
- user-authored corrections,
- AI-derived summaries and classifications,
- sync state,
- audit events for user-approved mutations.

OAuth refresh tokens live only in the OS keychain. Access tokens remain in main
process memory and are never persisted in renderer-accessible storage. Logs use
opaque IDs and must not contain message bodies, subjects, addresses, tokens, or
draft text.

## Gmail synchronization

The Gmail adapter will use an initial bounded import followed by incremental
history synchronization. Sync operations must be idempotent, transactional at a
batch boundary, resumable, quota-aware, and isolated per account.

Remote mutations are commands with an explicit confirmation record. Gate 2 only
requires creating a local draft; sending remains outside the alpha's default
capability until its safeguards are separately reviewed.

## AI pipeline

AI output is a versioned structured proposal, never an authority.

```text
normalized mail
  -> deterministic preprocessing
  -> bounded retrieval
  -> schema-constrained model output
  -> citation and policy validation
  -> stored derived object
  -> user-visible correction path
```

The app must reject malformed output, unsupported citations, unknown source IDs,
and actions outside the request. A deterministic fallback still exposes classic
mail and basic rule-based grouping if the model is unavailable.

## Testing strategy

- Unit tests: domain rules, ranking, normalization, and schema validation.
- Component tests: structured cards, source links, and interaction states.
- Integration tests: renderer-to-main contracts against temporary repositories.
- End-to-end tests: the Gate 1 vertical slice in a packaged-like environment.
- Gate 2 contract tests: recorded, redacted Gmail and AI fixtures.

No test is allowed to depend on a personal mailbox or production credential.

## Delivery sequence

Steps 1–5 are implemented through Gate 2A. Provider adapters remain deferred.

1. Establish domain types, fixtures, and visual tokens.
2. Render the desktop shell and Daily Brief from application services.
3. Connect topic, source-message, and draft interactions.
4. Add tests and accessibility checks for the vertical slice.
5. Introduce SQLite behind the existing repository interface.
6. Add Gmail and AI adapters one at a time behind feature flags.

Each step must leave the application runnable and preserve the approval boundary.
