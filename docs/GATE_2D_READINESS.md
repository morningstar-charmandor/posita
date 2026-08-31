# Gate 2D Lifecycle Readiness Audit

Last reviewed: 2026-08-31
Audit baseline: `bf7baf9` (`feat: schedule encrypted retention maintenance`)

## Verdict

The **encrypted local account-lifecycle foundation is ready at its current
credential-free boundary**. The repository has verified storage, retention,
full local deletion, account-removal, connection consistency, confirmed orphan
recovery, and disconnect orchestration contracts.

**Live Gmail authorization and ingestion are not ready to activate.** This is a
deliberate gate, not a failed implementation. The current shared `Message` model
is still shaped for deterministic product fixtures and does not yet satisfy the
accepted provider-normalization and resumable-sync contract in `GMAIL.md`.
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
| Full local deletion | Ready | confirmed Settings command, durable recovery, keyless restart, cryptographic erasure | Never deletes provider mail |
| Account disconnect | Orchestrator-ready, inactive | journaled idempotent application service and deterministic revoker tests | Needs a real idempotent revoker and separately reviewed user command |
| Canonical provider mail model | **Not ready** | accepted requirements exist in `GMAIL.md`; current fixture `Message` lacks required provider fields | Blocks real ingestion |
| Sync coordinator | **Not implemented** | ownership, batching, cursor, retry, cancellation, and reconciliation rules are documented | Blocks real ingestion |
| Gmail adapter | **Not implemented** | adapter contract is documented only | Blocks OAuth and mail access |
| AI provider | Deferred | no model adapter, prompt, embedding, or model output path | Fixture summaries/drafts remain explicitly simulated |

## Blocking gaps before real mail

### 1. Canonical provider-independent source model

Before a Gmail payload may enter application state, one versioned canonical model
must represent at least:

- opaque Posita account ID and namespaced provider message/thread IDs,
- sender and all recipient roles,
- absolute sent and received timestamps,
- subject, normalized plain body, and reviewed/sanitized HTML representation,
- labels, read state, and bounded attachment metadata,
- immutable provider provenance and a safe path to the original source,
- runtime validation that rejects unknown or unbounded provider data.

The existing fixture model should not be silently stretched or duplicated. The
next implementation must define an explicit compatibility/migration plan for the
current encrypted fixtures before changing persistent source records.

### 2. One resumable sync owner

One trusted coordinator must own provider I/O and prove, with a deterministic
fake:

- a bounded initial 90-day import,
- account-scoped single-flight execution and bounded cross-account concurrency,
- atomic batch plus cursor commit,
- idempotent replay using `(accountId, providerMessageId)`,
- cancellation on shutdown, disconnect, and supersession,
- typed offline, authentication, permission, quota, malformed-payload, invalid-
  cursor, and provider-unavailable outcomes,
- documented bounded cursor recovery without erasing user corrections or derived
  provenance.

UI and AI features may request this coordinator; neither may become another Gmail
client or polling owner.

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

Proceed with a **credential-free provider mail and sync contract milestone**:

1. design the canonical provider-independent source/thread/recipient/attachment
   model and its versioned validators,
2. document the fixture compatibility and encrypted-record migration decision,
3. define one sync coordinator interface, stable typed errors, cancellation, and
   deterministic fake,
4. prove account isolation, idempotent replay, atomic cursor ordering, and failure
   paths without network access,
5. keep startup, preload, UI activation, Google code, credentials, and live data
   unchanged.

This follows already accepted architecture and does not itself authorize Gmail.
It is the smallest safe step that removes a real technical blocker.

## Owner decision gate

No owner decision is needed to continue the recommended credential-free contract
work. Explicit owner approval is required before any real Google adapter,
credential configuration, browser authorization, production connection command,
or live mailbox access is introduced.

## Audit evidence

- `npm run verify` passes at the audit baseline: 39 test files, 258 tests, strict
  TypeScript, structural renderer-security checks, and production Electron builds.
- `staging`, `main`, and their public origin refs were aligned at `bf7baf9` when
  the audit began.
- The worktree was clean; no dependency, schema, secret, credential, personal
  mailbox data, or generated cache change was part of the audit.

These are engineering checks, not claims of external-user readiness, Gmail
approval, synchronization reliability, AI quality, adoption, or business impact.
