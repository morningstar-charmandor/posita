# AI-Agent-Friendly Engineering

## Purpose

Posita should be straightforward for a new human or AI agent to understand,
change, and verify without relying on hidden context, personal credentials, or a
conversation transcript. Agent friendliness here means explicit contracts,
small inspectable boundaries, deterministic tooling, and safe local substitutes
for external systems.

It does not mean allowing an AI agent broad access to mailboxes or autonomous
authority. The product and the repository follow least privilege.

## Repository interface

The repository exposes four stable interfaces to an engineering agent:

1. `AGENTS.md` states how changes must be made.
2. `project.agent.json` describes entry points, commands, state, and invariants.
3. `npm run verify` is the single completion gate.
4. Tests and fixtures provide credential-free evidence of behavior.

An agent should be able to clone the repository, read those interfaces, install
the exact locked dependencies, and validate a change without network access
after installation.

## Code interface

New behavior should follow this path:

```text
external payload or UI intent
  -> versioned validated contract
  -> application use case
  -> pure domain rules
  -> repository/provider interface
  -> narrow adapter
  -> structured result or typed error
```

This keeps business behavior testable without Electron, Gmail, SQLite, or a model
provider. It also prevents UI components and AI tools from becoming alternate,
unreviewed backends.

## Agent-operable UI

Frontend behavior must remain understandable through the accessibility tree:

- interactive elements use native controls where possible,
- every control has a stable accessible name,
- status is conveyed in text as well as color,
- dialogs identify their purpose and are keyboard operable,
- loading, empty, error, offline, and approval states are explicit,
- original source content and generated interpretations are distinguishable.

Tests should select controls by role and accessible name. Add a test-only ID only
when the user-facing semantics cannot uniquely identify an element.

## Agent and model integrations

Future Posita agent capabilities are application-layer clients, not privileged
shortcuts. Every exposed tool must define:

- stable verb-first name,
- purpose and non-goals,
- versioned input and output schema,
- maximum input and output size,
- authorization and confirmation requirement,
- idempotency behavior,
- typed error codes and retry guidance,
- provenance fields for returned mail-derived facts,
- deterministic fake implementation and contract tests.

A model may propose a draft or command. Application policy validates it. The user
approves any external mutation. Only then may a provider adapter execute it.

## Documentation maintenance

Update documentation in the same change when:

- a command or prerequisite changes,
- an entry point moves,
- a release gate is completed,
- a new provider, database, credential, or process boundary is introduced,
- a security or privacy invariant changes,
- an architecture decision gains a meaningful tradeoff.

Documentation should describe the current truth. Historical reasoning belongs in
the decision log, not in stale comments or duplicated setup guides.
