# Posita Agent Contract

This file is the operating contract for every human or AI agent changing this
repository. It applies to the entire project unless a more specific `AGENTS.md`
exists deeper in the tree.

## Product state

- Current milestone: Gate 2B, privacy and credential-storage foundation.
- Current data: deterministic fixtures seeded idempotently into local SQLite.
- An OS-protected credential vault is implemented but contains no real token.
- Gmail, encrypted personal-mail cache, and model providers are not connected.
- Sending mail is intentionally disabled.
- Product promise: **Your inboxes, understood as one.**

Do not imply that fixture-backed behavior is connected to real mail or AI.

## Read first

Read these sources in order before a material change:

1. `project.agent.json` — machine-readable repository map and invariants.
2. `docs/HANDOFF.md` — current state, blockers, and next recommended milestone.
3. `README.md` — current status and commands.
4. `docs/MVP.md` — release gates and scope.
5. `docs/ARCHITECTURE.md` — process and layer boundaries.
6. `docs/DECISIONS.md` — accepted decisions and their consequences.
7. `docs/PRIVACY.md` — retention, encryption, consent, and deletion boundaries.
8. `docs/GMAIL.md` — authorization and least-privilege scope contract.
9. `product-spec.md` — long-term vision, not the current implementation scope.

When these disagree, the narrower current-milestone document wins. Record a new
decision before intentionally changing an accepted architectural boundary.

## Repository map

- `src/shared/`: pure cross-process domain types. No React or Electron imports.
- `src/renderer/`: untrusted presentation process. No Node, Electron, secrets,
  provider SDKs, filesystem access, or direct database access.
- `src/main/`: trusted desktop host and future application/infrastructure layer.
- `src/preload/`: minimal allow-listed bridge; never expose generic IPC methods.
- `scripts/`: deterministic local project checks; no network dependency.
- `docs/`: scope, architecture, decisions, and engineering policy.
- `out/`: generated build output; never edit or review as source.

## Required workflow

1. Inspect the relevant code, tests, docs, and current Git state.
2. State assumptions when the request leaves material product behavior open.
3. Make the smallest coherent change at the correct architectural layer.
4. Add or update tests for behavior, contracts, migrations, and failure paths.
5. Update docs and `project.agent.json` when commands, entry points, milestones,
   data ownership, or invariants change.
6. Maintain project continuity in the same change:
   - update `docs/HANDOFF.md` after any material change to current state or next step,
   - append `docs/PROJECT_HISTORY.md` for milestones and meaningful decisions,
   - update `docs/CASE_STUDY.md` when portfolio narrative, evidence, or assets change.
7. Run `npm run verify` before handing off. Report any check that could not run.

Preserve unrelated user changes. Never replace a working implementation merely
to match a preferred style.

## Engineering rules

- TypeScript is strict. Avoid `any`; validate unknown data at boundaries.
- Domain rules are pure and deterministic. Inject clocks, IDs, providers, and
  storage rather than reading global state inside domain code.
- Prefer small named modules with explicit inputs and outputs over implicit
  singletons or cross-layer imports.
- Keep one source of truth for each concept. Do not duplicate domain types in UI,
  IPC, database, and provider code.
- External payloads and model output require versioned schemas and runtime
  validation before entering the domain.
- Commands that mutate state must be narrow, idempotent where possible, and
  return structured results with stable error codes.
- Queries and generated claims must retain provenance to source message IDs.
- Use migrations for persistent schema changes; never mutate user data silently.
- Feature flags must default to the safer behavior.
- Logs use opaque identifiers and never include message bodies, subjects,
  addresses, drafts, access tokens, refresh tokens, or model prompts.

## Frontend rules

- Components render structured application results; they do not call Gmail,
  model providers, databases, or privileged Electron APIs.
- Use semantic HTML and accessible names so both people and automation can
  operate the interface. Prefer roles and labels over test-only selectors.
- Every asynchronous surface needs loading, empty, error, offline, and retry
  behavior before it is considered complete.
- Always show account provenance for mail and a path to the original source.
- Generated content must be labeled, editable, and distinguishable from source
  content. Destructive or external actions require explicit user confirmation.
- Split a module when it owns more than one independent feature or becomes hard
  to understand in one reading. Organize by product feature, not file type alone.

## Backend and agent-tool rules

- Provider adapters normalize external data before application use cases see it.
- OAuth tokens stay in the OS keychain/main process; never return them over IPC.
- Tool names are verb-first and stable, with one capability per tool.
- Tool inputs and outputs are bounded JSON-compatible objects with documented
  schemas, explicit versions, and actionable typed errors.
- Retrieval and AI generation are separate steps. Model output is a proposal,
  never an authority or a direct mailbox command.
- No autonomous send, delete, archive, label, or account change. A user-approved
  command and auditable confirmation record are required.
- Provide deterministic fake adapters for every external service so agents and CI
  can test without credentials, personal mail, network access, or billable calls.

## Definition of done

A change is done only when:

- its observable behavior and failure modes are covered by tests,
- `npm run verify` passes,
- the renderer security boundary still passes `npm run check:structure`,
- documentation describes any new command, boundary, schema, or decision,
- continuity and case-study records distinguish implemented, simulated, measured,
  and deferred work without relying on conversation history,
- no secret, personal mailbox data, generated output, or cache is committed, and
- the handoff clearly distinguishes implemented, simulated, and deferred work.
