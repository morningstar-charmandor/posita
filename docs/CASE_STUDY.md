# Posita Portfolio Case Study

Status: evolving working draft  
Last reviewed: 2026-09-01

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
boundary renders lifecycle and deleted outcomes. A provider-independent
authorization-session contract and deterministic fake exist only in the trusted
backend. A same-window Settings flow can now inspect and discard one-sided local
connection state for sample accounts, while OAuth activation and real credential
persistence remain unavailable. Automatic encrypted retention now runs at startup
and on a bounded daily cadence in a worker, with truthful status in Settings.
The Gate 2D readiness audit confirms that this local lifecycle foundation is ready
at its current boundary. Canonical provider-independent message/thread contracts
and one credential-free sync coordinator are now verified with deterministic
fakes. An empty schema-v9 authenticated projection now proves atomic canonical
message/thread and cursor persistence without exposing provider identity in
queryable metadata. A packaged serial worker now proves that file-backed projection
work stays off Electron main, while the automatic retention worker applies the
fixed 90-day window to canonical ciphertext and repairs affected threads. The
coordinator-to-worker path is now verified end to end with the deterministic
provider. The one-way sample-to-live boundary is now verified in schema v10;
live Gmail remains correctly blocked by production lifecycle composition and
provider adapters.

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
Future mailbox work now has one exact account-scoped normalized source model and
one tested sync owner so UI and AI features cannot quietly become alternate
provider clients. The coordinator remains credential-free and uncomposed; this is
verified contract behavior, not a claim that live sync has been implemented.
Its schema-v9 projection also remains empty and uncomposed from sync. Opaque local row IDs,
authenticated ciphertext, and atomic cursor advancement prove the storage boundary
without presenting fixture behavior as provider mail.
File-backed reads and commits reuse that projection inside a bounded worker protocol;
the adapter validates safe results, serializes SQLite work, and erases key copies.

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

Scheduling retention widened that problem: loading and decrypting the dataset,
planning derived eviction, and re-encrypting records are also synchronous. The
automatic path therefore moves the complete maintenance pass into one short-lived
worker, not merely compaction. Main owns startup, daily, and retry timing, while
confirmed full deletion suspends and awaits the owner before erasing data. Settings
receives only bounded status through the existing validated application query;
mail content, paths, raw errors, and key material remain trusted-process-only.

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

Before activation, Posita now also has a provider-independent authorization-session
boundary and deterministic fake. It proves exact read-only consent and scope,
bounded launch/callback URLs, expiry, cancellation, callback rejection, and safe
provider failure without a Google client, browser action, network request, or real
credential. Successful grants remain trusted-main-only and are not yet composed
into storage or the interface.

A credential-free connection coordinator now tests the cross-store boundary that
OAuth activation will eventually use. It rejects existing or inconsistent local
state, binds a completed grant to the pending opaque account, writes the protected
credential before encrypted provider identity, and reverses both writes after an
ambiguous state failure. A failed cleanup is surfaced as recovery-required rather
than hidden behind a connected status.

The next failure boundary is inspectable without becoming self-healing.
Posita classifies an account's local pair as absent, connected, credential-only,
or provider-state-only. The vault answers only whether a protected record exists,
without decrypting or rotating it. The approved recovery policy then requires a
receipt bound to the exact account and orphan type, discards only that local side,
and requires reconnect. That policy is now composed through two narrow
prepare/execute commands and a same-window Settings flow. Main derives the orphan
type rather than trusting the renderer, confirmation is single-use, and the UI
states clearly that this local cleanup does not contact Gmail or change provider
mail. The deterministic sample accounts normally have no inconsistency to repair.

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
- automatic startup and 24-hour retention passes with a one-hour safe retry,
  complete file-backed worker isolation, deletion/shutdown coordination, and
  accessible bounded maintenance status,
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
- a bounded trusted-main authorization-session contract and deterministic fake
  with no production composition, browser action, network access, or live credential,
- a credential-free account-connection coordinator with duplicate preflight,
  vault-before-state ordering, ambiguous-write rollback, and explicit recovery failure,
- a bounded read-only consistency diagnosis covering both one-sided failure states
  without credential decryption, repair, deletion, startup, or renderer exposure,
- a confirmed discard-only recovery policy that refuses complete/absent/stale
  state, removes one orphaned local side, verifies absence, and requires reconnect,
- a separate five-minute typed recovery confirmation with durable opaque
  account/status binding, atomic one-use consumption, replay refusal, and a
  same-window prepare/execute Settings surface,
- main-owned local connection diagnosis that refuses absent or complete pairs,
  never accepts a renderer-selected deletion side, and never contacts a provider,
- explicit sample-mode labels across account, brief, search, and draft surfaces,
- keyless pre-bootstrap recovery, shutdown cancellation between phases, and a
  durable deleted mode that remains empty across repeated restarts,
- one validated read-only application-state query and accessible pending,
  retry-required, recovery-required, and local-data-deleted UI states,
- a separately reviewed prepare/execute deletion capability with exact typed
  confirmation, trusted-window binding, stable safe errors, and no provider target,
- future sync ownership and account-isolation contracts without premature
  provider implementation,
- an exact canonical source-message/thread model with bounded recipients, bodies,
  labels, attachment metadata, and immutable account/provider provenance,
- one credential-free sync coordinator proving a 90-day initial path, single-
  flight account work, bounded cross-account concurrency, replay deduplication,
  atomic batch/cursor ordering, bounded cursor recovery, and cancellation,
- an empty schema-v9 encrypted provider-mail projection proving opaque local row
  identity, account-scoped replay/update handling, atomic encrypted cursor commits,
  tamper rejection, cursor conflicts, rollback, and deletion,
- a packaged serial provider-mail projection worker with bounded validated
  messages, real file-backed encrypted commit/reload evidence, safe failures, and
  explicit retained-key teardown,
- journaled local disconnect ordering that requires account-scoped canonical
  projection deletion and safely retries after fixture removal already committed,
- worker-owned canonical retention that keeps the exact 90-day boundary, removes
  expired messages, repairs or removes encrypted threads, preserves cursors, and
  resumes pending sanitization without a plaintext index,
- credential-free end-to-end integration from deterministic provider through the
  sync coordinator to the real file-backed encrypted worker, including replay,
  cursor-conflict preservation, cancellation, and key teardown,
- one credential-free lifecycle owner that activates live mode before sync,
  excludes retention during provider writes, settles work before disconnect or
  deletion, preserves live-empty/offline truth, and tears down worker keys,
- a mode-aware worker-backed live snapshot capped at 50 canonical summaries and
  32 account scopes, with bodies, recipients, remote provider IDs, cursors,
  key material, paths, and raw failures excluded,
- encrypted provider-account display identity that keeps the Google subject hidden
  while projecting a verified mailbox address and optional label to safe status UI,
- a bounded canonical source-detail worker query with exact found/missing state,
  canonical provenance, recipients, safe attachment metadata, and explicitly
  truncated plain text while excluding provider IDs and HTML,
- truthful status-only live-empty, recorded-syncing, offline, attention, and cached-
  data UI that never falls back to samples or claims Gmail or AI is active,
- an explicit compatibility boundary that keeps fixture `Message` records sample-
  only rather than fabricating provider identity,
- keyboard-readable icon controls and a reduced-motion fallback,
- 52 automated test files containing 341 passing tests,
- a desktop visual and accessibility-tree check of the local-only Settings entry,
  sample-account controls, normal no-recovery-needed outcome, and automatic
  retention card with readable next/last status and Gmail non-mutation copy,
- passing strict TypeScript, structural security checks, and production builds.

These are engineering outcomes, not evidence of customer adoption or AI quality.
No real mailbox, OAuth credential, or model provider has been used.

## What comes next

The discard-only local recovery flow, automatic fixed-window retention lifecycle,
canonical provider-mail contract, and credential-free sync coordinator are complete
at their current Gate 2D boundaries. The empty encrypted canonical-mail projection,
atomic cursor store, journaled account removal, and worker-owned 90-day canonical
retention are now verified. The deterministic sync coordinator also passes real
file-backed worker integration without activating startup sync. Schema v10 now
adds the approved one-way installation boundary: the first complete connection
will atomically remove samples, startup will never reseed them in live mode, and
removing the last account leaves a truthful empty live state. The transition is
still unexposed. A new credential-free lifecycle owner now proves startup,
offline, retention, disconnect, deletion, shutdown, and key-teardown ordering.
The live application read-model boundary is now verified at a status-only layer,
and its account provenance is a human-readable encrypted address/optional label
rather than an opaque scope. A bounded canonical source-detail query is now verified
through the real encrypted worker but remains unexposed. The next milestone is its
loading, missing/stale, safe-error, and retry UI before live summaries are displayed. Real OAuth,
browser activation, credentials, live account
connection, and production sync remain separate actions blocked behind explicit
owner approval.

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
protected installation key. It now also validates one canonical provider-mail
shape and coordinates credential-free synchronization through deterministic
interfaces, with an empty authenticated SQLite projection proving atomic canonical
records, cursor persistence, journaled removal, and worker-owned 90-day retention.
The coordinator-to-worker path is also verified with deterministic file-backed
integration. A durable schema-v10 mode now proves samples can be removed once and
never silently restored after disconnect or restart. The provider lifecycle now
has one deterministic application owner, and the running product can distinguish
sample from live-empty, offline, or cached canonical state through a bounded worker
read without displaying private live summaries. Its status-only account provenance
now uses encrypted human-readable identity while keeping provider subjects hidden.
The worker-backed canonical detail boundary is also verified with deterministic
data only. Real mail remains blocked until source-detail UI, production sync, and the remaining provider
activation gates pass.
