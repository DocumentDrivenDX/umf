---
ddx:
  id: umf.evidence.rust-migration.r5-bit128-default-route
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
    - id: umf.evidence.rust-migration.r5-bit128
      kind: predecessor
    - id: umf.evidence.rust-migration.r5-bit128-binding
      kind: predecessor
---

# R5 `umf-128/1` default-route predecessor packet

This packet freezes the existing opt-in TypeScript predecessor for the exact
public family in `src/model/bit128.ts` and `src/model/uuid.ts`: eleven functions
and `BIT128_PROFILE`. It is a source-stability checkpoint for evaluating a
future default route. No binding, root export, package, harness, or migration
plan was changed, and this packet does not authorize or perform a cutover.

## Frozen material

[`predecessor.json`](../../../../../../scripts/rust-migration/r5/bit128-default-route/predecessor.json)
records the Bun 1.4.3 observations, exact function inventory, error code/message
precedence including an error's `path` when exposed, result prototypes/property
shapes recursively for nested API returns, and SHA-256 closure for both portable
implementation sources, their focused predecessor tests, and CONTRACT-076. The
packet includes all eleven functions:
`parseBits128`, `parseUuid`, `bits128FromBytes`, `bits128ToBytes`,
`uuidFromBits128`, `uuidToBits128`, `compareBits128`, `bits128ToWords`,
`bits128FromWords`, `bits128ToInteger`, and `bits128FromInteger`.

The probes cover frozen parsed bit/UUID snapshots; mutable ordinary-object word
and integer result records; exact byte arrays; offset views, Uint8Array
subclasses and copy isolation; accessor, extra, symbol, and descriptor-shape
refusals; profile/original-text/shape error ordering; raw UTF-16 syntax;
noncanonical integer syntax; signed and unsigned 64/128-bit endpoints; and
negative zero. Node `Buffer` remains a separate host-specific carrier case: the
Bun packet does not claim it as portable behavior.

Run `bun scripts/rust-migration/r5/bit128-default-route/freeze.ts --check` to
rerun the cases and verify both the frozen packet bytes and authority closure. The
check never rewrites the packet. `--freeze` is the explicit authoring operation.

Frozen packet SHA-256: `05fdc7e6fdd26e9065ac5daa52672d37ebe27a470f1e4cdf140e6563171712e6`.
Authority SHA-256 values: `src/model/bit128.ts`
`c4db81a14022db2413ee991e8705d3bee688d0ed1e7c880e6170520a2694d543` and
`src/model/uuid.ts`
`43b2ea37b050a835e7723c9ea9b32f886fca63f5bb94eb5f8b17b242cf4444f7`;
`tests/bit128.test.ts`
`2c1f5b54c2ed4924588f2f2d43f2f7c4f89c631765f3ea0cf243fd3f9938948b`;
`tests/uuid.test.ts`
`549836713a191175f2ee088194aaf57a1d1654809ddfbe4c6a3fb65151715171`; and
CONTRACT-076
`373f396361aeaa38109348d3bebb1328d5014343625055e5bda8cd212055df20`.

## Scope and remaining gates

This is predecessor evidence on Bun 1.4.3, not evidence for the opt-in Rust
binding or a default route. Existing [`r5-bit128`](../r5-bit128/README.md)
qualifies the Rust codec against its independent oracle and frozen edge cases.
[`r5-bit128-binding`](../r5-bit128-binding/README.md) qualifies the opt-in
Node/Bun and WASM binding, including Node 26.12.1 smoke behavior and Chromium
153.0.8010.12. Those artifacts remain bounded to their stated host versions,
artifacts, and subsets.

Still absent from this checkpoint are a source-bound default-route implementation,
all public root/SDK export and package integration, installed-artifact behavior
through the default import path, Node `Buffer` behavior there, and a current
real-browser/default import-path gate. Field/key composition, Python exposure,
native carrier behavior, and broader adapter acceptance remain separate gates
under the governing contract and migration plan. No default cutover is claimed.
