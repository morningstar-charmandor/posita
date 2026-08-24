# Preload Agent Rules

This is Posita's smallest and most security-sensitive public API surface. The
root `AGENTS.md` also applies.

- Expose one narrow method per allowed capability through `contextBridge`.
- Never expose `ipcRenderer`, arbitrary channel names, generic send/invoke/on
  wrappers, Node primitives, tokens, or mutable privileged objects.
- Keep values JSON-compatible and frozen where practical.
- Version contracts before changing an existing method's meaning.
- Validate arguments in preload and again in main; preload validation is not an
  authorization boundary.
- Add contract tests for every exposed method and its rejected inputs.
