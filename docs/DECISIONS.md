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
