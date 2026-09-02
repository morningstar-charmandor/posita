# Decision Log

## ADR-001: Prove the product with fixtures before connecting Gmail

- Status: accepted
- Context: Gmail OAuth and AI integration add security, quota, and failure modes
  before the interaction model has been validated.
- Decision: complete one source-grounded vertical slice with realistic fixtures.
- Consequence: early UI behavior is real, while sync and generation are clearly
  labeled as simulated.

## ADR-002: Use Electron for the first two gates

- Status: accepted, review after Gate 2
- Context: Node is available in the workspace; Rust is not. Desktop OAuth,
  keychain access, background work, and packaging are core requirements.
- Decision: Electron with an isolated renderer and narrow preload bridge.
- Consequence: faster initial delivery and a larger runtime footprint. Tauri
  remains an evidence-based future option.

## ADR-003: Keep providers outside the domain

- Status: accepted
- Context: Posita begins with Gmail but should not encode Gmail semantics into its
  people, topic, action, or brief models.
- Decision: normalize provider records through adapter interfaces.
- Consequence: extra mapping work now; safer multi-provider support later.

## ADR-004: Require citations for generated factual claims

- Status: accepted
- Context: summaries of personal communication must be inspectable and trusted.
- Decision: generated claims carry source message IDs and fail validation when
  their sources are unavailable.
- Consequence: some answers will be shorter or marked uncertain rather than
  sounding complete without evidence.

## ADR-005: Never expose secrets to the renderer

- Status: accepted
- Context: the renderer displays message content and should be treated as an
  untrusted boundary.
- Decision: OAuth, keychain, database, Gmail, and AI credentials stay in the main
  process and infrastructure adapters.
- Consequence: all privileged capabilities require typed IPC contracts.

## ADR-006: Treat AI-agent friendliness as an engineering invariant

- Status: accepted
- Context: Posita will be developed collaboratively with AI agents and may later
  expose agent-facing product tools. Hidden conventions, credential-dependent
  tests, and loosely typed cross-layer behavior make both forms unsafe.
- Decision: maintain a root agent contract, machine-readable project map, one
  deterministic verification command, strict process boundaries, accessible UI
  semantics, typed/versioned tool contracts, and credential-free fake adapters.
- Consequence: changes that move entry points, commands, boundaries, or milestone
  state also update these interfaces. `npm run verify` enforces the invariants
  that can be checked mechanically.

## ADR-007: Use built-in SQLite behind a repository boundary

- Status: accepted for Gate 2A; reassess before production-scale indexing
- Context: Electron 43.4 embeds Node 24.18 with the built-in `node:sqlite` module.
  Adding a third-party native SQLite package would introduce ABI rebuild and
  installer risk before Posita needs capabilities beyond the embedded engine.
- Decision: use `DatabaseSync` only in the main process behind `MailRepository`.
  Apply numbered transactional migrations and expose data through one versioned,
  validated, read-only IPC contract.
- Consequence: the initial snapshot path is dependency-light and deterministic.
  Because database calls are synchronous, heavy sync, search, and indexing must
  move to a worker or Electron utility process before production-sized mailboxes.

## ADR-008: Fail closed around OS-protected credentials

- Status: accepted
- Context: Desktop OAuth requires a long-lived refresh credential. Renderer
  storage and plaintext database values are outside Posita's trust boundary, and
  Electron can report an insecure plaintext fallback on Linux.
- Decision: persist refresh tokens only through a narrow main-process
  `SecretVault` using asynchronous Electron `safeStorage`. Reject unavailable,
  `basic_text`, and unknown protection backends. Persist the protection scheme
  with each opaque ciphertext so rotation and incompatible data fail explicitly.
- Consequence: some Linux environments cannot connect an account until a
  supported secret store is available. Tests use an explicitly non-production
  deterministic fake. No secret-vault capability is exposed over IPC.

## ADR-009: Bound private-alpha mail retention to 90 days

- Status: accepted for Gate 2; configurable in Gate 3
- Context: Posita needs enough recent history to build useful context without
  silently accumulating an indefinite copy of a personal mailbox.
- Decision: import and retain a rolling 90-day window. Evict derived artifacts
  with their source mail, purge account-scoped local data on disconnect, and
  never modify Gmail as part of local retention or deletion.
- Consequence: older context is unavailable in the alpha. Real ingestion remains
  disabled until encrypted cache, eviction, and deletion paths are implemented
  and verified across SQLite database and sidecar files.

## ADR-010: Encrypt private data as independently authenticated records

- Status: accepted for Gate 2C
- Context: built-in `node:sqlite` has no transparent database encryption, adding
  a native SQLCipher dependency creates Electron ABI and packaging risk, and a
  single encrypted snapshot would make incremental sync and scoped deletion
  unnecessarily expensive.
- Decision: store each account, person, message, topic, and brief item as a
  versioned AES-256-GCM record. Bind all queryable metadata as associated data.
  Protect one random per-installation data key through the existing OS-backed
  vault. Keep no plaintext search index.
- Consequence: the trusted main process decrypts and validates records before
  application use. Querying encrypted content is intentionally limited until a
  separate search design evaluates leakage and scale. Missing keys and tampered
  records make the cache unavailable rather than causing silent reset.

## ADR-011: Centralize account-scoped sync and source identity

- Status: accepted for the future provider boundary; runtime sync is not built
- Context: Multiple accounts, retries, local caching, and AI-derived organization
  create duplicate-fetch, cross-account authorization, and source-identity risks
  if each feature manages its own provider state.
- Decision: use one trusted sync coordinator and one provider-independent mail
  model. Scope provider messages, threads, cursors, credentials, and commands to
  a Posita account. Treat provider mail as authoritative remote state and the
  encrypted cache as an explicitly reconciled projection. Keep deduplication and
  provider threading centralized and idempotent; AI remains downstream.
- Consequence: screens and AI features consume application state rather than
  calling providers. Cross-account lookalikes remain distinct source records,
  sync needs typed status and recovery contracts, and local corrections and
  derived artifacts require ownership separate from provider fields.

## ADR-012: Keep deletion progress outside the deletable key boundary

- Status: accepted for Gate 2D
- Context: A crash-resumable deletion workflow must know what remains after an
  interruption. Encrypting its only progress marker with the installation data
  key would make the marker unreadable after the workflow deletes that key.
- Decision: persist a strict lifecycle journal containing only a version, opaque
  operation ID, allow-listed operation and phase, optional opaque account scope,
  and safe error code. Store no address, provider ID, credential, cursor, mail,
  derived content, or arbitrary error text in it.
- Consequence: deletion can resume after cryptographic erasure without weakening
  private-data encryption. The journal itself reveals that an operation and phase
  exist, so its fields remain minimal, bounded, allow-listed, and removable only
  after completion.

## ADR-013: Evict derived topics touched by account removal

- Status: accepted for Gate 2D
- Context: A topic may join messages from several accounts, while its summary,
  status, priority, and next action can depend on every source. After one account
  is removed, filtering citations alone could leave plausible but stale claims.
- Decision: delete every derived topic touched by a removed source and its
  dependent brief items. Preserve source messages from other accounts so a future
  classifier or user action can rebuild context. Preserve untouched topics and
  people still referenced by retained sources or topics.
- Consequence: disconnect may temporarily remove useful cross-account grouping,
  but it cannot retain an uncited interpretation or erase another account's source
  record. The projection is deterministic and idempotent for crash retries.

## ADR-014: Advance disconnect only after idempotent phase completion

- Status: accepted for Gate 2D
- Context: Revocation, vault deletion, encrypted-state removal, mail projection,
  and SQLite compaction cross different failure boundaries. A crash can occur
  after an action succeeds but before its progress marker is saved.
- Decision: execute disconnect as one single-flight operation per account. Keep
  the current phase until its idempotent action succeeds, then persist the next
  phase. On action failure, retain the phase with an allow-listed safe error. A
  journal-save failure causes the same action to be retried.
- Consequence: revocation and every local deletion/compaction step must treat an
  already absent target as success. Disconnect can resume without guessing, but
  completion is not reported until every phase and its journal advance succeeds.

## ADR-015: Erase the shared data key last during full local deletion

- Status: accepted for Gate 2D
- Context: Installation-wide deletion crosses refresh credentials, encrypted
  account state, encrypted mail records, SQLite remnants, OS-protected key
  material, and a live in-memory encryption context. Deleting the shared key too
  early would prevent orderly record cleanup; deleting it too late would leave
  recoverable private ciphertext after false completion.
- Decision: journal one installation-global operation and execute idempotent
  phases in this order: refresh credentials, encrypted account state, encrypted
  mail records, SQLite compaction/WAL truncation, OS-vault data-key deletion, and
  in-memory key destruction. Advance the journal only after each action succeeds.
  The durable journal prevents overlapping full deletion and account disconnect.
- Consequence: cryptographic erasure is the final private-data boundary and can
  be retried after action/journal crash windows. Production activation remains
  blocked until startup can resume a pending deletion without generating a
  replacement key, and until an explicitly confirmed user command owns status.

## ADR-016: Separate destructive authorization from crash recovery

- Status: accepted for Gate 2D
- Context: Starting full local deletion must require current explicit user intent,
  while resuming an already-started deletion after a crash must not depend on a
  UI, an unexpired prompt, or an encryption key that may already be gone.
- Decision: require a five-minute, exact-text confirmation challenge bound to one
  generated operation ID before a new deletion journal can be created. Persist
  only the opaque confirmation/operation IDs, action type, and timestamps. Never
  persist the entered phrase. Provide a separate recovery entry point that can
  only resume an existing delete-local-data journal operation. Project lifecycle
  status into bounded stages, progress counts, safe error codes, and truthful
  `pending`/`retry-required` states.
- Consequence: renderer navigation or a stale confirmation cannot create a new
  destructive operation, and restart recovery never silently creates one. The
  confirmation receipt is auditable non-private operational data. No command or
  status IPC is activated; ADR-017 defines the required startup recovery owner.

## ADR-017: Recover full deletion before key bootstrap

- Status: accepted for Gate 2D
- Context: Normal startup previously called `loadOrCreate` before inspecting the
  lifecycle journal. After key erasure, that could generate a replacement key and
  reseed fixtures, undoing the user's local-deletion outcome.
- Decision: apply migrations, open the non-sensitive lifecycle journal and vault,
  and run one cancellable recovery pass before any cache-key operation. Resume
  full deletion through a deletion-only adapter that can remove credentials,
  encrypted rows, SQLite remnants, and the protected key without decrypting or
  creating anything. Treat a completed full-deletion journal entry as a durable
  local-data-deleted marker on every later startup. While disconnect is pending,
  require the existing key and suppress fixture seeding even if the cache is empty.
- Consequence: full deletion can finish when the key is already missing, and
  neither recovery nor a later restart recreates the key or fixtures. Conflicting
  pending lifecycle entries fail closed. Pending disconnect is reported but not
  resumed until a real idempotent revocation adapter exists, and startup cannot
  undo its local deletion phase. Current bounded fixture recovery runs during
  startup. ADR-022 now moves file-backed compaction off the Electron main event
  loop before real mailbox volume.

## ADR-018: Expose one read-only application-state query

- Status: accepted for Gate 2D
- Context: The renderer needs truthful deleted, pending, and retry-required states,
  but independently loading mail and lifecycle status could race and would widen
  the preload surface before any lifecycle command is approved.
- Decision: replace the renderer-facing snapshot method with one versioned,
  validated `loadApplicationState` query. Main composes fixture-backed mail and the
  bounded lifecycle projection for ready mode. Deleted and recovery-required modes
  contain no mail snapshot. The UI may display status and progress but exposes no
  lifecycle mutation.
- Consequence: each render observes one coherent read-only state, startup failures
  can fail closed with an explicit recovery-required screen, and completed local
  deletion no longer appears as a generic database error. A future confirmed
  deletion command remains a separate capability with separate authorization.

## ADR-019: Activate full local deletion through separate prepare and execute capabilities

- Status: accepted for Gate 2D
- Context: Full local deletion is restart-safe and already requires an
  operation-bound receipt, but exposing one generic mutation method or combining
  deletion with the read-only state query would weaken reviewability and make it
  easier for presentation code to create destructive work accidentally.
- Decision: expose two fixed versioned methods for one capability. `prepare` runs
  a read-only lifecycle-conflict preflight and returns bounded consequence copy,
  opaque IDs, exact required text, and expiry; it creates no receipt or journal.
  `execute` is accepted only from the trusted main frame and the same window that
  received the challenge. Main records exact confirmation, then calls the existing
  idempotent orchestrator using the active composition that destroys the live
  protector after key erasure. Stable allow-listed errors cross IPC; raw errors,
  paths, credentials, database details, and provider targets do not.
- Consequence: the user can delete Posita's local data from Settings & privacy,
  while preparation remains non-destructive and interruption remains recoverable
  at startup. The entered phrase exists transiently in renderer/main memory but is
  never logged or persisted. ADR-022 now moves file-backed sanitization off the
  Electron main event loop; the inline path remains only for bounded tests and
  legacy migration. ADR-021 defines confirmation-receipt cleanup.

## ADR-020: Replace only an exactly recognized timestamp-free fixture cache

- Status: accepted for Gate 2D
- Context: Historical encrypted fixture caches can contain valid simulated mail
  records without the absolute `receivedAtIso` metadata required by retention.
  Parsing display labels would invent source time, while silently replacing an
  edited, partial, or future real dataset could destroy user data.
- Decision: during normal ready-mode startup, compare a cache with missing source
  timestamps against the complete known historical fixture dataset after omitting
  that field. Upgrade only when every message timestamp is absent and every other
  value and ordering position matches. Replace the whole simulated dataset with
  current timestamped fixtures through the existing atomic encrypted rewrite and
  sanitization path. Refuse mixed, edited, partial, or unknown caches before any
  mutation, and skip the compatibility path while disconnect is pending.
- Consequence: known sample installations become eligible for deterministic
  retention without guessed dates or a parallel migration system. The policy is
  intentionally fixture-only and is not a precedent for repairing real provider
  records. No dependency or schema migration is added.

## ADR-021: Retain expired confirmation receipts only for pending deletion work

- Status: accepted for Gate 2D
- Context: Confirmation authority lasts five minutes, but an already-journaled
  local deletion may need the same operation-bound receipt for an in-process retry
  after that expiry. Keeping every receipt forever adds unnecessary operational
  history, while deleting solely by time can strand a safe retry.
- Decision: after startup lifecycle recovery, atomically delete a receipt only
  when its expiry is strictly earlier than the injected absolute clock and no
  incomplete `delete-local-data` journal exists for its operation ID. Preserve the
  exact expiry boundary and every receipt linked to pending deletion. Once the
  operation completes, the expired receipt becomes eligible on the next cleanup.
- Consequence: authorization metadata remains available exactly while current
  authority or unfinished work can need it, then is removed deterministically.
  Cleanup failures use the existing safe storage error and fail startup rather
  than silently claiming maintenance succeeded. No timer, IPC method, dependency,
  or schema migration is added.

## ADR-022: Run file-backed SQLite sanitization in one worker

- Status: accepted for Gate 2D
- Context: secure deletion requires synchronous WAL checkpoints and `VACUUM`.
  These operations are small for fixtures but can block Electron's main event
  loop at real mailbox volume. Retention, migration, disconnect, active deletion,
  and startup recovery must share one behavior and safe failure contract.
- Decision: define one async `StorageSanitizer` application capability. File-backed
  startup composes a single-flight Node worker-thread adapter with a bounded,
  versioned request/result protocol and a separate SQLite connection. The worker
  returns only allow-listed outcomes; raw paths and errors never cross renderer
  IPC or enter logs. Keep the synchronous adapter only for bounded `:memory:`
  tests and the existing legacy migration transaction. Treat sanitization as one
  atomic phase and observe lifecycle cancellation between phases.
- Consequence: production file compaction no longer blocks the Electron main event
  loop, and all lifecycle use cases depend on one injectable contract. Concurrent
  calls on one adapter share a promise. Worker failure becomes the stable
  `STORAGE_SANITIZATION_FAILED` application error and leaves journal/cache state
  retryable. This adds one packaged main entry, no dependency, schema, IPC, UI,
  provider, or compatibility path.

## ADR-023: Preview exact Gmail consent before authorization exists

- Status: accepted for Gate 2D
- Context: Posita must explain sensitive Gmail access before asking the user to
  authorize it, but adding an OAuth command, client configuration, or renderer-
  owned copy would prematurely widen the trust boundary and risk consent drift.
- Decision: define one immutable `google-gmail-readonly-v1` consent projection in
  the shared contract. Main includes it only in the existing validated ready-state
  query. It names `gmail.readonly`, the initial and rolling 90-day window, local
  encryption, inactive AI processing, prohibited remote mutations, and disconnect
  consequences. Settings renders the projection with authorization visibly
  disabled. Exact runtime validation rejects scope or disclosure changes unless
  the reviewed contract version changes.
- Consequence: users and automation can inspect the future permission boundary
  without creating authorization state or implying a live connection. No OAuth
  client, PKCE state, browser flow, credential, account record, new IPC method,
  dependency, schema migration, or persisted consent receipt is added. Activation
  remains a separate user-approved milestone.

## ADR-024: Establish authorization sessions before activating OAuth

- Status: accepted for Gate 2D
- Context: Posita needs a testable boundary for future installed-app authorization,
  but composing Google OAuth, a browser flow, credentials, or an enabled renderer
  command would cross the current approval gate. The encrypted provider-account
  contract also used a numeric consent placeholder that did not match the reviewed
  shared consent identity.
- Decision: define one provider-independent, trusted-main-only adapter with
  versioned `begin`, `complete`, and `cancel` operations. Accept exactly the
  reviewed `google-gmail-readonly-v1` consent and `gmail.readonly` scope; require
  bounded HTTPS authorization targets and explicit-port loopback callbacks; and
  return stable safe errors. A deterministic credential-free fake serializes one
  pending session and proves exact expiry, callback matching, cancellation, and
  retryable provider failure. A successful grant is transient main-process data
  that a future coordinator must move directly into `SecretVault` and encrypted
  account state. Align provider-account payload validation to the reviewed string
  consent identity.
- Consequence: application and failure contracts can be exercised without network
  access, personal data, or billable services. The fake is not startup composition,
  and no Google client, client ID, PKCE implementation, listener, browser launch,
  code exchange, credential persistence, account creation, IPC method, or UI
  activation is added. The provider-account table is known empty, so the consent
  correction needs no migration or compatibility path; an unexpected obsolete
  numeric simulated payload fails closed. No dependency or schema change is added.

## ADR-025: Persist a completed connection in fail-closed cross-store order

- Status: accepted for Gate 2D
- Context: a completed authorization grant spans two independent stores: the
  OS-protected credential vault and encrypted provider-account state. There is no
  transaction across them, and a crash or failure must not produce a visible
  account without a credential, overwrite an existing connection, or report a
  false success.
- Decision: place one trusted `AccountConnectionService` above authorization,
  vault, and account-state interfaces. Preflight both stores before beginning and
  again before persistence. Refuse fully existing and one-sided state. Bind the
  completed grant to the pending session and opaque Posita account, store the
  refresh credential first, then store the encrypted provider-account record. If
  the second write fails or may have committed, delete account state and then the
  credential. Treat cleanup failure as a distinct recovery-required error. Never
  return the refresh credential from the service.
- Consequence: deterministic tests prove ordering, duplicate/inconsistent-state
  refusal, retryable provider completion, malformed provider-result rejection,
  ambiguous-write cleanup, and cleanup failure without credentials or network
  access. A successful credential without account state remains invisible and is
  removable; a provider record is never intentionally committed without its
  credential. The coordinator is not composed into startup, preload, IPC, UI, or
  a Google adapter. No dependency, schema migration, compatibility path, external
  action, or production secret is added.

## ADR-026: Diagnose connection inconsistency before choosing repair

- Status: accepted for Gate 2D
- Context: cross-store rollback can fail, and a future crash can leave only a
  refresh credential or only encrypted provider-account state. Automatically
  deleting either side would be destructive, while loading a credential merely
  to test its presence unnecessarily exposes secret material and may rotate its
  protected value.
- Decision: extend the existing `AccountConnectionService` with one versioned,
  main-process-only inspection for a validated opaque account ID. Return exactly
  `absent`, `connected`, `credential-only`, or `provider-state-only`. Add a narrow
  `SecretVault.has` and `AccountStateRepository.hasProviderAccount` capabilities
  whose SQLite adapters check row presence without decrypting either payload.
  Reuse this projection for connection preflight.
  Do not repair, delete, overwrite, contact Google, or expose the result over IPC.
- Consequence: callers can distinguish a clean connection boundary from both
  one-sided failure states without handling token or provider identity. Invalid
  IDs and storage failures map to stable safe errors. Deterministic tests prove
  all four outcomes, exact result shape, no mutation, and no credential
  unprotection. A future destructive repair policy still requires explicit owner
  approval and confirmation design. No new service, dependency, schema migration,
  compatibility path, startup composition, external action, or real secret is added.

## ADR-027: Recover one-sided connection state by confirmed discard

- Status: accepted for Gate 2D
- Context: the connection coordinator can diagnose a credential without encrypted
  provider state or encrypted provider state without a credential. Neither side
  contains enough information to safely reconstruct the other, while automatic
  deletion would hide a destructive account change behind startup or inspection.
- Decision: require a separate exact, versioned recovery request bound to an
  opaque confirmation ID, operation ID, account ID, discard action, and expected
  one-sided status. A verifier must prove an auditable short-lived receipt for all
  fields. Recheck consistency after confirmation, delete only the orphaned local
  credential or account-scoped encrypted provider/sync state, and report success
  only after the canonical inspection returns `absent`. Refuse `connected`,
  `absent`, stale, malformed, unconfirmed, failed, and incomplete operations.
  Always require a fresh connection; never reconstruct data or contact Google.
- Consequence: the approved destructive policy and safe failure contract are
  deterministic-testable without a credential, provider, renderer, or network.
  A new application service is intentionally separate from connection creation,
  while consistency remains sourced from the existing coordinator and deletion
  reuses existing vault/account-state capabilities. No confirmation producer is
  implemented, so the service is not composed into startup, preload, IPC, or UI
  and cannot run in the product. There is no dependency, schema migration,
  compatibility path, external action, real secret, or mailbox mutation.

## ADR-028: Persist recovery confirmation separately from full deletion

- Status: accepted for Gate 2D
- Context: the discard-only recovery policy needs auditable, short-lived proof
  bound to one opaque account and diagnosed orphan type. Reusing the installation-
  wide `DELETE LOCAL DATA` receipt would weaken both scopes and allow unrelated
  destructive actions to share an authorization shape.
- Decision: add schema v8 with a dedicated recovery-confirmation table and one
  trusted producer. Prepare only after canonical consistency inspection matches
  `credential-only` or `provider-state-only`. Require exact
  `DISCARD LOCAL CONNECTION` text within five minutes, persist only opaque IDs,
  opaque account scope, expected status, action, timestamps, and one optional
  consumption timestamp. Atomically consume an exact, unexpired, unused receipt
  before deletion and recheck consistency immediately afterward. A failed or
  interrupted attempt requires fresh confirmation; an old receipt can never delete
  newly recreated state. Keep challenges bounded in memory and clean expired
  receipts using a strict injected-clock boundary.
- Consequence: deterministic code can prove account/status binding, expiry,
  semantic idempotent persistence independent of object property order, rebinding
  refusal, one-use consumption, replay refusal, and safe storage failures without
  credentials or provider access. Retrying after deletion failure intentionally
  asks for new user intent instead of adding a second lifecycle journal. The full-
  deletion schema and service remain unchanged. No startup, preload, IPC, UI,
  browser, Google adapter, external action, dependency, compatibility path, real
  secret, or mailbox mutation is added.

## ADR-029: Expose local connection recovery as a same-window confirmed command

- Status: accepted for Gate 2D
- Context: schema v8 and the discard-only recovery policy were safe but
  unreachable. Exposing a generic repair method, letting the renderer select the
  orphan type, or automatically repairing at startup would weaken the account and
  confirmation boundaries. The current build also contains sample accounts only,
  so the interface must not imply a live Gmail connection.
- Decision: compose recovery only in ready mode through separate versioned
  `prepareAccountConnectionRecovery` and `executeAccountConnectionRecovery`
  capabilities. Preparation accepts one validated opaque Posita account ID; main
  independently performs presence-only inspection and refuses `absent` or
  `connected` state. For a one-sided pair, return the existing five-minute exact-
  text challenge bound to the diagnosed status. Bind the challenge to the trusted
  main frame and window that prepared it, release that window authority after one
  execute attempt, and require fresh preparation after any failure. The renderer
  presents only known application accounts, labels them as samples, and states
  that recovery is local-only. Reuse the existing inspector, confirmation
  producer, recovery policy, vault, and encrypted account-state repository.
- Consequence: the owner can safely remove an orphaned local credential or
  encrypted provider/sync record and return the pair to `absent`, after which a
  fresh connection is required. The renderer never chooses the orphan side and
  receives no credential, provider identity, database detail, or arbitrary error.
  Recovery never starts OAuth, opens a browser, contacts Google, revokes access,
  or changes a mailbox. No dependency, schema migration, compatibility path,
  provider adapter, real account, secret, personal data, or remote mutation is
  added. Gmail authorization activation remains a separate approval gate.

## ADR-030: Schedule retention through one main-owned worker lifecycle

- Status: accepted for Gate 2D
- Context: the deterministic 90-day policy was correct but ran only when invoked
  by tests or startup fixture compatibility. Running file-backed dataset loading,
  encryption, checkpointing, or `VACUUM` in Electron main would risk desktop
  responsiveness, while a renderer timer would weaken the trust boundary and
  create a second lifecycle owner. Retention must also never race full deletion.
- Decision: give main one single-flight retention owner. Schedule an immediate
  pass after the first trusted window is registered, then every 24 hours; retry a
  failed pass after one hour. For file-backed SQLite, run load, plan, authenticated
  rewrite, and sanitization in one short-lived worker using a transferred copy of
  a trusted 32-byte key. Retain one adapter key copy only in main memory, erase it
  on shutdown and full local deletion, and never expose it over IPC. Suspend and
  await maintenance before confirmed full deletion. Project only versioned,
  bounded running/last/next/safe-error state through the existing read-only
  application query, refreshed by one fixed main-to-renderer notification.
- Consequence: automatic cleanup is responsive, deterministic, single-owner, and
  observable without presenting fixture data as Gmail or AI. A crash may interrupt
  a pass, but transactional replacement and the existing sanitization marker keep
  restart behavior recoverable; the next startup retries. Status is intentionally
  process-memory state rather than a new persistence surface. No dependency,
  schema migration, provider adapter, compatibility path, credential, personal
  data, external action, mailbox mutation, or configurable retention setting is
  added. The existing synchronous retention service remains for bounded in-memory
  tests and exact startup fixture compatibility.

## ADR-031: Separate canonical provider mail from the sample compatibility view

- Status: accepted for Gate 2D
- Context: the encrypted prototype `Message` shape was built for a fixed UI
  dataset. It lacks provider message/thread identity, recipient roles, normalized
  body representations, labels, attachment metadata, and immutable source
  provenance. Silently adding invented values would misrepresent fixtures as
  provider data, while allowing adapters to emit that shape would make it a
  second and incomplete ingestion contract.
- Decision: define one exact versioned `ProviderMailMessageV1` and
  `ProviderMailThreadV1` contract with bounded runtime validation. Keep the old
  `Message` solely as a deterministic sample-presentation and encrypted-cache
  compatibility record. Do not migrate or synthesize provider identity for those
  fixtures. Define one uncomposed `MailSyncCoordinator` over provider and atomic
  projection interfaces. It owns a 90-day initial window, single-flight account
  work, bounded cross-account concurrency, normalized batch validation,
  account-scoped replay identity, atomic record/cursor ordering, one bounded
  invalid-cursor resync, supersession/disconnect/shutdown cancellation, and safe
  typed errors. Prove the boundary with credential-free deterministic fakes.
- Consequence: there are temporarily two intentionally distinct mail shapes, but
  only the new contract may accept provider data. The fixture shape cannot drift
  into live ingestion and no lossy migration is guessed. Before live activation,
  an encrypted provider-mail projection must persist canonical records and cursor
  commits, and the product must explicitly transition from sample mode without
  mixing fixtures with live accounts. The coordinator remains outside startup,
  preload, IPC, UI, Google, and persistent storage. No dependency, schema
  migration, credential, personal data, network action, or mailbox mutation is
  added.

## ADR-032: Apply one fixed retention window to both encrypted mail projections

- Status: accepted for Gate 2D
- Context: schema v9 could persist canonical provider messages and threads, but
  the automatic 90-day pass covered only the deterministic fixture projection.
  A second schedule would create competing lifecycle owners, deleting an expired
  message without repairing its thread would retain stale membership, and moving
  the cursor backward would confuse local retention with provider reconciliation.
- Decision: reuse the existing startup/24-hour retention worker and shared cutoff.
  Preflight the fixture dataset and every canonical account before canonical
  mutation. Retain the exact boundary, delete older canonical messages, re-encrypt
  affected threads with retained IDs, delete empty threads, and preserve the sync
  cursor. Mark sanitization pending in the canonical write transaction and finish
  or resume compaction before reporting success. Scope every row mutation by
  record type, opaque account, and opaque row ID.
- Consequence: both encrypted projections obey the private-alpha window through
  one worker-owned maintenance lifecycle without a plaintext index or provider
  request. A failed pass remains safely retryable, and opaque row-ID collisions
  cannot cross account boundaries. The canonical table remains empty until a
  separately approved sync composition. No dependency, schema migration, startup
  sync, IPC/UI capability, Google adapter, credential, personal data, network
  action, or remote mailbox mutation is added.

## ADR-033: Make sample-to-live mode a durable one-way installation boundary

- Status: accepted for Gate 2D
- Context: Posita must not display deterministic samples beside provider mail, and
  disconnecting the last real account must not make a previously live installation
  look like a fresh demo. A renderer-only flag or “seed when empty” rule would lose
  that distinction across restart and could silently recreate samples.
- Decision: schema v10 stores one versioned non-sensitive installation mode,
  initially `sample`. A trusted transition requires presence-only proof that the
  target account is fully connected. In one SQLite transaction it removes every
  sample compatibility record, marks encrypted storage sanitization pending, and
  advances the mode to `live`. The ordinary product has no reverse transition.
  Startup seeds and repairs fixtures only in sample mode; live mode requires the
  existing protected data key and remains empty after the last account is removed.
  Physical compaction follows the logical commit and is idempotently retryable.
  Full local deletion removes the mode marker with all other Posita mail state;
  its durable completed lifecycle marker remains the terminal restart authority.
- Consequence: sample and provider projections cannot become one visible dataset,
  crashes cannot restore samples after a committed switch, and disconnect cannot
  turn live history back into demo content. The service is composed only inside
  trusted startup state and has no preload, IPC, UI, OAuth, provider, credential,
  sync-start, network, or mailbox-mutation path. Production connection/sync
  lifecycle composition remains a separate reviewed milestone. No dependency,
  personal data, compatibility conversion, or fabricated provenance is added.

## ADR-034: Coordinate provider mail through one lifecycle owner

- Status: accepted for Gate 2D
- Context: the sync coordinator, retention owner, sample/live boundary,
  disconnect journal, full deletion, and file-worker keys were individually safe,
  but composing them independently would permit sync to race retention or account
  removal and could leave a projection key alive after shutdown or deletion.
- Decision: place one application-owned `ProviderMailLifecycleOwner` above the
  existing capabilities. Startup accepts a bounded exact trusted account
  inventory, completes any sample-to-live transition before initial sync, reports
  offline/provider failure as bounded per-account outcomes, and starts retention
  only after startup sync settles. Later sync batches suspend retention while
  preserving the coordinator's bounded account concurrency. Disconnect prevents
  new sync, cancels and awaits active work, suspends retention, then invokes the
  existing journaled service. Confirmed full deletion uses the same sync/retention
  quiescence gate. Shutdown settles both owners and destroys the projection key.
  Allow full-deletion composition to destroy every retained worker-key context in
  its existing final data-key phase, attempting every context even if one teardown
  fails.
- Consequence: lifecycle ordering has one deterministic, testable source of truth;
  live-empty and offline restart never restore fixtures, destructive local work
  cannot overlap provider projection writes, and key teardown is explicit. The
  owner remains uncomposed until a trusted account inventory, retry/status policy,
  and real provider are separately reviewed; ADR-035 separately composes only the
  read model. No dependency,
  schema migration, credential, personal data, network request, IPC/UI capability,
  external action, or mailbox mutation is added.

## ADR-035: Project live mail through a bounded worker-owned read model

- Status: accepted for Gate 2D
- Context: schema v10 could durably select live mode, but the only application
  snapshot still described every ready installation as fixture-seeded. Reusing the
  fixture `Message` dataset would invent provider provenance, while returning full
  canonical messages would move bodies, recipients, remote IDs, and unbounded data
  through IPC before the live source-detail experience is reviewed.
- Decision: make the existing application-state query asynchronous and mode-aware.
  Sample mode continues to return the exact fixture dataset. Live mode invokes one
  fixed worker operation over the existing encrypted canonical projection and
  returns at most 50 newest summaries plus at most 32 opaque account scopes. The
  summary retains canonical message/thread IDs, provider and account scope, sender,
  timestamp, subject, bounded plain-text preview, read state, and attachment count,
  but omits bodies, recipients, provider message/thread IDs, provider-account
  subjects, cursors, paths, keys, and raw failures. File-backed reads use the same
  serial projection worker and tracked in-memory key lifecycle. The renderer shows
  truthful live-empty, recorded-syncing, offline, attention, and cached-data states,
  but does not render summary content until a source-detail and original-source path
  is verified.
- Consequence: a committed sample-to-live transition is visible immediately and can
  never fall through to the sample workspace. Offline state remains a recorded local
  projection, not a claim that a provider retry is running. Full deletion includes
  the read worker's key context, and normal shutdown settles accepted reads before
  erasure. The synchronous projection remains only for bounded in-memory tests. One
  intentional compatibility union remains at the version-1 application-state
  boundary: exact fixture snapshots and exact live snapshots are discriminated by
  `dataMode`. No schema, dependency, Gmail adapter, credential, network request,
  provider retry command, message-detail surface, external browser action, AI path,
  or mailbox mutation is added.

## ADR-036: Separate encrypted account display identity from provider subject

- Status: accepted for Gate 2D
- Context: opaque Posita account scopes and Google provider subjects are not safe
  human-facing provenance. A live message cannot be shown truthfully unless its
  originating mailbox is recognizable, but making an address queryable SQLite
  metadata or deriving it from an opaque subject would weaken the privacy model.
- Decision: replace the inactive provider-account payload with exact record v2.
  It keeps the provider subject trusted-main-only and adds a provider-verified
  mailbox address plus an optional trimmed user label of at most 80 characters in
  the same authenticated encrypted record. The successful authorization grant is
  separately versioned as v2 and must provide the verified address. The bounded
  live snapshot advances to v2 and exposes only an exact `available` address/label
  projection or `unavailable` for inconsistent local state; the status UI never
  renders the opaque account scope as identity. No label-editing command is exposed
  yet. Legacy simulated provider-account v1 payloads fail closed because a truthful
  address cannot be inferred from their provider subject.
- Consequence: account provenance is human-readable without revealing provider
  subjects or creating a plaintext account index. No SQLite schema migration is
  required because the version is inside the already encrypted payload, and the
  running product has no real or production-created provider-account record to
  migrate. The next credential-free gate is bounded canonical source detail.
  No dependency, Google adapter, credential, browser action, network request,
  personal mailbox data, live-summary rendering, AI path, external action, or
  mailbox mutation is added.

## ADR-037: Inspect canonical source through one bounded worker query

- Status: accepted for Gate 2D
- Context: live summaries cannot be shown responsibly without a path back to the
  exact local source message. Returning the canonical provider record would expose
  remote identifiers, HTML, attachment IDs, and up to two megabytes of body data;
  querying provider IDs in SQLite would weaken the ciphertext-only projection.
- Decision: define one exact version-1 source-detail request keyed by opaque Posita
  account ID and canonical message ID. Execute it through the existing serialized
  projection worker, which decrypts and validates the selected account records and
  returns exact found/missing state. A found result is rebound to both request IDs
  and contains only canonical message/thread identity, visible encrypted account
  identity, sender/recipients, timestamps, subject, read state, safe attachment
  filename/type/size/inline metadata, and at most 128 KiB of plain text with an
  explicit truncation flag. Provider message/thread/account/attachment IDs,
  content IDs, provider HTML, labels, paths, keys, and raw failures are excluded.
- Consequence: source inspection has one bounded credential-free data boundary and
  cannot silently fall back to Gmail or fixtures when retained data is missing.
  Canonical IDs remain encrypted, so the current implementation deliberately scans
  one account inside the worker instead of adding a plaintext index. Preload, IPC,
  renderer states, summary rendering, and open-original remain separate milestones.
  The web TypeScript configuration permits explicit `.ts` imports, matching the
  existing Node configuration so the directly executed worker and bundled web
  graph reuse the same account-identity validator rather than duplicating it.
  No dependency, schema migration, compatibility path, provider adapter, credential,
  personal data, network request, external action, AI path, or mailbox mutation is added.

## ADR-038: Compose source inspection without activating external mail

- Status: accepted for Gate 2D
- Context: the worker query was safe but unreachable, while displaying live summary
  content before source inspection and external-source behavior were reviewed would
  weaken provenance. A generic IPC method or provider fallback would widen privilege.
- Decision: expose one fixed version-1 source-detail query through a main-owned
  application service, trusted-main-frame IPC handler, validating preload client,
  and renderer data source. The status surface exposes only generic retained-source
  selectors, keeps summary subject/preview hidden, and renders bounded plain text,
  account identity, recipients, and safe attachment metadata after explicit
  selection. It covers loading, exact missing, safe retryable/non-retryable errors,
  retry, unmount/supersession suppression, and explicit external-Gmail unavailability.
  Compose the source only when the durable installation mode is `live`; sample
  mode receives the stable unavailable result even if malformed local state left a row.
- Consequence: deterministic encrypted source records can now be inspected through
  the production security boundary without provider access or external navigation.
  Open-original review and live summary rendering remain separate milestones. No
  dependency, schema migration, compatibility path, credential, provider adapter,
  network request, personal mailbox data, external action, AI path, or mailbox
  mutation is added.

## ADR-039: Confirm and derive original-source browser handoff in main

- Status: accepted for Gate 2D, revalidate before live activation
- Context: live source inspection needs a path to the provider original, but a
  renderer-built URL would expose remote identifiers and create an open-redirect
  surface. Google documents Gmail API message IDs as immutable and retrievable,
  but does not publish the Gmail web route as a stable API contract.
- Decision: add one live-mode-only command keyed by opaque Posita account/message
  IDs. Resolve the encrypted provider message ID and verified mailbox address in
  the existing projection worker. Construct the Gmail HTTPS target only in main,
  validate exact scheme, host, port, path, sole `authuser` query, and bounded
  `#all/` fragment, then pass it to a narrow OS opener after a two-step explicit
  renderer confirmation. Return only `external-open-requested`; never return the
  URL, mailbox address, or provider ID over public IPC.
- Consequence: the deterministic product boundary can request a non-mutating
  browser handoff without a Gmail API call, credential, or generic navigation
  capability. It never claims Gmail loaded the correct account/message. Because
  the web route is undocumented, it must be revalidated before live activation;
  local source detail remains the safe fallback. No dependency, schema migration,
  provider adapter, credential, real account, personal data, network request by
  Posita, AI path, or mailbox mutation is added.

## ADR-040: Render live summaries only from the bounded canonical projection

- Status: accepted for Gate 2D
- Context: account identity, exact local source detail, and the separately confirmed
  original-source handoff are now reviewed. Keeping canonical subject and preview
  hidden no longer improves provenance, while converting live records into fixture
  workspace objects or adding another renderer data source would create competing
  models and blur sample/live state.
- Decision: render `LiveMailSnapshotV2.messages` directly as a semantic recent-mail
  list. Show sender, subject, bounded preview, semantic time, unread state,
  attachment count, and human account identity. Never show opaque account scope as
  identity. Selecting a row invokes the existing exact account/message-scoped local
  detail query; the list itself starts no provider work. Retain the existing 50-item
  and 32-account limits, live-empty/offline/attention states, and local-only reload.
- Consequence: deterministic canonical records can exercise the complete local
  summary-to-source-to-confirmed-original path without Gmail or a second mail model.
  The summary is provider-derived source presentation, not AI-generated content,
  and does not claim current sync. No dependency, schema, IPC method, repository,
  provider adapter, credential, personal data, network request, AI path, or mailbox
  mutation is added.

## ADR-041: Build startup sync inventory from both protected local halves

- Status: accepted for Gate 2D
- Context: the lifecycle owner accepts trusted sync requests but startup had no
  bounded source for them. Enumerating provider-account state alone could treat an
  orphaned record as connected; enumerating the vault alone would either expose
  credential names too broadly or ignore encrypted consent and provider identity.
- Decision: add separate main-only inventory methods that return validated opaque
  account scopes for encrypted provider-account records and protected Google refresh
  credentials. Compare their union in one read-only service, cap it at eight, load
  and validate provider records only for complete pairs, and return deterministic
  sync requests in stable order. If any pair is one-sided, return no ready accounts
  and a bounded recovery-required diagnosis. Never unprotect credential values.
  Compose inspection during local bootstrap but do not pass it to the lifecycle owner.
- Consequence: future startup lifecycle composition has one fail-closed inventory
  source and cannot silently sync a partial subset around inconsistent local state.
  Inventory storage failures are safe and retryable; malformed or excessive state
  is non-retryable until repaired. No dependency, schema, IPC/UI surface, provider
  adapter, credential value access, network request, personal data, sync start, AI
  path, compatibility layer, or mailbox mutation is added.

## ADR-042: Persist lifecycle sync status before provider work

- Status: accepted for Gate 2D
- Context: the encrypted sync-state record already supported idle, syncing, and
  error presentation, but the lifecycle owner did not write it. A future provider
  start could therefore be invisible locally, and retry behavior could be inferred
  inconsistently by separate callers.
- Decision: add one trusted-main status service over the existing encrypted account
  repository. Record syncing before provider I/O; record a validated account-bound
  cursor and injected-clock success time afterward; preserve the last safe checkpoint
  across start and failure; and treat lifecycle cancellation as idle. Map every
  accepted sync failure code to exactly one descriptive disposition: retry allowed,
  retry later, reconnect required, review required, or cancelled. Require the
  lifecycle owner to fail closed with `SYNC_STORAGE_FAILED` before provider work if
  status persistence is unavailable. Compose the service at local bootstrap, but
  do not start the owner or expose a retry command.
- Consequence: future live status has one durable writer and one explicit retry
  policy without creating a scheduler or autonomous mailbox action. Existing schema,
  account repository, renderer snapshot, and coordinator remain the sources of truth.
  No dependency, migration, compatibility path, provider adapter, credential,
  network request, personal data, IPC/UI surface, AI path, or mailbox mutation is added.

## ADR-043: Activate Google only as one paired lifecycle composition

- Status: accepted for Gate 2D activation planning
- Context: startup currently owns automatic retention and projection-read shutdown
  directly because provider sync is inactive. The credential-free inventory, status,
  coordinator, projection, disconnect, and lifecycle owner are individually ready.
  Adding only provider reads or only connection activation would create a live
  account without complete shutdown, deletion, or disconnect ownership.
- Decision: when separately approved, introduce the read-only Gmail adapter together
  with an idempotent revoker and confirmed disconnect path. Reuse one existing
  projection worker for reads, commits, account deletion, shutdown, and key erasure;
  one coordinator for provider I/O; and one lifecycle owner for startup sync,
  retention exclusion, local deletion suspension, disconnect quiescence, and normal
  shutdown. Replace the current standalone retention/read shutdown wiring only when
  that owner is activated. Keep adapter implementation, credential configuration,
  account connection, and real ingestion as distinct approval gates.
- Consequence: Posita cannot enter a half-live state with competing lifecycle owners
  or no removal path. The audit itself adds no dependency, schema, abstraction,
  provider code, credential, network request, IPC/UI capability, personal data, AI
  path, compatibility layer, or mailbox mutation.
