# Gate 2D Lifecycle Readiness Audit

Last reviewed: 2026-09-01
Audit baseline: `bf7baf9` (`feat: schedule encrypted retention maintenance`)

## Verdict

The **encrypted local account-lifecycle foundation is ready at its current
credential-free boundary**. The repository has verified storage, retention,
full local deletion, account-removal, connection consistency, confirmed orphan
recovery, and disconnect orchestration contracts.

**Live Gmail authorization and ingestion are not ready to activate.** This is a
deliberate gate, not a failed implementation. The canonical provider-independent
mail contract, credential-free sync coordinator, empty schema-v9 encrypted
projection, and packaged file-backed projection worker are now verified. The
coordinator-to-worker boundary is now integration-tested with the deterministic
provider but remains uncomposed from the running product. Canonical provider-mail
retention and journaled deletion are complete at their credential-free boundaries, but no
Google adapter, production sync composition, or sample-to-live transition exists.
Disconnect also has no production revoker or active user command.

No credential, provider connection, browser authorization, network request, Gmail
SDK, mailbox data, or model provider was used for this audit.

## Readiness matrix

| Area | Status | Verified evidence | Activation consequence |
| --- | --- | --- | --- |
| Renderer trust boundary | Ready | sandbox, context isolation, allow-listed validated preload/IPC, structural check | Keep provider payloads and credentials in main |
| Credential vault | Ready, empty | OS-backed fail-closed protector and `SecretVault`; deterministic fake tests | A future refresh token has a protected account-scoped destination |
| Encrypted private cache | Ready for current records | per-record AES-256-GCM, protected installation key, authenticated metadata, migrations, sanitization | Real records still require the provider-normalized schema below |
| Provider account/sync state | Ready, empty | versioned encrypted account and cursor records with runtime validation | Can store future connection identity and bounded cursor state |
| Consent | Ready for review only | exact `google-gmail-readonly-v1` / `gmail.readonly` projection and disabled Settings action | Activation remains a separate explicit decision |
| Authorization session | Contract-ready, fake only | bounded begin/complete/cancel contract and deterministic fake | Real PKCE, loopback listener, browser launch, and exchange are absent |
| Connection persistence | Contract-ready, fake only | vault-before-state ordering, duplicate preflight, rollback, safe errors | Not composed into production startup, preload, IPC, or UI |
| Connection consistency/recovery | Ready locally | presence-only diagnosis plus same-window one-use confirmed orphan discard | Never reconstructs a connection or contacts Google |
| Retention | Ready | exact 90-day eviction, daily worker schedule, safe retry/status | Cleanup affects encrypted Posita data only |
| Full local deletion | Ready | confirmed Settings command, durable recovery, keyless restart, cryptographic erasure | Removes local projection ciphertext; never deletes remote provider mail |
| Account disconnect | Orchestrator-ready, inactive | journaled idempotent application service and deterministic revoker tests | Needs a real idempotent revoker and separately reviewed user command |
| Canonical provider mail model | Lifecycle-ready, empty | exact validators, schema-v9 authenticated envelopes, opaque row IDs, packaged serial worker, fixed-window retention, and journaled account deletion | Needs credential-free sync lifecycle integration before provider activation |
| Sync coordinator | Worker-integrated, uncomposed | 90-day initial path, real file-worker batching/cursor ordering, replay, conflict preservation, bounded recovery/concurrency, cancellation, and key teardown are tested | Needs sample-to-live and production lifecycle decisions |
| Gmail adapter | **Not implemented** | adapter contract is documented only | Blocks OAuth and mail access |
| AI provider | Deferred | no model adapter, prompt, embedding, or model output path | Fixture summaries/drafts remain explicitly simulated |

## Blocking gaps before real mail

### 1. Keep the completed canonical provider-mail lifecycle intact

The canonical contract and encrypted persistence proof are complete at their
credential-free boundary. Schema v9 now persists:

- canonical source messages and threads under one opaque Posita account,
- account-scoped provider source identity for central replay deduplication,
- a bounded normalized batch and its next sync cursor in one atomic commit,
- authenticated metadata and record-size limits consistent with the cache threat model,
- deterministic tamper rejection, deletion, rollback/retry, and cursor conflicts.

ADR-031 settles fixture compatibility: the current encrypted `Message` stays a
sample-only view and receives no fabricated provider provenance. The projection
starts empty. A later reviewed sample-to-live transition must prevent fixture and
provider records from appearing as one mailbox dataset.

File-backed decrypt/scan/write work now has bounded worker ownership with validated
messages and key cleanup. Canonical records enter the existing automatic 90-day
maintenance pass: the exact boundary is retained, expired messages are removed,
affected encrypted threads are repaired or deleted, cursors remain intact, and
pending sanitization is resumed. The inactive journaled disconnect removes the
selected account's canonical records after fixture removal and retries the phase
idempotently. Installation-wide deletion removes all schema-v9 ciphertext keylessly.

### 2. Keep the worker-integrated sync owner inactive until transition review

One trusted coordinator now owns the provider boundary and proves, with a
deterministic fake:

- a bounded initial 90-day import,
- account-scoped single-flight execution and bounded cross-account concurrency,
- atomic batch plus cursor commit through its projection contract,
- idempotent replay using `(accountId, providerMessageId)`,
- cancellation on shutdown, disconnect, and supersession,
- typed offline, authentication, permission, quota, malformed-payload, invalid-
  cursor, and provider-unavailable outcomes,
- one bounded invalid-cursor resync that upserts provider state without erasing
  retained source records.

UI and AI features may request this coordinator; neither may become another Gmail
client or polling owner.

The coordinator now runs against the real file-backed encrypted projection in
credential-free integration tests. Consecutive pages and incremental replay use
the persisted cursor; an externally advanced cursor wins a real conflict; blocked
provider work cancels before teardown; and the retained worker key is explicitly
destroyed. No application startup, polling, UI, network, or provider composition
was added.

### 3. Disconnect activation paired with connection activation

A live connection must not be enabled without a usable removal path. The Google
revoker must be idempotent, use only the target account's trusted credential, and
treat an already absent/revoked grant as success. Pending disconnect recovery and
the user-facing confirmed disconnect command require separate review before a
real account is accepted.

### 4. Real OAuth implementation and configuration

Only after explicit owner approval may Posita add or configure:

- a Google installed-app OAuth client,
- Authorization Code + PKCE generation and verification,
- a temporary explicit-port loopback listener,
- system-browser launch and callback handling,
- code exchange and refresh-token persistence,
- any dependency needed for those capabilities.

Secrets and personal mailbox data must never enter Git, fixtures, logs, renderer
state, screenshots, tests, or portfolio assets.

## Recommended next milestone

Proceed with a **sample-to-live transition decision milestone** before composing
production sync:

1. decide exactly when deterministic samples stop being the visible data source,
2. define fail-closed startup and recovery behavior so sample and provider records
   can never appear as one mailbox dataset,
3. specify lifecycle ownership for sync start, cancellation, disconnect, retention,
   full deletion, and key teardown before adding composition,
4. keep preload, UI activation, Google code, credentials, network access, and live
   data unchanged until that decision is accepted.

This follows already accepted architecture and does not itself authorize Gmail.
It is the smallest safe step that makes the new encrypted storage obey Posita's
already accepted responsiveness, retention, and deletion boundaries.

## Completed credential-free contract evidence

- `ProviderMailMessageV1` and `ProviderMailThreadV1` are the only provider-ingestion
  contracts; exact validators reject unknown, unbounded, cross-account, and
  internally inconsistent normalized data.
- `MailSyncCoordinator` is the single provider I/O owner at the application layer
  and remains uncomposed from the running product.
- Deterministic tests prove the 90-day request boundary, per-account single-flight,
  bounded cross-account work, replay deduplication, batch/cursor ordering, commit
  failure rollback, one invalid-cursor resync without source erasure, cancellation,
  supersession, and safe provider failures.
- Schema v9 plus `EncryptedSqliteMailSyncProjection` prove ciphertext-only source
  identity/content, opaque row IDs, empty migration state, account isolation,
  replay/update classification, cursor conflicts, tamper rejection, transaction
  rollback, account deletion, and keyless installation deletion.
- `WorkerThreadMailSyncProjection` packages serialized file-backed reads/commits,
  exact request/result validation, typed conflict mapping, bounded queueing,
  malformed-output refusal, transferable key copies, and explicit key destruction.
- The coordinator-to-worker integration proves multi-page initial sync,
  incremental encrypted-cursor resume, replay classification, real checkpoint
  conflict preservation, cancellation, and key teardown with the deterministic provider.
- The inactive disconnect service requires account-scoped canonical projection
  deletion in its durable mail-data phase and safely retries after fixture removal
  has already committed.
- The verified baseline is 45 test files and 296 tests plus strict TypeScript,
  renderer structure/security checks, and production Electron builds.
- No dependency, production provider adapter, credential,
  personal mailbox data, network action, renderer surface, or mailbox mutation was
  added.

## Owner decision gate

No owner decision is needed to continue the recommended credential-free contract
work. Explicit owner approval is required before any real Google adapter,
credential configuration, browser authorization, production connection command,
or live mailbox access is introduced.

## Original audit evidence

- `npm run verify` passes at the audit baseline: 39 test files, 258 tests, strict
  TypeScript, structural renderer-security checks, and production Electron builds.
- `staging`, `main`, and their public origin refs were aligned at `bf7baf9` when
  the audit began.
- The worktree was clean; no dependency, schema, secret, credential, personal
  mailbox data, or generated cache change was part of the audit.

These are engineering checks, not claims of external-user readiness, Gmail
approval, synchronization reliability, AI quality, adoption, or business impact.
