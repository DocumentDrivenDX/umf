---
ddx:
  id: umf.evidence.rust-migration.r8-scalar-types-for-version
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 `scalarTypesForVersion` opt-in Rust candidate

## Scope

The candidate implements the pure `scalarTypesForVersion(version)` lookup in
Rust behind the shared `model/scalarTypesForVersion` wire operation and the
existing opt-in Node and WASM Core Model operation factories. Exact UTF-16
equality with core version `0.10.0` returns the eleven scalar labels in
generated source order. Every other well-formed or lone-surrogate string returns
an empty array. The operation uses the ordinary Core Model engine request and
its exact five-resource witness. It accepts no source document and does not run
extension callbacks.

The TypeScript package roots remain the implementation route. The candidate is
an opt-in Rust binding only; this packet does not alter package exports, default
selection, the R8 inventory, or retirement counts.

## Frozen predecessor and vocabulary authority

[`predecessor.json`](predecessor.json) was captured directly from
`src/model/types.ts` with Bun 1.4.3 before Rust or binding implementation edits.
It pins exact results for the current version, the previous version, an empty
version, a trailing-space near match, and a future version. The source hash and
generated inputs are included in the fixture.

The vocabulary originates in `spec/metamodel/umf.yaml` and is emitted into
`src/generated/core-model.ts`. Rust's list is currently a local mirror. A core
integration test compares that Rust list, including order, with the generated
`spec/core/schema.json` enum at `$defs.knownScalarType`, and derives the version
from the generated schema `$id`. This fails if either the Rust list or pinned
current-version behavior drifts from that generated authority.
After the Rust source edits, the metamodel build refreshed the generated
compiler fingerprint in the schema's `$comment`; its latest SHA-256 is
`47847aefe4ad9f13cfa992f2710174c8026bffd7bc9dea05953afa4b03e4f827`.
The frozen pre-implementation resource hash remains in `predecessor.json` as
historical capture. The generated scalar enum and `$id` are unchanged, and the
Rust drift test passes against the refreshed resource.

## Evidence

The new Rust core integration test passes 2/2 assertions groups, including
exact-version cases, UTF-16 near-match behavior, and generated-schema drift
checking. The Core Wire integration test passes 2/2 groups through the normal
resource-backed model request, including exact vocabulary order and refusal of
an extra request member. Bun 1.4.3 passes the direct TypeScript predecessor
fixture (1 test, 5 expectations) and Node/WASM operation-factory routing tests
(2 tests, 6 expectations). The wrapper tests use a stubbed Rust invoker; the
Rust Wire test exercises dispatch and result encoding directly.

Commands run:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r8-scalar-types-target \
cargo test --locked --offline -p umf-core -p umf-core-wire --test r8_scalar_types_for_version
bun test tests/core-scalar-types-for-version.test.ts
bun test ./bindings/core/node/tests/core-model-scalar-types-for-version.test.js
```

This is narrow version lookup evidence for the generated `0.10.0` core
vocabulary. It does not qualify installed Node or browser artifacts, a package
root route, another core version, or default-route parity. The source lookup
remains authoritative for normal TypeScript package consumers.

## Source pins

The candidate source and test hashes for this worktree are recorded here:

| Path | SHA-256 |
| --- | --- |
| `crates/umf-core/src/scalar_type_inspection.rs` | `9078192e60c3031a793beb6151002ed3a3f1a990a8d98b667b128026621ba57e` |
| `crates/umf-core-wire/src/lib.rs` | `6279a274a19fc0f6cdbc6440f91d73950b68042fef1f43f19892c025532f42fa` |
| `bindings/core/node/src/core-model.js` | `25acf1947c7671089d0e2ca4a3d7672918597044fcd5b1b5c20284671196ba25` |
| `bindings/core/wasm/src/core-model.js` | `3d9bc6b01cfc015dbd81797b18e83f40ed3ba0e3937cd2c3b1c6692437ebbef5` |
| `crates/umf-core/tests/r8_scalar_types_for_version.rs` | `af46d86129e8d92a26f210767ad58e0ca900d047cd42da83e4ddf0a4a611cabc` |
| `crates/umf-core-wire/tests/r8_scalar_types_for_version.rs` | `771ca972787d6fa2e283740691a0792b99db95ec7441cbe05c5b28d8be83cd6f` |
| `bindings/core/node/tests/core-model-scalar-types-for-version.test.js` | `042eba03330300377c07e183025e2f3f60670604ee0fd31e3789234b89762479` |
| `tests/core-scalar-types-for-version.test.ts` | `2004b5743d4ed4f4c388a15d1e4d3bf85089f1074ad9791cd173549c5d318b37` |
