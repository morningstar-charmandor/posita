# Gate 2D Lifecycle Readiness Audit

Last reviewed: 2026-09-03
Audit baseline: `2033e86` (`feat: persist safe sync status`)

## Verdict

The **encrypted local account-lifecycle and provider-mail foundations are complete
at their credential-free boundary**. The repository has verified storage,
retention, full local deletion, account removal, connection consistency, confirmed
orphan recovery, startup inventory, durable sync status, provider-independent sync,
encrypted projection, read surfaces, and disconnect orchestration contracts.

**Live Gmail authorization and ingestion are not ready to activate.** This is a
deliberate gate, not a failed implementation. The canonical provider-independent
mail contract, credential-free sync coordinator, empty schema-v9 encrypted
projection, and packaged file-backed projection worker are now verified. The
coordinator-to-worker boundary is now integration-tested with the deterministic
provider but remains uncomposed from the running product. Canonical provider-mail
retention and journaled deletion are complete at their credential-free boundaries.
The real Google revoker, read-only Gmail adapter, and protected refresh-to-access-
token source are implemented but uncomposed; no production sync composition exists.
The sample-to-live policy
is now a durable, credential-free, unexposed schema-v10 boundary.
Disconnect has no production composition or active user command. The final
composition trace, trusted access-token slice, approved identity consent, and real
uncomposed desktop authorization protocol, bounded loopback/browser boundaries,
and trusted connection-activation coordinator leave no smaller credential-free
connection milestone. Activation now has an isolated Google Cloud project
(`posita-mail-hub-2026`), Gmail API, external testing consent with the exact approved
scopes, and a desktop client whose credentials remain unused. It still requires a
reviewed lifecycle/UI composition that consumes the now-complete inert, secret-safe
client-identifier configuration source,
dedicated-account testing, and owner approval.

No credential, provider connection, browser authorization, network request, Gmail
SDK, mailbox data, or model provider was used for this audit.

## Readiness matrix

| Area | Status | Verified evidence | Activation consequence |
| --- | --- | --- | --- |
| Renderer trust boundary | Ready | sandbox, context isolation, allow-listed validated preload/IPC, structural check | Keep provider payloads and credentials in main |
| Credential vault | Ready, empty | OS-backed fail-closed protector and `SecretVault`; deterministic fake tests | A future refresh token has a protected account-scoped destination |
| Encrypted private cache | Ready for current records | per-record AES-256-GCM, protected installation key, authenticated metadata, migrations, sanitization | Real records still require the provider-normalized schema below |
| Provider account/sync state | Ready, empty | versioned encrypted account/cursor records plus production-composed lifecycle status writer and fixed retry dispositions | Can store future connection identity and truthful bounded sync state without starting provider work |
| Consent | Approved, activation disabled | exact `google-gmail-readonly-identity-v2` projection of `openid`, `email`, and `gmail.readonly`; disabled Settings action | Viewing consent creates no authorization or account state |
| Authorization session | Infrastructure-ready, uncomposed | bounded begin/complete/cancel contract, deterministic fake, S256 PKCE/state, exact callback verification, bounded exchange, verified identity, ephemeral IPv4 loopback, and exact-URL browser-delegate tests | Client configuration, persistence/UI composition, real browser action, and live requests are absent |
| Connection persistence | Credential-free activation-ready, uncomposed | vault-before-state ordering, duplicate preflight, rollback, callback-before-browser sequencing, bounded callback retry, cancellation, and cleanup-failure tests | Not composed into production startup, preload, IPC, or UI |
| Connection consistency/recovery | Ready locally | presence-only diagnosis plus same-window one-use confirmed orphan discard | Never reconstructs a connection or contacts Google |
| Retention | Ready | exact 90-day eviction, daily worker schedule, safe retry/status | Cleanup affects encrypted Posita data only |
| Full local deletion | Ready | confirmed Settings command, durable recovery, keyless restart, cryptographic erasure | Removes local projection ciphertext; never deletes remote provider mail |
| Account disconnect | Adapter-ready, inactive | journaled idempotent service plus real fixed-endpoint revoker with deterministic HTTP tests | Needs production lifecycle composition and separately reviewed user command |
| Canonical provider mail model | Activation-ready, empty | exact validators, schema-v9 authenticated envelopes, opaque row IDs, packaged serial worker, fixed-window retention, journaled account deletion, lifecycle ordering, inventory, and durable status | Must remain empty until the paired Google activation plan is approved |
| Sample/live boundary | Ready, unexposed | schema-v10 one-way mode, connected-pair gate, atomic sample removal, restart/no-reseed and retry tests | Must be invoked only by reviewed connection/sync composition |
| Live application read model | Ready at credential-free presentation boundary | durable mode-aware query, encrypted human-readable account identity, bounded canonical recent-mail list and source detail, fixed validated IPC/preload, worker ownership, loading/missing/error/retry UI, and confirmed main-derived original-source handoff | Contains no live record until separately approved provider activation |
| Sync coordinator | Lifecycle-owned, uncomposed | 90-day path, real worker integration, bounded concurrency, cancellation, retention exclusion, disconnect/deletion quiescence, key teardown, durable status, and explicit retry policy are tested | Needs a separately approved provider composition; no retry command is exposed |
| Gmail read adapter | Ready, uncomposed | fixed read-only routes, versioned full/history cursors, bounded normalization, deletion events, safe failures, deterministic HTTP and coordinator integration tests | Trusted access-token source exists; client configuration and production lifecycle composition remain absent |
| Google access-token source | Ready, uncomposed | protected account-scoped refresh read, fixed bounded token exchange, memory-only expiry cache, cancellation, invalidation, safe failures, deterministic tests | Requires client configuration and lifecycle-owned invalidation/teardown before activation |
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
- one bounded invalid-cursor resync that collects a complete 90-day window before
  atomically replacing stale provider records.

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

The owner approved the exact identity-plus-read-only scope set and the credential-
free protocol core. A separate explicit approval is still required before Posita
may add or configure:

- a Google installed-app OAuth client,
- refresh-token persistence through production composition,
- any dependency needed for those capabilities.

Secrets and personal mailbox data must never enter Git, fixtures, logs, renderer
state, screenshots, tests, or portfolio assets.

The accepted consent now uses Google OpenID `sub` as the hidden stable provider
subject and requires its verified email to agree case-insensitively with Gmail
`users.getProfile`. The uncomposed adapter refuses widened scopes, callback origin,
path, or state drift, malformed identity, and ambiguous authorization-code replay.

## Final production-composition audit

The credential-free activation preflight is complete. Production startup currently
owns the retention scheduler and read-worker shutdown directly, which is correct
while provider sync is inactive. Once Google activation is approved, those duties
must move together under the existing `ProviderMailLifecycleOwner`; Posita must not
run a second scheduler, sync owner, projection worker, or deletion gate.

Implement activation in this order, without skipping or splitting the safety pair:

1. treat the deterministic-tested read-only Gmail adapter, idempotent revoker, and
   access-token source as complete and uncomposed,
2. treat the approved desktop OAuth/PKCE protocol, loopback/browser boundaries, and
   credential-free connection activation sequence as complete and uncomposed; after
   separate approval and client configuration, expose only the narrow reviewed UI/
   IPC start/cancel/status boundary with no credentials in renderer or Git,
3. expose a separately confirmed disconnect path and keyless pending-disconnect
   startup resume before accepting the first real account,
4. give one `WorkerThreadMailSyncProjection` instance to reads, sync commits,
   account deletion, shutdown, and key destruction,
5. construct one `MailSyncCoordinator` and one `ProviderMailLifecycleOwner`; feed
   only the bounded complete-pair startup inventory and existing sync-status service,
6. replace standalone retention start/stop, deletion suspension, and projection
   shutdown wiring with that lifecycle owner, preserving local-data-deleted startup,
7. expose only bounded status and explicit user retry; do not add autonomous polling
   until quota/backoff behavior is separately reviewed,
8. run credential-free integration first, then use a dedicated test account only
   after a separate credential/configuration approval and privacy-safe test plan.

This sequence reuses the current architecture. It adds no new repository, parallel
mail model, second cursor store, generic IPC bridge, or renderer provider client.

## Completed credential-free contract evidence

- `ProviderMailMessageV1` and `ProviderMailThreadV1` are the only provider-ingestion
  contracts; exact validators reject unknown, unbounded, cross-account, and
  internally inconsistent normalized data.
- `MailSyncCoordinator` is the single provider I/O owner at the application layer
  and remains uncomposed from the running product.
- Deterministic tests prove the 90-day request boundary, per-account single-flight,
  bounded cross-account work, replay deduplication, remote-deletion tombstones,
  batch/cursor ordering, commit failure rollback, one complete atomic invalid-cursor
  replacement, cancellation, supersession, and safe provider failures.
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
- The bounded live renderer covers live-empty, recorded-syncing, offline,
  attention-required, cached-data, local reload, recent canonical summaries, and
  exact encrypted-local source detail without claiming provider work.
- The inactive disconnect service requires account-scoped canonical projection
  deletion in its durable mail-data phase and safely retries after fixture removal
  has already committed.
- The current verified baseline is 71 test files and 456 tests plus strict TypeScript,
  renderer structure/security checks, and production Electron builds.
- One inert client-identifier configuration source is complete; no dependency,
  production composition, real identifier, credential,
  personal mailbox data, network action, privileged renderer capability, or mailbox mutation was
  added.

## Owner decision gate

The owner approved the real read-only Google adapter, revoker, exact OpenID/email/
Gmail-read-only consent, credential-free desktop authorization protocol core,
uncomposed loopback/browser infrastructure, and trusted connection-activation
sequencing.
Those adapters and the prerequisite deletion-aware reconciliation are complete and
uncomposed. The separately approved Google Cloud project, Gmail API, external testing
consent, and desktop-client creation are complete. The client credential was not
downloaded or used. The strict local configuration source is complete but contains
no real identifier and is not composed. This approval does not authorize credential
download or use, production runtime composition, connecting an account, real browser action, network
testing with Google, or ingesting mail; those remain later explicit gates.

## Original audit evidence

- `npm run verify` passes at the audit baseline: 39 test files, 258 tests, strict
  TypeScript, structural renderer-security checks, and production Electron builds.
- `staging`, `main`, and their public origin refs were aligned at `bf7baf9` when
  the audit began.
- The worktree was clean; no dependency, schema, secret, credential, personal
  mailbox data, or generated cache change was part of the audit.

These are engineering checks, not claims of external-user readiness, Gmail
approval, synchronization reliability, AI quality, adoption, or business impact.
