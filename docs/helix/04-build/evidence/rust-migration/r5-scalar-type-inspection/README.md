---
ddx:
  id: umf.evidence.rust-migration.r5-scalar-type-inspection
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
    - id: TP-001
      kind: informed_by
---

# R5 core scalar inspection slice

This bounded slice adds `model/inspectCoreScalarType` to the opt-in Rust core
model path. The operation requires a current core 0.10.0 document and an exact
`{module, element}` identity, validates the complete source, and returns the
versioned 0.3.0 inspection envelope. It preserves unknown scalar labels and
does not claim native type equivalence. TypeScript remains the default route.

[`frozen-typescript.json`](frozen-typescript.json) pins eight predecessor
success/refusal outcomes and SHA-256 values for the TypeScript implementation,
its validation closure, operation schema, and trusted resources. The same
packet passes through the opt-in Node-API binding with exact serialized envelope
parity under Bun 1.4.3 and Node 26.12.1 on macOS arm64. The packet covers known UUID,
unknown and missing labels, absent element, invalid identity, source diagnostic
ordering, and retired-version refusal.

The Rust core and wire tests pass with two focused wire assertions. The existing
TypeScript UUID/model cohort passes 5 tests / 47 assertions. `cargo check -p
umf-core` and the `umf-core-node` build also pass. The native addon artifact is
local build output and is not part of this source change.

Independent Sol review verified the frozen packet SHA-256
`e32e8a2f04e02e7cdd408696ac3c02d2fc569171b0c91232451f754694c0820a`,
Rust core SHA-256 `90326bae9b24d5bb99826fcc3c0a96556b5a8f0f6b9c75f8137dea0051b58653`,
focused wire test SHA-256 `9ae43d59b9a09c4c3477e0897075aae59745f7e2aa59ed76ed774948296b5282`,
and all 22 predecessor/resource pins. Its isolated offline Rust replay passed
both focused tests; Bun opt-in addon and independent TypeScript predecessor
replays matched all eight frozen outcomes. No P1/P2 remains in this recorded
packet scope. The reviewer did not implement the slice; the local addon binary
was not independently rebuilt from the exact reviewed source by that replay.

The browser WASM gate remains open: this environment has the WASM target and a
prior generated package, but no `wasm-bindgen` CLI to rebuild that package from
the current Rust source. No browser result is claimed. This is not closure of
the wider scalar family or the R5 model family.

The output-envelope validator runs against the engine's full core schema
resource closure. Its failure branch is not part of the frozen parity claim:
Rust currently reports its first schema-validation message, while the retained
TypeScript implementation serializes the complete Ajv error array. Independent
review classified this as an open P2 outside the packet claim. Shared copy and
schema resource-boundary differences, host proxy/exception admission and
browser behavior also need qualification before full operation/default parity.
