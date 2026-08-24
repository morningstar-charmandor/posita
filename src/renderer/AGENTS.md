# Renderer Agent Rules

This directory is an untrusted browser-like presentation process. The root
`AGENTS.md` also applies.

- Never import Electron, Node built-ins, provider SDKs, database clients, secrets,
  or filesystem APIs. `npm run check:structure` enforces the import boundary.
- Render structured application results. Privileged work goes through a narrow,
  typed preload client whose inputs and outputs are runtime validated.
- Prefer feature modules with colocated component, state, and tests. `App.tsx`
  should remain composition and navigation; when materially changing an existing
  feature embedded there, extract that feature unless the change is trivial.
- Use native semantic controls and stable accessible names. Tests query by role
  and label before considering a test-only selector.
- Do not render email HTML with `dangerouslySetInnerHTML`. Future HTML mail must
  use a reviewed sanitizer and isolated rendering policy.
- Every mail-derived summary preserves source links and visible account origin.
- Generated text is labeled and editable. Sending and other remote mutations are
  separate confirmed actions, never a side effect of rendering or navigation.
- Cover loading, empty, error, offline, stale, uncertain, and approval states for
  every asynchronous feature.
