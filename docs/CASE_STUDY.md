# Posita Portfolio Case Study

Status: evolving working draft  
Last reviewed: 2026-08-24

This document turns verified project history into a portfolio-ready narrative.
It should remain honest about what is implemented, simulated, measured, and
planned. Detailed chronological evidence lives in `PROJECT_HISTORY.md`.

## Snapshot

**Posita** is a desktop-first personal mail hub that reframes several Gmail
accounts as one communication layer organized around people, topics, context,
and actions.

**Product promise:** Your inboxes, understood as one.

**Current stage:** Gate 2D account-lifecycle foundation in progress, with a real
SQLite path, OS-protected key hierarchy, authenticated mail and provider-account
state, plus tested crash-resumable disconnect and full local-deletion orchestrators.
Gmail and AI are not connected. Disconnect has no live revoker or user trigger;
full deletion now has a Settings & privacy flow, keyless startup recovery, and an
operation-bound typed-confirmation gate. A separate read-only application-state
boundary renders lifecycle and deleted outcomes.

**Source:** [github.com/morningstar-charmandor/posita](https://github.com/morningstar-charmandor/posita)

**Collaboration:** the product direction and decisions are developed with the
owner; implementation, research support, documentation, and verification are
performed collaboratively with Codex. This case study should describe that
AI-assisted process openly rather than imply a conventional larger team.

## The problem

People with personal, work, and freelance accounts do not merely have several
inboxes. They have fragmented context: one person may appear across accounts,
one topic may span several threads, and the important next action may be buried
under chronology.

Traditional inboxes answer “what arrived most recently?” Posita explores a more
useful opening question: “what needs my attention, why, and what evidence supports
that conclusion?”

## Product hypothesis

A calm desktop workspace can reduce repeated inbox scanning when it:

- prioritizes actions and waiting states over raw chronology,
- joins communication into correctable people and topics,
- keeps every summary traceable to original messages,
- shows the originating account everywhere it matters,
- helps draft a response without silently taking mailbox action.

This remains a product hypothesis. No external-user outcome metrics have been
measured yet.

## Design principles

1. **Understanding before chronology.** The Daily Brief is the default view;
   classic mail remains available rather than being hidden.
2. **Evidence before confidence.** Topic claims and timelines link back to exact
   source messages.
3. **Human authority.** Generated work is editable, and remote actions require
   explicit approval.
4. **Account clarity.** Unified context never erases mailbox provenance.
5. **Local control.** Private data has bounded retention, deletion semantics, and
   no implicit cloud dependency.
6. **No simulated magic.** Fixtures and generated-looking content are labeled as
   sample behavior until real integrations exist.

## The experience

The main vertical slice begins with a Daily Brief item that needs the user's
attention. Opening it reveals the topic's current state, why it matters, the
people involved, and a cited timeline. A source opens the original message and
its account. The next action can produce an editable draft, but sending remains
visibly disabled in the prototype.

This flow deliberately tests Posita's differentiator before introducing OAuth,
mail sync, model quality, quotas, or billing.

## Engineering approach

The desktop architecture treats the React renderer as untrusted:

```text
React presentation
  -> allow-listed, validated preload/IPC
  -> main-process application services
  -> repository and provider interfaces
  -> SQLite, OS protection, future Gmail and AI adapters
```

The codebase is also designed for continued human–AI collaboration. It provides
scoped agent instructions, a machine-readable project map, strict typed
boundaries, deterministic fakes, and one credential-free verification command.
This makes project context inspectable rather than trapped inside a chat.

The collaboration follows an “account for every line” discipline: search for the
existing source of truth before adding code, treat file size as a signal to review
responsibilities rather than a score, and document retained compatibility paths.
Future mailbox work has one account-scoped normalized model and one sync owner so
UI and AI features cannot quietly become alternate provider clients. This is a
documented boundary, not a claim that live sync has been implemented.

## Key challenges and tradeoffs

### Proving value without pretending to be live

Real Gmail and AI would add security and reliability work before the product
interaction was validated. The first gate therefore used realistic fixtures,
while maintaining explicit sample-data and disabled-send labels.

### Moving from a mock to a credible data path

The second gate moved fixture ownership into the trusted process and seeded it
through a real SQLite repository. The UI now consumes a versioned validated
contract—the path future normalized mail will use—without weakening the renderer
boundary.

### Preparing for highly sensitive data

The credential foundation uses asynchronous OS-backed encryption and refuses an
insecure fallback. However, protecting OAuth credentials alone is insufficient:
the sample mail schema is still plaintext. Posita therefore blocks real Gmail
ingestion until an authenticated encrypted-cache design covers source content,
derived content, SQLite sidecars, migration, and deletion. Gate 2C provides that
storage foundation using independently authenticated records and an OS-protected
installation key. Gate 2D now adds versioned encrypted provider-account identity
and sync state without connecting a provider. Real mail remains blocked until
account-scoped retention and disconnect orchestration are equally well proven.

Full local deletion adds a distinct ordering problem: the shared data key must
remain available long enough to remove encrypted records and sanitize SQLite, but
must be erased before completion is reported. Posita now journals credentials,
account state, mail records, compaction, OS-vault key deletion, and in-memory key
destruction as retryable phases.

Secure SQLite compaction presented a responsiveness problem because the built-in
API and `VACUUM` are synchronous. Posita now routes file-backed sanitization through
one single-flight worker thread and a bounded versioned protocol. Retention,
disconnect, deletion, and restart recovery share an injectable application
contract, while raw database and worker failures stay out of the renderer.

The command boundary separates authorization from recovery. A new destructive
operation needs exact typed confirmation within five minutes, while recovery can
only resume an already-journaled operation and cannot silently create one. The
confirmation receipt stores opaque identifiers and timestamps rather than user
text or mailbox content. Status says work is pending—not running—because a
persistent marker alone cannot prove active execution.

The restart boundary required another architectural change. Posita now inspects
the non-sensitive journal before normal key bootstrap. A deletion-only adapter can
remove ciphertext and SQLite remnants without decrypting them, erase a key if it
still exists, and complete when it is already absent. The completed marker acts as
a durable deleted-mode tombstone, preventing later restarts from generating a new
key and reseeding sample data. Conflicting lifecycle rows fail closed.

### Explaining access before asking for it

The first Gmail permission screen is now a versioned product contract rather than
renderer-owned marketing copy. Main projects the exact `gmail.readonly` consent
through the existing validated read-only state, and Settings explains the 90-day
window, local encryption, inactive AI boundary, remote-mail safeguards, and
disconnect behavior. The connect action remains disabled, demonstrating the
permission experience without pretending OAuth or a live mailbox exists.

### Choosing bounded context

The private alpha will import and retain a rolling 90-day window. This trades
older context for a smaller sensitive-data footprint. Configurable retention is
reserved for a later gate and must never silently lengthen an existing setting.

## Current outcome and evidence

At the current Gate 2D foundation checkpoint, Posita has:

- a runnable desktop interaction model,
- a normalized SQLite foundation with transactional migrations,
- a narrow versioned renderer-to-main contract,
- an OS-protected refresh-token vault with no renderer surface,
- an OS-protected data-key hierarchy and AES-256-GCM private records,
- tamper-evident metadata, interruption-aware migration, and scrubbed sidecars,
- privacy, retention, deletion, and least-privilege authorization boundaries,
- encrypted, runtime-validated provider-account and sync-state storage with no
  live account data,
- an intentionally minimal lifecycle journal that can survive deletion of the
  private-data key without containing private content,
- deterministic 90-day retention with absolute timestamps, conservative
  source-derived eviction, and atomic encrypted-cache rewriting,
- exact historical-fixture compatibility that restores known absolute timestamps
  without parsing display labels or replacing ambiguous data,
- idempotent account removal that preserves other-account sources while deleting
  every derived topic touched by removed provenance,
- ordered single-flight disconnect orchestration with durable progress and safe
  retry at every action and journal-write boundary,
- ordered installation-wide deletion through SQLite sanitization, OS-protected
  key erasure, and in-memory key destruction, with durable overlap prevention,
- short-lived operation-bound confirmation, auditable non-private receipts, a
  recovery-only resume entry point, and bounded safe lifecycle status,
- startup cleanup that removes expired confirmation metadata only after its
  deletion operation no longer needs the authorization binding,
- file-backed WAL checkpointing and SQLite compaction in one packaged single-flight
  worker, with safe retry errors and real deleted-byte verification,
- an exact read-only Gmail consent projection and accessible Settings preview with
  disabled activation and no OAuth state, credential, or live account,
- explicit sample-mode labels across account, brief, search, and draft surfaces,
- keyless pre-bootstrap recovery, shutdown cancellation between phases, and a
  durable deleted mode that remains empty across repeated restarts,
- one validated read-only application-state query and accessible pending,
  retry-required, recovery-required, and local-data-deleted UI states,
- a separately reviewed prepare/execute deletion capability with exact typed
  confirmation, trusted-window binding, stable safe errors, and no provider target,
- future sync ownership and account-isolation contracts without premature
  provider implementation,
- keyboard-readable icon controls and a reduced-motion fallback,
- 29 automated test files containing 190 passing tests,
- passing strict TypeScript, structural security checks, and production builds.

These are engineering outcomes, not evidence of customer adoption or AI quality.
No real mailbox, OAuth credential, or model provider has been used.

## What comes next

The next Gate 2D slice should define provider-independent authorization-session
contracts and deterministic fakes while keeping browser authorization, credentials,
and pending disconnect inactive. Gmail OAuth and deterministic sync remain blocked
behind explicit user approval and the remaining lifecycle activation gates.

Later evidence should include measured sync reliability, duplicate prevention,
citation correctness, draft usefulness, correction rate, and time to attention.
Until measured, these remain evaluation plans rather than results.

## Portfolio asset checklist

Capture and store assets only when the represented state is verified:

- hero screenshot of the Daily Brief,
- topic timeline with visible source grounding,
- original message with account provenance,
- editable draft with disabled or confirmed action boundary,
- concise architecture and trust-boundary diagram,
- short end-to-end demo recording,
- screenshots of meaningful loading, offline, and safe-error states,
- milestone comparison showing fixture UI, local-data path, and live-alpha stages.

For every asset, record the date, commit, feature status, and whether its content
is fixture or live. Never place personal mailbox content or credentials in a
portfolio artifact.

## Short portfolio summary

Posita explores an alternative to fragmented inboxes: a desktop mail hub centered
on attention, people, topics, and evidence. I developed the product direction and
worked with an AI coding partner to turn the concept into a secure, testable
Electron prototype. The build emphasizes source-grounded summaries, explicit
human approval, visible account provenance, and a renderer that never receives
credentials or direct database access.

Rather than connecting Gmail immediately, the project advances through verified
gates. It first proved the core Daily Brief-to-source-to-draft experience, then
moved that experience onto a versioned SQLite and IPC foundation, added fail-closed
OS-protected credential storage, and encrypted private cache records with a
protected installation key. Real mail remains blocked until account-scoped
retention and deletion behavior are proven.
