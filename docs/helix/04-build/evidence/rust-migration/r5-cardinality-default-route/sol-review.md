---
ddx:
  id: umf.evidence.rust-migration.r5-cardinality-default-route.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-cardinality-default-route
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol review of cardinality host-admission decision

I independently reran `bun test ./tests/rust-migration/r5-cardinality-default-route.test.ts`
against the worktree: 2 tests and 28 assertions passed. `git diff --check`
passed. I inspected the selected binder and confirmed that it retains
`copyJson` sequencing for source, identity, request and current, with Rust
handling request and receipt semantics. The negative controls compare the
actual Node model wrapper with the predecessor on path-bearing hidden and
accessor properties, a cycle and a non-finite number; they demonstrate
different errors at the generic tagged boundary. The current default route
must therefore keep its TypeScript admission until the separate Rust-driven
opaque host-reflection interface is implemented and independently replayed.

This review accepts the blocker classification, not cardinality host-admission
retirement, installed-artifact parity or a release claim. The Rust-owned
`host_json::copy_host_json` facility provides a concrete next interface, but
it is not wired to these cardinality exports here.
