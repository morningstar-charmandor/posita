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
