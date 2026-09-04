# Gate 2D Lifecycle Readiness Audit

Last reviewed: 2026-09-04
Audit baseline: `2033e86` (`feat: persist safe sync status`)

## Verdict

The **encrypted local account-lifecycle and provider-mail foundations are complete
at their credential-free boundary**. The repository has verified storage,
retention, full local deletion, account removal, connection consistency, confirmed
orphan recovery, startup inventory, durable sync status, provider-independent sync,
encrypted projection, read surfaces, and disconnect orchestration contracts.

**Live Gmail authorization has been exercised; ingestion has not succeeded.** The narrow
connection, cancellation, and confirmed disconnect command boundary is implemented;
the canonical provider-independent
mail contract, credential-free sync coordinator, empty schema-v9 encrypted
projection, and packaged file-backed projection worker are now verified. The
coordinator-to-worker boundary is now integration-tested with the deterministic
provider and assembled in a production graph that starts with zero accounts. Canonical provider-mail
retention and journaled deletion are complete at their credential-free boundaries.
The real Google revoker, read-only Gmail adapter, and protected refresh-to-access-
token source are production-constructed; no automatic startup sync occurs.
The sample-to-live policy
is now a durable, credential-free, unexposed schema-v10 boundary.
Disconnect is production-constructed but has no active user command. The final
composition trace, trusted access-token slice, approved identity consent, and real
provider-inert desktop authorization protocol, bounded loopback/browser boundaries,
and trusted connection-activation coordinator leave no smaller credential-free
connection milestone. Activation now has an isolated Google Cloud project
(`posita-mail-hub-2026`), Gmail API, external testing consent with the exact approved
scopes, and a desktop client whose credentials were used only in the approved flow. One trusted-main
composition now owns the full graph but receives an explicit empty startup account
list. The real client ID and rotated secret are private, local, and loader-validated.
One user grant is OS-protected and access tokens remain memory-only. Preparation remains
non-activating, while a separate explicit execution command and paired disconnect are
present. The account is live-empty after a safe initial sync failure; no provider mail
or cursor was stored.

The original audit used no credential or provider request. The 2026-09-04 activation
evidence is recorded separately and contains no committed credential or mailbox data.

## Readiness matrix

| Area | Status | Verified evidence | Activation consequence |
| --- | --- | --- | --- |
| Renderer trust boundary | Ready | sandbox, context isolation, allow-listed validated preload/IPC, structural check | Keep provider payloads and credentials in main |
| Credential vault | Ready, one protected grant | OS-backed fail-closed protector and aggregate presence inspection | The refresh token never crosses trusted main |
| Encrypted private cache | Ready for current records | per-record AES-256-GCM, protected installation key, authenticated metadata, migrations, sanitization | Real records still require the provider-normalized schema below |
| Provider account/sync state | Ready, one connected pair | encrypted account plus safe `PROVIDER_UNAVAILABLE` sync state, with no cursor | Truthfully reports live-empty attention without exposing private values |
| Consent and local preflight | Approved | exact `google-gmail-readonly-identity-v2` projection plus a validated non-activating Settings/IPC readiness result | Viewing or preparing creates no authorization session, browser action, credential, or account state |
| Authorization session | Live-verified once | bounded begin/complete/cancel contract, S256 PKCE/state, exact callback, verified identity, and loopback/browser evidence | Protocol values remained trusted-main-only |
| Connection persistence | Live-verified once | vault-before-state ordering plus aggregate protected/encrypted presence evidence | Only the trusted-window command invoked it; no credential crossed IPC |
| Connection consistency/recovery | Ready locally | presence-only diagnosis plus same-window one-use confirmed orphan discard | Never reconstructs a connection or contacts Google |
| Retention | Ready | exact 90-day eviction, daily worker schedule, safe retry/status | Cleanup affects encrypted Posita data only |
| Full local deletion | Ready | confirmed Settings command, durable recovery, keyless restart, cryptographic erasure | Removes local projection ciphertext; never deletes remote provider mail |
| Account disconnect | Confirmed command implemented, not live-tested | five-minute same-window typed challenge, opaque durable intent audit, journaled idempotent service, and real fixed-endpoint revoker tests | Revokes Posita and removes its local data; never mutates Gmail mail |
| Canonical provider mail model | Activated but empty | exact validators, schema-v9 authenticated envelopes, worker ownership, and zero live records after the attempt | A verified retry may populate only through the sync coordinator |
| Sample/live boundary | Live-verified | durable live marker, zero sample rows, connected-pair gate tests | Samples were atomically removed and will not reseed |
| Live application read model | Live-empty attention verified | durable mode-aware query shows the protected account and zero summaries without exposing private storage detail | Reload remains local-only; no sync retry is exposed |
| Sync coordinator | Lifecycle-owned, zero-account startup | 90-day path, real worker integration, bounded concurrency, cancellation, retention exclusion, disconnect/deletion quiescence, key teardown, durable status, and explicit retry policy are tested | No retry or automatic inventory handoff is exposed |
| Gmail read adapter | Live attempt, no stored mail | fixed read-only routes, safe `PROVIDER_UNAVAILABLE` state, deterministic HTTP tests | No cursor or provider-mail record exists |
| Google access-token source | Live attempt plus compatibility fix | protected refresh read, memory-only access token, bounded optional refresh `id_token` accept-and-discard | Live retry is needed to confirm the suspected mismatch |
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

The owner approved the exact identity-plus-read-only scope set, credential-free
protocol core, installed-app client, private client-ID placement, and provider-inert
production graph. Separate explicit approval is still required before Posita may
expose an authorization-execution command, persist a real refresh token, or add any dependency.

Secrets and personal mailbox data must never enter Git, fixtures, logs, renderer
state, screenshots, tests, or portfolio assets.

The accepted consent now uses Google OpenID `sub` as the hidden stable provider
subject and requires its verified email to agree case-insensitively with Gmail
`users.getProfile`. The provider-inert adapter refuses widened scopes, callback origin,
path, or state drift, malformed identity, and ambiguous authorization-code replay.

## Final production-composition audit

The credential-free activation preflight and provider-inert ownership transition are
complete. When strict local configuration is available, production startup gives
retention, deletion suspension, sync shutdown, token teardown, and projection-key
teardown to the existing `ProviderMailLifecycleOwner`. It passes zero accounts and
does not hand over startup inventory, so no provider work begins. Missing/invalid
configuration retains the prior standalone maintenance path.

Implement activation in this order, without skipping or splitting the safety pair:

1. treat the deterministic-tested read-only Gmail adapter, idempotent revoker, access-
   token source, desktop OAuth/PKCE protocol, and lifecycle ownership as production-
   constructed but provider-inert,
2. after separate approval, expose only the narrow reviewed UI/IPC start/cancel/status
   boundary with no credentials in renderer or Git,
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
- `MailSyncCoordinator` is the single provider I/O owner inside the zero-account
  production graph.
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
- One zero-account production graph is complete; no dependency, public capability,
  credential,
  personal mailbox data, network action, privileged renderer capability, or mailbox mutation was
  added.

## Owner decision gate

The owner approved the real read-only Google adapter, revoker, exact OpenID/email/
Gmail-read-only consent, credential-free desktop authorization protocol core,
provider-inert loopback/browser infrastructure, trusted connection-activation
sequencing, and zero-account production ownership.
Those adapters and the prerequisite deletion-aware reconciliation are complete and
production-constructed without a caller. The separately approved Google Cloud project, Gmail API, external testing
consent, and desktop-client creation are complete. The owner approved one client-secret
rotation and private placement. The strict local configuration source contains only the
exact version-2 client ID and secret in an owner-readable application-data file, passes
validation, and feeds only the inert graph. No downloaded credential bundle is retained.
The owner later explicitly approved connecting the test account. Authorization completed,
but initial read-only sync stored no mail. A further live retry or disconnect remains a
separate decision; this approval never covers mailbox mutation.

## Original audit evidence

- `npm run verify` passes at the audit baseline: 39 test files, 258 tests, strict
  TypeScript, structural renderer-security checks, and production Electron builds.
- `staging`, `main`, and their public origin refs were aligned at `bf7baf9` when
  the audit began.
- The worktree was clean; no dependency, schema, secret, credential, personal
  mailbox data, or generated cache change was part of the audit.

These are engineering checks, not claims of external-user readiness, Gmail
approval, synchronization reliability, AI quality, adoption, or business impact.
