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

The repository exposes seven stable interfaces to an engineering agent:

1. `AGENTS.md` states how changes must be made.
2. `project.agent.json` describes entry points, commands, state, and invariants.
3. `npm run verify` is the single completion gate.
4. Tests and fixtures provide credential-free evidence of behavior.
5. `docs/HANDOFF.md` records current state, blockers, and the next safe move.
6. `docs/PROJECT_HISTORY.md` preserves chronological milestone evidence.
7. `docs/CASE_STUDY.md` maintains an honest portfolio-ready narrative.

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

## Change scope and complexity

AI-assisted development makes additive duplication a larger risk than raw line
count. Before adding a module, abstraction, or dependency:

1. search for equivalent behavior and identify the current source of truth,
2. extend the existing coherent path when its responsibility still fits,
3. introduce a new boundary only for a real lifecycle, security, provider, or
   testability need,
4. remove superseded code in the same change, or document why a compatibility
   path must remain and when it can be removed,
5. verify that one feature has not acquired a second repository, state store,
   fetch path, validation schema, or error model.

Do not optimize for minimum lines. Review line count as a prompt for judgment:

- roughly 300–500 added lines for a small feature should trigger a scope and reuse
  review,
- a normal source file above roughly 600 lines should trigger a responsibility
  review,
- generated schemas, migrations, fixtures, tests, and necessary platform adapters
  may reasonably exceed those ranges.

Completion notes identify files created and modified, significant additions or
removals, new abstractions and dependencies, and any old implementation retained.
Never create layers merely to look production-grade.

## Desktop behavior and responsiveness

Posita remains an Electron application under ADR-002. Generic SwiftUI, SwiftData,
AppKit, and `UserDefaults` guidance does not apply unless the host decision is
formally revisited. The underlying goal does apply: Posita should feel like a
first-class macOS app rather than an unconstrained website in a window.

- Use Electron/operating-system capabilities for windows, menus, shortcuts,
  dialogs, notifications, Dock behavior, and external links when they materially
  improve the workflow.
- Keep privileged OS integration in main-process adapters behind narrow contracts.
- Scope state to the smallest owner: transient interaction state in components,
  feature state in the feature boundary, and account/auth/lifecycle state in
  application services. Do not create a global catch-all state object.
- Keep launch and interaction responsive. Production-sized database work, sync,
  parsing, indexing, retrieval, and model calls move to a worker or Electron
  utility process rather than blocking renderer or main event loops.
- Long-running work accepts cancellation, stops when superseded or disconnected,
  and releases timers, listeners, network clients, and heavyweight resources.
- Respect keyboard conventions, resizing, focus, contrast, accessible names, and
  reduced-motion preferences. Motion communicates state and never delays input.

Multi-window support is not implied. If introduced later, window-specific state
must not accidentally become global, and restoration/crash behavior needs tests.

## Networking and background work

All provider and future model networking uses typed, validated requests and
responses; explicit timeouts; cancellation; bounded exponential backoff with
jitter; server retry guidance; and structured safe errors. Retry only transient,
idempotent operations. Authentication expiration, permission loss, quota limits,
invalid cursors, offline state, and malformed payloads remain distinct failures.

Background work has one named lifecycle owner. Prefer provider events and
incremental cursors over permanent polling. Bound CPU, memory, disk, battery,
network, and concurrent-account use; stop unnecessary work when the app shuts
down or an account disconnects.

## Dependencies and distribution

Prefer current platform and project capabilities before adding a package. A new
dependency needs a concrete purpose, exact version, maintenance assessment,
security and permission review, coupling/removal analysis, and deterministic test
strategy. Avoid dependencies for trivial helpers.

Gate 3 distribution requires signed builds, Hardened Runtime, notarization,
stapling, entitlement review, and automated release verification. Chromium
sandboxing and macOS App Sandbox are different controls; do not describe one as
the other. Request permissions contextually and only when the user invokes the
capability that needs them.

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

Current truth, chronological evidence, and portfolio narrative serve different
purposes and must remain separated:

- update `HANDOFF.md` whenever implemented, simulated, deferred, blocked, or next
  work changes,
- append `PROJECT_HISTORY.md` when a coherent milestone or consequential product
  decision is completed,
- update `CASE_STUDY.md` only with verified outcomes and clearly labeled plans,
- include dates, Git checkpoints, test/build evidence, and known limitations,
- never invent research findings, usage metrics, quality scores, or customer
  outcomes.

Git is authoritative for exact file changes. These documents explain intent,
state, and evidence so future sessions do not have to reconstruct them from diffs.
