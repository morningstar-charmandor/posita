# Gmail Authorization Boundary

## Current status

Gmail is not connected and Posita does not yet contain a Google OAuth client ID.
This document is the contract for the next implementation gate; it does not
authorize live mailbox access.

## Desktop OAuth flow

Posita will use Google's installed-desktop application flow with Authorization
Code + PKCE and a temporary loopback redirect listener bound to the local host.
The system browser handles Google authentication. Posita must verify the OAuth
`state`, redirect origin, one-time code, and PKCE verifier before exchanging the
code in the main process.

The authorization code, verifier, state, and access token are memory-only and
short-lived. Only the refresh token is persisted, under the allow-listed name
`oauth.google.<opaque-account-id>.refresh-token`, through `SecretVault`.

## Scope progression

The first live sync requests only `gmail.readonly`. It is enough to read messages
and must be reviewed as a restricted Google scope before distribution.

Additional scopes are separate product capabilities and separate consent:

- Draft creation may later request `gmail.compose` only when that feature is
  implemented and the user explicitly enables it.
- `gmail.modify`, `mail.google.com`, sending, deletion, archive, and label changes
  are outside the first live-sync gate.

Posita never widens scopes silently. A new capability requires an ADR, updated
consent copy, provider-contract tests, and a fresh user authorization.

## Adapter contract

The future Gmail adapter lives in main-process infrastructure behind a
provider-independent application interface. It must:

- namespace provider IDs by opaque Posita account ID,
- perform a bounded 90-day import and resumable history sync,
- normalize and validate Google payloads before domain use,
- be idempotent at a documented batch boundary,
- expose typed, redacted, retry-aware errors,
- never log provider payloads or credentials, and
- have a deterministic fake with redacted fixtures and no network dependency.

No Gmail SDK, OAuth response, credential, or provider-specific payload may cross
the preload bridge.
