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

**Current stage:** privacy-founded interactive prototype with a real local data
path and OS-protected credential foundation. Gmail and AI are not connected.

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
derived content, SQLite sidecars, migration, and deletion.

### Choosing bounded context

The private alpha will import and retain a rolling 90-day window. This trades
older context for a smaller sensitive-data footprint. Configurable retention is
reserved for a later gate and must never silently lengthen an existing setting.

## Current outcome and evidence

At Gate 2B, Posita has:

- a runnable desktop interaction model,
- a normalized SQLite foundation with transactional migrations,
- a narrow versioned renderer-to-main contract,
- an OS-protected refresh-token vault with no renderer surface,
- privacy, retention, deletion, and least-privilege authorization boundaries,
- 10 automated test files containing 36 passing tests,
- passing strict TypeScript, structural security checks, and production builds.

These are engineering outcomes, not evidence of customer adoption or AI quality.
No real mailbox, OAuth credential, or model provider has been used.

## What comes next

The next case-study chapter is Gate 2C: authenticated encryption for cached source
and derived private data. Only after tamper detection, key protection, migrations,
SQLite sidecar leakage, retention, and deletion pass verification should the
project add Gmail OAuth and a deterministic sync adapter.

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
moved that experience onto a versioned SQLite and IPC foundation, and finally
added fail-closed OS-protected credential storage and a 90-day privacy policy.
Real mail remains blocked until the local cache itself is encrypted and its
deletion behavior is proven.
