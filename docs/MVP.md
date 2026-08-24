# Posita MVP

## Product outcome

Posita gives one person a calm, trustworthy view of what matters across several
Gmail accounts. It connects messages to people, topics, and actions while keeping
the original email one click away.

The MVP succeeds when a user can open Posita and, without scanning inboxes:

1. see what needs attention,
2. understand why it needs attention,
3. inspect the source messages,
4. draft the next response, and
5. explicitly approve any action that affects their mailbox.

## Product principles

- Understanding before chronology: prioritize context and action over a raw feed.
- Source-grounded answers: every factual claim links back to source messages.
- Human approval: Posita never sends, deletes, or changes remote mail silently.
- Account clarity: the originating account is visible wherever mail appears.
- Graceful uncertainty: uncertain classifications are labeled and correctable.
- Local control: derived data and cached mail can be deleted by the user.

## Release gates

### Gate 1 — Interactive product prototype

Purpose: prove the core interaction model without credentials or external APIs.

Included:

- three-column desktop shell,
- realistic sample accounts, people, topics, threads, and messages,
- Daily Brief sections: Needs you, Waiting, Worth knowing,
- topic timeline with linked source messages,
- classic unified inbox,
- structured Ask Posita responses for a small set of representative questions,
- draft-reply flow with explicit approval boundary,
- responsive empty, loading, and error states,
- keyboard-accessible primary navigation.

Exit criteria:

- a new user can identify the top action in under 10 seconds,
- every summary claim can be traced to a source message,
- the full Daily Brief → topic → source → draft path works,
- the interface works without network access,
- automated tests cover the domain transformations and critical UI path.

### Gate 2 — Local private alpha

Purpose: prove real mailbox ingestion and useful AI output for the owner.

Included:

- Google OAuth for multiple Gmail accounts,
- incremental Gmail sync with resumable cursors,
- local encrypted credential storage through the operating-system keychain,
- local SQLite cache and derived objects,
- provider-independent mail normalization,
- structured classification: summary, priority, reply state, category, topic,
- grounded topic summaries and conversational retrieval,
- user-editable topic associations,
- AI-generated drafts that are never sent automatically,
- account disconnect and local-data deletion.

Exit criteria:

- two Gmail accounts sync without duplicating messages,
- interrupted sync resumes safely,
- answers cite only retrieved messages,
- no mailbox mutation occurs without a visible confirmation,
- secrets never enter renderer storage or logs,
- the app remains useful when AI generation is unavailable.

### Gate 3 — Invite-only beta

Purpose: make the alpha dependable for a small external cohort.

Included:

- signed and packaged desktop builds,
- onboarding and consent flows,
- sync diagnostics and recovery,
- configurable retention and privacy controls,
- feedback and correction workflows,
- opt-in, redacted product telemetry,
- rate-limit, quota, and cost controls,
- security and privacy review.

Exit criteria:

- reliable installation and upgrade on supported platforms,
- documented deletion and disconnect behavior,
- measurable classification quality and correction rates,
- no known high-severity security or data-loss issues.

## Gate 1 vertical slice

The first build centers on a single coherent scenario:

1. The Daily Brief shows “Confirm Pulse scope with Rahul” under Needs you.
2. Selecting it opens the Pulse topic with a concise status and timeline.
3. Each timeline event opens the exact source message and account.
4. The suggested next step opens a draft grounded in the thread.
5. The user can edit or discard the draft; sending is visibly unavailable in the
   prototype.

This slice validates Posita's distinctive value without pretending that sample
classification is production AI.

## Explicitly deferred

- automatic sending or autonomous mailbox mutation,
- Outlook and other providers,
- mobile and web clients,
- calendar, Slack, Teams, and messaging integrations,
- shared or enterprise inboxes,
- generalized agent or plugin marketplace,
- background cloud indexing,
- complex relationship graphs,
- billing and subscriptions.

## Core measurements

- Time to attention: seconds to identify the highest-priority item.
- Traceability: percentage of generated claims with valid source links.
- Draft usefulness: percentage of drafts accepted after light editing.
- Correction rate: how often priority, reply state, or topic is corrected.
- Calmness proxy: inbox opens avoided per active day.
- Reliability: sync completion and duplicate-message rates.

Metrics are not permitted to include message bodies, subjects, recipient
addresses, generated drafts, or embeddings.

## Open product decisions

These do not block Gate 1 and must be settled before live Gate 2 integrations:

- supported operating systems for the private alpha,
- AI provider and whether users may supply their own key,
- on-device versus hosted embedding and classification strategy,
- whether a Posita cloud account is necessary before multi-device support exists.

The private-alpha retention default is settled at a rolling 90 days in ADR-009
and `PRIVACY.md`.
