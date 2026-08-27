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
  startup; production-scale compaction must move off the Electron main event loop
  before real mailbox volume.

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
  never logged or persisted. The current synchronous sanitization is acceptable
  only for bounded fixture data and must move off the Electron main event loop
  before real mailbox volume. ADR-021 defines confirmation-receipt cleanup.

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
