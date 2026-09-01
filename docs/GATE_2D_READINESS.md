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
Google adapter or production sync composition exists. The sample-to-live policy
is now a durable, credential-free, unexposed schema-v10 boundary.
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
| Sample/live boundary | Ready, unexposed | schema-v10 one-way mode, connected-pair gate, atomic sample removal, restart/no-reseed and retry tests | Must be invoked only by reviewed connection/sync composition |
| Live application read model | Ready, bounded local inspection | durable mode-aware query, encrypted human-readable account identity, bounded canonical summaries and source detail, fixed validated IPC/preload, worker ownership, and loading/missing/error/retry UI | Needs open-original review before displaying live summaries |
| Sync coordinator | Lifecycle-owned, uncomposed | 90-day path, real worker integration, bounded concurrency, cancellation, retention exclusion, disconnect/deletion quiescence, and key teardown are tested | Needs trusted account inventory, retry command/status policy, and provider composition |
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
starts empty. Schema v10 now prevents fixture and provider records from becoming
one mailbox dataset: a complete connected pair is required before an atomic
sample removal and one-way live-mode commit, and startup never reseeds afterward.

File-backed decrypt/scan/write work now has bounded worker ownership with validated
messages and key cleanup. Canonical records enter the existing automatic 90-day
maintenance pass: the exact boundary is retained, expired messages are removed,
affected encrypted threads are repaired or deleted, cursors remain intact, and
pending sanitization is resumed. The inactive journaled disconnect removes the
selected account's canonical records after fixture removal and retries the phase
idempotently. Installation-wide deletion removes all schema-v9 ciphertext keylessly.

### 2. Keep the lifecycle-owned sync boundary inactive until activation review

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

One credential-free lifecycle owner now places that coordinator in the required
ordering. Startup activates the durable live boundary before initial sync and
starts retention only after account work settles. Later sync excludes retention;
disconnect and confirmed full deletion first suspend new provider work and await
active work; shutdown settles both owners before projection-key teardown. A live-
empty startup performs no provider work, and offline startup returns a bounded
retry-required account result without reseeding samples. This is deterministic
application composition only and is not wired to Electron startup or a provider.

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

Treat the **credential-free live application read-model boundary as complete at
its bounded local-inspection layer**. Next review the external original-source
boundary required before live summaries can be displayed:

1. treat encrypted user-readable account identity as complete at its current
   contract, persistence, and status-projection boundary,
2. treat the bounded worker-backed canonical message-detail query as complete at
   its contract, encrypted projection, and native-worker boundary,
3. treat composed plain-text source detail with recipient and attachment metadata,
   loading, missing, stale, safe-error, and retry behavior as complete; do not
   render provider HTML,
4. keep opening Gmail externally disabled until its target derivation, trusted
   main-process command, and explicit external-action review are complete,
5. keep Google code, credentials, connection activation, network access, polling,
   AI, and real mailbox data unchanged.

This is the smallest next step because live mode is now truthful and worker-owned,
but Posita must not show a mail summary without a safe path to its source and a
human-readable originating account.

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
- `ProviderMailLifecycleOwner` proves startup activation, live-empty behavior,
  offline retry outcomes, concurrent startup sync, retention exclusion,
  disconnect preemption, full-deletion suspension, shutdown, and projection-key
  teardown through credential-free collaborators.
- The production application-state query reads durable mode on every request and
  selects either the exact fixture snapshot or the bounded worker-backed canonical
  live snapshot. Live output preserves opaque account/source provenance while
  excluding bodies, recipients, remote IDs, cursors, paths, keys, and raw errors.
- The bounded local-inspection renderer covers live-empty, recorded-syncing, offline,
  attention-required, cached-data, and local reload behavior without displaying
  canonical content or claiming provider work.
- The inactive disconnect service requires account-scoped canonical projection
  deletion in its durable mail-data phase and safely retries after fixture removal
  has already committed.
- The verified baseline is 51 test files and 332 tests plus strict TypeScript,
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
