# Posita

**Your inboxes, understood as one.**

Posita is a desktop-first personal mail hub organized around people, topics,
context, and actions rather than separate inboxes.

Public repository: [github.com/morningstar-charmandor/posita](https://github.com/morningstar-charmandor/posita)

## Current status

Gate 2D's credential-free lifecycle foundation is complete and approved Google
adapter implementation is in progress. Posita includes a Daily Brief,
topic timeline with source citations, original-message inspection, a unified
classic mail view, and an editable draft flow. Realistic fixture data is seeded
idempotently as independently authenticated AES-256-GCM records in a versioned
local SQLite database and loaded through validated, read-only Electron IPC. A
per-installation data key is protected by the operating-system vault. Schema v4
adds versioned encrypted provider-account and sync-state records with strict
account isolation; those tables contain no real account. Schema v5 adds an opaque,
non-sensitive lifecycle journal that can survive deletion of that encryption key.
Schema v6 and a deterministic application service add fail-closed 90-day
retention with atomic derived-data eviction. Main now owns an immediate startup
pass and bounded 24-hour cadence for file-backed caches, with the full maintenance
operation running in a dedicated worker.
Startup upgrades only an exact historical fixture cache whose messages all lack
absolute timestamps. It replaces that known simulated dataset with the current
timestamped encrypted fixtures and refuses mixed, edited, partial, or unknown data.
Schema v7 stores only opaque, operation-bound confirmation receipts for destructive
local deletion; the typed confirmation text is never persisted. Startup removes
strictly expired receipts unless their deletion operation is still pending, so a
safe in-process retry cannot lose its authorization binding.
Account removal now deterministically preserves unaffected sources while evicting
touched derived context. A crash-resumable disconnect orchestrator now coordinates
revocation, credential deletion, provider-state deletion, local-data removal, and
compaction through interfaces and deterministic tests. A separate installation-wide
orchestrator now journals deletion of all refresh credentials, encrypted account
state, mail records, SQLite remnants, the OS-protected data key, and its in-memory
copy. Account disconnect remains non-user-triggerable because there is no live
Google revoker. Full local deletion is now available under Settings & privacy
through separate prepare and execute IPC methods. Execution requires a five-minute
typed confirmation bound to one operation, and pending journal state has a bounded
safe-status projection. One validated read-only application-state query now
renders pending, retry-required, recovery-required, and completed local-deletion
outcomes. No other lifecycle command is exposed. Gmail and AI providers
are not connected, no real OAuth credential exists, and sending is deliberately
disabled.

Settings now includes a validated `google-gmail-readonly-v1` connection-consent
preview. It explains the planned `gmail.readonly` scope, 90-day encrypted local
window, inactive AI-provider boundary, and disconnect behavior. The connect action
is intentionally disabled: no Google OAuth client, credential, or live account is
configured.

The trusted backend now defines a bounded provider-independent authorization
session contract and deterministic fake for credential-free testing. It validates
the reviewed consent, read-only scope, HTTPS authorization target, loopback
callback, expiry, cancellation, and safe failures. Nothing composes this adapter
into startup or exposes it through preload, IPC, Settings, or a browser.

A trusted account-connection coordinator now composes that interface with the
existing vault and encrypted account-state contracts in credential-free tests.
It preflights duplicate or inconsistent state, stores a successful refresh grant
in the vault before provider identity, and removes both on an ambiguous state
write. Cleanup failure becomes an explicit recovery-required error. The service
is not production composition and has no renderer, browser, network, or real-token
path.

The same coordinator now provides a main-process-only, versioned consistency
inspection for one opaque account. It reports only `absent`, `connected`,
`credential-only`, or `provider-state-only`. A new vault presence query checks
for protected credential existence without decrypting or re-protecting it. No
automatic repair or startup mutation is attached to inspection.

The approved local recovery policy and its dedicated durable confirmation producer
are now available through a narrow Settings & privacy flow. Schema v8 stores only opaque,
short-lived account/status-bound recovery receipts; the exact typed challenge text
is never persisted. A receipt is atomically marked consumed before deletion, so
it cannot authorize a later orphan with the same account and status. Recovery
refuses complete or already-absent connections, rechecks for stale state, and
deletes exactly the orphaned credential or encrypted provider/sync state. Success
returns the account to `absent` and requires a fresh connection. A failed or
interrupted deletion requires fresh confirmation. Preparation and execution use
separate validated preload/IPC methods bound to the same trusted window. The UI
states that current accounts and mail are samples, and recovery never opens a
browser, contacts Google, reconstructs a connection, or changes a provider mailbox.

Startup now has one cancellable lifecycle-recovery owner. If a full deletion is
journaled, it resumes through deletion-only SQLite and vault operations without
loading or creating the encryption key. A completed marker keeps later restarts
in `local-data-deleted` mode and prevents fixture reseeding. Pending account
disconnect remains inactive because no live authorization revoker exists.
File-backed retention, fixture compatibility, disconnect, and deletion sanitization now run
through one single-flight worker-thread adapter, keeping `VACUUM` and WAL
checkpoint work off Electron's main event loop. Bounded in-memory tests retain an
explicit inline adapter; the existing one-time legacy plaintext migration remains
inline so its migration transaction keeps one connection owner.

Settings & privacy now shows bounded automatic-retention state: running, last
completed check, next scheduled check, and a safe automatic-retry error. A fixed
validated main-to-renderer event refreshes this state in place. It exposes no
database path, raw worker error, key material, or mailbox content, and states that
local cleanup never changes Gmail.

Preparing local deletion only returns bounded consequence copy and two opaque IDs;
it creates no deletion journal. The execute request is accepted only from the same
trusted window after exact `DELETE LOCAL DATA` confirmation. It removes Posita's
local fixture cache, stored Posita credentials, and encryption key, but never
deletes or changes provider mail.

A versioned canonical provider-independent source-message/thread contract and one
credential-free sync coordinator now prove strict normalization, 90-day initial
import, account isolation, replay deduplication, atomic batch/cursor ordering,
bounded invalid-cursor recovery, concurrency, cancellation, and safe failures
through deterministic fakes. Schema v9 adds a credential-free authenticated
SQLite projection that atomically stores canonical messages, threads, and the
encrypted account cursor; source IDs and content remain ciphertext, while opaque
local storage IDs enforce account isolation. The existing `Message` remains a
sample-only view and receives no invented provider identity. The projection is
empty and uncomposed from startup, IPC, UI, or Google. A packaged single-flight
worker adapter now keeps file-backed projection reads, decrypt/scan, encryption,
and commits off Electron's main event loop, validates a bounded protocol, and
erases its retained key context. All visible mail remains deterministic sample data.

The normalized provider/commit batch is now a strict deletion-aware v2 contract.
Incremental tombstones remove remotely deleted cached messages and repair affected
threads in the same transaction as cursor advancement. Invalid-cursor recovery
collects the complete bounded 90-day window before one authoritative replacement,
so incomplete recovery cannot partially erase the encrypted projection. This path
is still deterministic, credential-free, and uncomposed.

The inactive journaled disconnect service now requires that worker-backed
projection remover in its local mail-data phase. If canonical deletion fails after
sample data was already removed, retry resumes the same phase safely and repeats
both idempotent actions. A real Google revoker now implements that contract but
remains uncomposed; there is still no disconnect UI, credential, or provider account.

The existing automatic retention worker now applies the same exact 90-day cutoff
to canonical provider messages by absolute `receivedAt`. It retains the boundary,
removes empty provider threads, rewrites partially retained threads as authenticated
ciphertext, preserves sync cursors, and completes or resumes SQLite sanitization.
The canonical projection remains empty in the running product, and sync, Gmail,
OAuth, credentials, preload, and UI activation remain uncomposed.

The credential-free sync coordinator is now also verified end to end against the
real file-backed encrypted projection worker and deterministic provider. The
integration covers multi-page initial sync, encrypted-cursor resume, replay,
cursor conflicts, cancellation, and key teardown. This is test composition only:
startup sync, polling, Gmail, credentials, preload, and UI remain inactive.

Schema v10 now records an explicit installation mail mode. A trusted, unexposed
transition requires an already complete local account connection, then commits
sample-record removal and the one-way switch to `live` together. Startup never
reseeds samples in live mode, including after every account is disconnected, and
requires the existing encryption key instead of silently creating a replacement.
Compaction is safely retryable after the logical switch. This policy is verified
with deterministic data only and does not activate OAuth, Gmail, sync, preload,
IPC, or UI behavior.

A credential-free provider-mail lifecycle owner now defines the missing runtime
ordering without activating it. On startup, a bounded trusted account inventory
enters live mode before initial sync and starts retention only after that sync
settles. Later sync pauses retention; disconnect first prevents new sync and waits
for active provider work before local mutation; confirmed full deletion uses the
same quiescence gate; shutdown settles both workers before erasing the projection
worker's retained key. Offline startup returns a safe retry-required outcome and
never restores samples. The owner remains outside Electron startup, IPC, UI, and
Google composition.

Trusted startup now also composes a credential-free sync-status service over the
existing encrypted account-state repository. The lifecycle owner records each
account as syncing before provider work, persists the new cursor and success time
after a valid result, returns cancellation to idle, and records typed safe failures.
A fixed policy distinguishes immediate manual retry, delayed retry, reconnect,
review, and cancellation; it does not schedule work. If status persistence is
unavailable, provider work does not start. No retry command, provider, credential,
network request, or Gmail access is activated.

The final production-composition audit confirms there is no smaller standalone
credential-free milestone left. Future activation must pair a read-only Gmail
adapter with an idempotent revoker, then reuse the existing projection worker,
sync coordinator, lifecycle owner, encrypted status, retention gate, deletion
gate, and shutdown path. Implementing that adapter requires explicit approval;
credentials and connecting an account remain later, separate decisions.

The first approved adapter slice is a real but uncomposed Google OAuth revoker.
It reads one account-scoped refresh token only from the protected vault, sends it
in a form-encoded body to Google's fixed HTTPS revocation endpoint, bounds the
response, and treats only Google's documented `invalid_token` response as the
required already-revoked success. It uses injected networking in tests, adds no
dependency, and is not reachable from startup, IPC, UI, or a real account.

The existing application-state query is now mode-aware. Sample installations keep
the deterministic fixture workspace; live installations use a fixed worker-backed
canonical summary query and can truthfully show live-empty, recorded-syncing,
offline, attention-required, or cached-data status. The projection is capped at
50 summaries and 32 account scopes and excludes bodies, recipients, remote
provider IDs, provider-account subjects, cursors, paths, keys, and raw failures.
Provider-account record v2 stores a provider-verified mailbox address and optional
user-defined display label in authenticated ciphertext, separate from the hidden
provider subject. Live status shows that identity instead of the opaque account
scope, with an explicit unavailable state for incomplete local records. The live
renderer now presents bounded encrypted-local recent-mail summaries with visible
account provenance, unread and attachment cues, and direct source selection, plus
a two-step confirmed Gmail browser handoff. Reloading checks local
state; it does not contact Gmail or retry sync. No provider, credential, network
request, AI service, or mailbox mutation was activated.

A credential-free canonical source-detail query is now implemented and composed
through the shared, encrypted SQLite, packaged worker, fixed IPC/preload, and
renderer layers. It accepts only an opaque Posita
account/message pair and returns exact found/missing state, canonical provenance,
visible encrypted account identity, sender/recipients, timestamps, subject, safe
attachment metadata, and at most 128 KiB of plain text with explicit truncation.
Provider IDs, HTML, paths, keys, and raw errors are excluded. The renderer covers
loading, exact missing, safe error, retry, and superseded-result behavior.
After a source is found, an explicit confirmation can ask the default browser to
open a strictly allow-listed Gmail target derived in main from encrypted provenance.
No URL or provider ID crosses renderer IPC, and Posita reports only the browser
handoff—not that Gmail navigation or sign-in succeeded.

Startup now also performs one trusted, read-only provider-account inventory. It
compares at most eight encrypted provider-account scopes with protected Google
credential scopes without decrypting credential values. Only complete pairs become
future lifecycle sync requests; any one-sided pair is reported as recovery-required.
The result stays in main and does not start sync, authorization, or provider access.

Read the build boundaries before extending the prototype:

- [Agent contract](AGENTS.md)
- [Machine-readable project map](project.agent.json)
- [Continuity handoff](docs/HANDOFF.md)
- [Project history](docs/PROJECT_HISTORY.md)
- [Portfolio case study](docs/CASE_STUDY.md)
- [MVP scope](docs/MVP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision log](docs/DECISIONS.md)
- [Local data foundation](docs/DATABASE.md)
- [Privacy and retention](docs/PRIVACY.md)
- [Encrypted cache](docs/ENCRYPTED_CACHE.md)
- [Gmail authorization boundary](docs/GMAIL.md)
- [Gate 2D lifecycle readiness audit](docs/GATE_2D_READINESS.md)
- [AI-agent-friendly engineering](docs/ENGINEERING.md)
- [Original product vision](product-spec.md)

## Run locally

Prerequisites: Node.js 24.18.x and npm 11.16.x.

```bash
npm install
npm run dev
```

## Verification

The canonical completion gate is:

```bash
npm run verify
```

It checks repository structure and security boundaries, type safety, automated
behavior, and the production bundle without requiring credentials or network
access.

## Branch workflow

- `main` contains stable verified checkpoints.
- `staging` is the persistent integration branch for ongoing development.
- Feature work is integrated into `staging` and promoted to `main` only after the
  canonical verification and documentation gates pass.

Future development sessions should normally begin from an up-to-date `staging`.

## Working with AI agents

Every agent should begin with [AGENTS.md](AGENTS.md) and
[project.agent.json](project.agent.json), then read
[the continuity handoff](docs/HANDOFF.md). Together they describe the current
milestone, source-of-truth order, repository entry points, safety invariants,
known blockers, next step, and definition of done. Project state, milestone
evidence, and portfolio narrative are maintained in-repository so continuation
never depends on access to an earlier conversation.

## Trust boundary

The React renderer has no Node.js access. Electron context isolation and process
sandboxing are enabled, navigation is denied by default, and the preload bridge
exposes versioned read-only application-state and one-message source-detail
methods plus two narrow pairs of
prepare/execute methods for confirmed local deletion and confirmed incomplete-
connection recovery, plus non-sensitive desktop metadata. SQLite lives behind
main-process repository, sanitization, and
credential-vault interfaces; file-backed compaction runs in a dedicated worker
and the renderer receives only a validated application state. Source and
derived fixture records
use authenticated encryption with an OS-protected installation key. Neither the
key nor vault has an IPC surface. Personal-mail ingestion remains blocked until
the approved schema-v10 transition is wired into a verified production sync
lifecycle and provider activation is separately approved.
