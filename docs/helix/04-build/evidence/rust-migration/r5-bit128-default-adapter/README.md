---
ddx:
  id: umf.evidence.rust-migration.r5-bit128-default-adapter
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-076
      kind: evidence_for
    - id: SD-005
      kind: references
    - id: ADR-006
      kind: references
    - id: umf.evidence.rust-migration.r5-bit128-default-route
      kind: predecessor
    - id: umf.evidence.rust-migration.r5-bit128-binding
      kind: predecessor
---

# R5 default-root Bit128/UUID adapter slice

[`rust-bit128-default.ts`](../../../../../../src/access/rust-bit128-default.ts)
provides the typed `bindBit128Rust` boundary for the eleven `umf-128/1`
operations. Its structural engine contract accepts the object returned by Node
`createBit128Engine` or WASM `initializeBit128Wasm`. Each operation delegates to
that engine; the boundary converts its `UmfCoreError` failures in the
`BIT128_*`/`UUID_*` domains to model `UmfError`, retaining code, message, and
path. It does not implement codecs or re-admit host values, so precedence and
carrier handling stay with the existing R5 engine.

`BIT128_PROFILE` is exported as inert TypeScript metadata. The binder does not
send the constant in a request, ask Rust to select a profile from it, or infer
support from it; the engine owns request profile behavior.

## Evidence

[`rust-bit128-default.test.ts`](../../../../../../tests/rust-bit128-default.test.ts)
compares all eleven public functions against the immutable Bun predecessor
packet at
[`predecessor.json`](../../../../../../scripts/rust-migration/r5/bit128-default-route/predecessor.json)
(`05fdc7e6fdd26e9065ac5daa52672d37ebe27a470f1e4cdf140e6563171712e6`). It also
replays the packet's descriptor/accessor/symbol error-order cases, UTF-16 and
noncanonical syntax, signed/unsigned limits, offset and subclass views, copy
isolation, and the independent Python oracle rows. Under Bun 1.4.3, the focused
suite passes 3 tests and 2,000+ assertions against the installed Node addon.
Node `Buffer` acceptance is exercised only in this Node-host run.

The operation result shapes, frozen snapshots, and mutable word/integer result
records match the predecessor packet. No shared root entrypoint, package index,
binding index, SDK packager, or shared wire was changed. This evidence therefore
qualifies the binder and its Node engine integration as an isolated slice; it
does not establish default import routing, package installation through that
route, browser entrypoint integration, or installed browser behavior. Python,
native carrier behavior, Field/key composition, and broader adapter acceptance
remain separate gates.
