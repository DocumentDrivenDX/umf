---
ddx:
  id: umf.evidence.rust-migration.r8-json-number-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# Sol review: JSON number default-route decision

The candidate Rust core and tagged wire cover the frozen 18 string-input
outcomes, but the default host route is not ready. I inspected the TypeScript
predecessor and the new bounded raw-host tests: an untyped object passed at
runtime is converted with the `number` hint and subsequently with the
`string` hint, and a coercion exception remains the same thrown object. A
tagged UTF-16 string argument cannot preserve those interactions. Neither the
native addon nor the WASM addon exports this wire operation yet. The existing
wire result also lacks the JavaScript exception-name field.

I independently reran `bun test
tests/rust-migration/json-number-predecessor.test.ts`: 4 tests and 38
expectations passed. `git diff --check` passed. The evidence supports holding
the default route and preserving the TypeScript implementation for now. A
production interface decision, both addon exports, installed Node/Bun and
Chromium replays, and exception mapping remain before retirement.
