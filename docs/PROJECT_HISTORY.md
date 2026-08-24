# Posita Project History

This append-only journal records meaningful product and engineering milestones.
It preserves enough evidence for future development, retrospectives, and a
portfolio case study without relying on chat history. Correct factual errors in
place, but do not rewrite past tradeoffs to make the process appear cleaner than
it was.

## Project origin and naming

Date: before 2026-08-24

The project began from a detailed product concept for an AI-first personal mail
hub. Its working name was changed from **Inka** to **Posita** before the codebase
was established. The enduring product promise became:

> Your inboxes, understood as one.

The central hypothesis is that a personal mail tool should organize attention
around people, topics, context, and next actions—not force the user to repeatedly
scan chronological inboxes.

## Gate 1 — Interactive product prototype

Date: 2026-08-24
Checkpoint: `24d7269`

Goal: prove the core interaction model without credentials, network access, or
claims of production AI.

Delivered:

- Electron, React, TypeScript, and Vite project foundation,
- three-column desktop workspace and calm visual system,
- Daily Brief organized as Needs you, Waiting, and Worth knowing,
- topic context with a source-grounded timeline,
- original-message inspection and visible account provenance,
- unified classic mail view and editable draft flow,
- explicit disabled-send boundary,
- responsive async states and accessibility-oriented interaction tests,
- repository agent contract, machine-readable project map, and one verification
  command.

Important decisions:

- prove usefulness with realistic fixtures before connecting Gmail,
- treat the renderer as untrusted,
- keep provider concerns outside the domain,
- require citations for generated factual claims,
- make AI-agent friendliness an engineering invariant.

Evidence: the product was runnable without network access and the canonical
verification gate passed. All content and generated-looking behavior remained
clearly simulated.

## Gate 2A — Local data foundation

Date: 2026-08-24  
Checkpoint: `daf9f73`

Goal: replace the renderer's direct fixture import with the same layered local
data path that future real data will use.

Delivered:

- built-in Node SQLite behind `MailRepository`,
- normalized strict schema and numbered transactional migrations,
- idempotent fixture seeding,
- application service and versioned read-only IPC contract,
- request, sender, response, and error validation across the process boundary,
- renderer data-source abstraction with retryable failures,
- database, application, IPC, preload, and UI tests.

Important decisions:

- use embedded `node:sqlite` to avoid native add-on and Electron ABI risk,
- keep synchronous database work bounded to the prototype,
- move production-scale sync and indexing to a worker or utility process later.

Evidence: 26 tests and the production build passed at the checkpoint. The UI no
longer imported production fixture data directly, but the database still held
sample content only.

## Gate 2B — Privacy and credential-storage foundation

Date: 2026-08-24  
Checkpoint: `0d56167`

Goal: settle retention and authorization boundaries and create a safe place for
future OAuth refresh credentials before attempting Gmail access.

Delivered:

- allow-listed `SecretVault` contract in the main process,
- asynchronous Electron `safeStorage` protector,
- rejection of unavailable, unknown, and Linux plaintext storage backends,
- SQLite schema version 2 for scheme-tagged protected ciphertext,
- bounded credential inputs, replacement, deletion, rotation, and corruption
  handling,
- deterministic non-production protector for credential-free tests,
- 90-day private-alpha retention decision,
- PKCE, loopback redirect, and `gmail.readonly` authorization boundary,
- structural guard preventing the fake protector from entering production
  composition.

Important decisions:

- fail closed rather than silently weaken credential protection,
- keep access tokens and PKCE material in memory only,
- request the smallest Gmail scope first,
- block real-mail ingestion until source and derived content are encrypted.

Evidence: 10 test files and 36 tests passed with strict typechecking, structure
checks, and the production Electron build. No Google credential or mailbox was
accessed.

## Documentation continuity system

Date: 2026-08-24

Goal: make the project transferable across people, AI models, threads, and future
portfolio work without depending on conversational memory.

Delivered:

- `HANDOFF.md` for current state, blockers, and the next safe move,
- this append-only evidence journal,
- `CASE_STUDY.md` for an honest, evolving portfolio narrative,
- repository and machine-readable rules requiring documentation maintenance.

This entry intentionally leaves exact verification and checkpoint metadata to
the Git commit that introduces the documentation system.

## Public repository established

Date: 2026-08-24
Repository: `https://github.com/morningstar-charmandor/posita`

The complete local project history was connected to its existing empty public
GitHub repository. `main` is the canonical branch and the repository is intended
to remain suitable for portfolio review without containing credentials, personal
mail, private generated content, or local caches.

Publishing does not change the product stage: Gmail and AI remain disconnected,
all visible communication remains fixture data, and real-mail ingestion remains
blocked by the encrypted-cache prerequisite.

## How future entries should be written

For each material milestone, record:

- date and Git checkpoint,
- user or product problem addressed,
- scope delivered and explicitly deferred,
- major decisions and rejected alternatives when meaningful,
- verification evidence and observable result,
- limitations, failures, or follow-up work.

Never invent user research, adoption, performance, accuracy, or business metrics.
Label targets as targets and measured outcomes as measured outcomes.
