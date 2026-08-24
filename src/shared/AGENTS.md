# Shared-Domain Agent Rules

This directory contains pure, cross-process contracts. The root `AGENTS.md` also
applies.

- Import no React, Electron, Node, provider SDK, database, clock, or global state.
- Keep types JSON-compatible across process boundaries unless a documented
  serializer owns the conversion.
- Represent domain states explicitly with discriminated unions instead of magic
  strings, nullable combinations, or booleans with ambiguous meaning.
- Unknown external data does not become a domain value until runtime validation.
- Version externally persisted or transported contracts and test backward
  compatibility when a migration period exists.
- Preserve provider provenance and source message IDs on all derived mail facts.
