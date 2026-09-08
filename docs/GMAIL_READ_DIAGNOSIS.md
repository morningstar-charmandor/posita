# Gmail read failure — evidence and offline correction

Reviewed 2026-09-08. This is the current focused investigation; older attempt narratives
remain historical evidence, not permission to make another request.

Live update after verified implementation `d8e1ef3`: the one approved reviewed sync
completed message retrieval, normalization and encrypted projection, then a later message
HTTP request failed. The command settled. Encrypted provider-message presence and consumed
receipt were verified with keyless boolean checks; local reload showed retained mail.
No additional provider attempt is authorized. This proves the corrected ingestion path
works with real mail, not which original encoding caused the sixth observation, nor full
sync completion. The exact remaining HTTP reason is not yet known. See the handoff.

## Verified starting point

- `dd69c5d` on local and fetched origin `main`/`staging`; initially clean.
- Baseline `npm run verify`: 88 files, 547 tests, typecheck, structure and build passed.
- Last documented real state: one connected account, protected refresh credential,
  encrypted account/sync state, live mode, **zero provider mail**. This investigation
  did not open private configuration, read credentials, launch the product, or inspect
  personal mail. These live facts are inherited observations, not a new live measurement.
- Sixth retry: token validation, Gmail profile and list completed; message batch failed
  before projection. Its diagnostics cannot distinguish retrieval from normalization.
- Later observations did not reach Gmail and cannot test message handling. The tenth
  and eleventh show eligibility rejection and settled backend responses. The independently
  reproduced Strict Mode guard defect and retry-visibility mismatch were fixed before this work.
- The current UI correctly hides retry for a policy-disallowed state. Do not repeat that
  command, reinterpret it as a Gmail timeout, or silently rewrite the durable error.

## Complete read path and failure boundaries

1. Trusted retry command validates the request, complete connection, durable retry policy
   and overlap. A referenced ten-minute whole-command deadline includes preflight and
   dispatch. The lifecycle owner excludes retention and queues the existing coordinator.
2. Coordinator loads the encrypted cursor through its worker. It requests the bounded
   90-day initial read when no cursor exists. No screen fetches Gmail independently.
3. Token source unwraps the account refresh credential in trusted main, exchanges it for
   a memory-only access token, and validates the exact approved scopes. This was reached
   successfully in the sixth observation; no token changes are justified by the batch failure.
4. Adapter reads profile and lists messages. Each list page is capped at 100; the coordinator
   permits at most 50 batches per sync. Spam/trash are excluded; drafts are not excluded.
5. At most four message GETs run concurrently with documented `format=full`. Each request
   has a referenced twenty-second deadline covering headers and body. JSON responses are
   capped at 2,800,000 bytes for message/external text and 512 KiB for list/profile/errors.
6. External text parts are discovered in the MIME tree; at most sixteen unique text body
   references per message are retrieved serially within that message. Named attachment
   bytes are not fetched. A vanished message (404) retains existing reconciliation behavior;
   a missing external body is an error, not an invented empty source.
7. JSON decoding precedes canonical normalization: identity/time, sender/recipients, MIME
   traversal, base64url bytes, UTF-8 text, plain/HTML-derived fallback, attachment metadata,
   labels, and the existing canonical source/thread contract. Local IDs retain account scope.
8. Coordinator validates the complete normalized batch and checks cancellation before
   starting projection. The serial worker validates again, encrypts source records and
   advances the account cursor in one SQLite transaction. A failed first batch commits none
   of its messages or cursor. Earlier successfully committed pages may survive a later failure.
9. The application query reads only encrypted-local data; bounded v3 summaries and source
   detail cross the existing allow-listed IPC bridge. No provider body, cursor, or credential
   enters diagnostics. The renderer settlement fix remains unchanged.

## Ranked causes of the sixth observation

| Rank | Candidate | Evidence and limits |
| --- | --- | --- |
| 1 | Valid padded base64url rejected | Previous decoder rejected every `=`. Synthetic `Zg==`, `Zm8=` and padded Unicode failed; old fixtures used only unpadded output. One affected body can reject the batch. Strongest reproduced compatibility defect; **not proven to be the actual mailbox trigger**. |
| 2 | Another valid source form outside the normalizer's subset | Synthetic recipient groups, comments, folded display names, senderless drafts, and non-UTF-8 text fail at fixed header/text stages. These are plausible in real mail, but no private payload has been inspected. |
| 3 | Request-format mismatch or HTTP/body failure | The previous query used `FULL`; Google's documented enum is `full`. Corrected to the documented value. No evidence establishes whether Google accepted the uppercase spelling. HTTP, streamed-body errors, malformed JSON, and size limits were previously conflated. |
| 4 | Resource limit reached by valid large/complex mail | Existing byte, recipient, attachment, subject and external-text limits can reject otherwise valid mail. They are local safety/product limits, not Gmail format requirements. New fixed categories isolate these boundaries without logging sizes. |
| 5 | Cancellation/transport lifetime defects | Fail-fast `Promise.all` previously let siblings continue after failure. A signal alone did not independently settle stalled body/transport work. A synthetic provider returning after cancellation still committed. All are reproduced or directly evidenced and corrected; none is proven responsible for the sixth failure. |
| Low for this observation | Token authorization, storage worker, IPC/UI | Sixth token/profile/list succeeded; projection had not started. Later rejected commands never tested Gmail. Worker or renderer failures may exist independently but cannot explain a recorded pre-projection batch failure by assumption. |

## Implemented correction (provider-inert)

- Accept canonical RFC 4648 base64url with or without correct padding. Continue rejecting
  illegal alphabet, impossible length, misplaced/excess padding, non-zero pad bits and
  oversized decoded bodies. UTF-8 validation remains fatal; no lossy byte replacement.
- Resolve external text when `data` is absent **or empty** alongside `attachmentId`.
  Accept a genuinely empty fetched text body. Previously this valid shape silently fell
  back to the snippet; it is a separate source-fidelity defect, not proof of the batch failure.
- Use documented lowercase `format=full`; do not introduce a second request/compatibility fallback.
- Extract the existing HTTP boundary into `googleMailHttp.ts`, with one referenced deadline
  for transport plus body. Abort cancels the reader; cleanup promises cannot hold the result
  open. A late non-cooperative response is discarded and its body cancelled. Production
  fetch must still honor its signal; arbitrary injected promises cannot be forcibly destroyed.
- Cancel active sibling reads at the first group failure and await their bounded wrappers
  before returning the original failure. Do not start another group. Reject a late successful
  provider batch after cancellation before initiating an encrypted commit. A transaction
  already in progress remains atomic and is not forcibly interrupted.
- Bound MIME traversal before recursion: depth 32, total visited parts 2048. These explicit
  local resource limits prevent deeply nested JSON from producing unbounded recursive work.
- Extract the existing per-batch stage tracker. Add only fixed failure categories: transport,
  HTTP, response-body, response-limit, response-encoding, JSON, external-body, identity,
  headers, MIME, base64, text-decoding and canonical contract. Each category emits at most
  once per batch. Existing event shape stays version/opaque account/stage/phase. No message
  counts, IDs, addresses, names, subjects, text, payloads, sizes or precise timing are logged.

## Tested and deliberately not inferred

Milestone verification: `npm run verify` passes 91 files / 592 tests, strict typecheck,
renderer/security structure checks and the production Electron build. Baseline was 547
tests; 45 synthetic regression/audit cases were added. Git identifies the final checkpoint.

Synthetic tests cover padded/unpadded ASCII and Unicode; invalid padding/alphabet/length/pad
bits; absent optional fields; unknown fields; empty and nested multipart bodies; external
empty text; named attachment references; header/charset failure classification; canonical
subject and body limits; depth/part bounds; stalled transport/body/cancel hooks; late response
cleanup; body encoding/JSON/size failures; caller cancellation; vanished messages; sibling
cancellation; reporter isolation and event deduplication. A real temporary file-backed worker
integration reads synthetic Gmail through the adapter/coordinator, commits encrypted records
and cursor, then reads back the decoded text through source detail. Invalid encoding commits
nothing. It uses a synthetic key and no real credentials or mailbox data.

Current limitations remain explicit:

- Header parsing is not a complete RFC 5322 parser. Encoded-word display text is not decoded;
  groups/comments/folding/quoted local parts and unusually long fields need a bounded,
  standards-based follow-up if implicated. No addresses are guessed or silently dropped.
- The canonical model requires a sender. Drafts without one cannot currently be represented.
  Excluding drafts or making sender optional requires a product/contract decision, not a
  hidden query filter or fabricated mailbox identity.
- Non-UTF-8 MIME charsets remain unsupported. A charset-aware decoder needs precise charset
  handling and tests, not unconditional permissive decoding. Text attachment references are
  supported; unnamed/inline data-only attachments are not a complete attachment-ingestion model.
- Missing canonical identity/history/time still fails closed. Optional subject/recipient/
  labels/body fields and unrelated extra JSON fields do not require broad compatibility changes.
- Local size limits are retained, not raised to make an unknown mailbox pass. Base64 failure
  can mean invalid encoding or its decoded-byte budget; response-limit identifies JSON byte limits.
- MIME/JSON conversion remains in the existing bounded main-process adapter. No measured
  event-loop stall has been attributed to it. This does not establish a performance guarantee
  or justify a speculative new worker. Encrypted I/O remains off-main; worker hangs are not
  forcibly terminated because interrupting a commit has separate consistency consequences.
- Deterministic tests and production build verification are not a new live Gmail or Electron
  runtime observation. No claim is made that connected mail is now visible or the root cause is solved.

## One controlled attempt — approval required, not executed

Update 2026-09-08: the owner approved the recovery and exactly one twelfth read. ADR-065
now implements the main-only native confirmation and durable one-use receipt through
the existing command/lifecycle path. The following proposal is retained as the approved
scope; its former statement that the capability did not exist is historical. Live outcome
must be recorded in the handoff after execution; no thirteenth request is authorized.

The necessary next evidence is one read-only sync through this corrected production path:
token/profile/list → retrieval → normalization → encrypted projection, or the first fixed
failure category. It is **one sync attempt, not one HTTP request**: existing pagination,
four-read concurrency, per-request bounds, ten-minute deadline and cancellation still apply.
No automatic second attempt, reconnect, token rotation, send, archive, label, delete, mark-read,
AI invocation or attachment download beyond external text parts is included. Google receives
read-only API traffic using the existing grant; successful source records may be encrypted
locally under the existing 90-day policy. Diagnostics record only the fixed stage events.

There is an explicit prerequisite: the existing retry command will refuse the current
review-required state, and no one-use reviewed-retry capability exists. Do not ask the owner
to click a hidden button or bypass the command via direct provider calls. The recommended
owner decision is a **one-use, account-scoped reviewed recovery plus exactly one live attempt**.
After that decision, record the narrow command-policy amendment and implement/test the one-use
authorization in the existing trusted command/lifecycle path before execution. It must not
globally make malformed payloads retryable, falsify durable error state, or reconnect the account.
No such permission or implementation is claimed by this checkpoint. If the owner declines,
retain the connected live-empty state and this exact handoff.

## Primary references

- [Gmail message GET and full format](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
  and [documented Format enum](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format).
- [Gmail Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
  and [MessagePartBody fields](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments):
  base64url data, possibly empty, and external attachment references.
- [RFC 4648](https://www.rfc-editor.org/info/rfc4648/), sections 3.2, 3.5 and 5: padding,
  canonical unused bits and the URL-safe alphabet.
- [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322.html), sections 2.2.3, 3.2.2 and 3.4:
  unfolding, comments and address groups; [RFC 2045](https://www.rfc-editor.org/info/rfc2045/),
  section 5.1: MIME charset parameters. Standards support the synthetic edge cases, not
  an assertion about which payload exists in the owner's mailbox.
