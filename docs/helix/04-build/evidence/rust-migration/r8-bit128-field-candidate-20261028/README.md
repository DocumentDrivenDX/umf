---
ddx:
  id: umf.evidence.rust-migration.r8-bit128-field-candidate-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-076
      kind: implements
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-evolution
      kind: informed_by
---

# R8 current-core Bit128 Field candidate

This packet records a bounded Rust implementation of `declareCoreBit128Field` for current core 0.10.0. It changes only a copied, already-valid Document and writes `scalarType: "bits128"` or `"uuid"` on one selected singular Field. It does not convert values, issue a receipt, add a default route, or change any binding.

The governing public behavior is `CONTRACT-076` together with core 0.10.0 in `CONTRACT-080` and the current TypeScript implementation at `src/model/bit128-field.ts`. The operation validates current-version/source validity before identity and scalar-type checks; after authoring it rejects selected-Field warnings except warning paths inside `extensions`. Unknown document content is retained in the copied result. The frozen vectors include success with unknown extension content, malformed identity, current-version refusal, source-validation precedence, unsupported scalar type, unknown selected-Field qualifier, incompatible facets and literals, and array Field refusal.

`frozen-typescript.json` pins the source and test hashes and captures eleven TypeScript input, expected result or error, and copy assertion vectors, including success for both `uuid` and `bits128`. The current TypeScript source hash is `07ee2a1dcb14c491774f3902e3788454615af17a25166efd04e014001e9a6c27`; the test hash is `872b14a0fd4f76523122ec6086f7b1c9c70d368be60c70f0f55f44d90fd50bce`.

## Rust candidate and checks

The pure operation is in `crates/umf-core/src/core_bit128_field.rs`. The explicit wire operation is `model/declareCoreBit128Field`, gated to the closed request shape, empty registry, and exact five-resource set. `execute_core_bit128_field_request_with_control` is an opt-in entry point; it is not wired into a package default or host binding.

Run the focused reference checks with:

```sh
cargo test -p umf-core --test r8_bit128_field
cargo test -p umf-core-wire --test r8_bit128_field_wire
```

The core test compares Rust values or refusals against every frozen TypeScript case and confirms its source `Value` remains unchanged. The wire test checks representative success/refusal envelopes plus rejection of a different operation. The wire transport is a parsed JSON value; it does not establish JavaScript getters, accessors, proxies, copy-trap ordering, arbitrary host identity objects, or any binding's error projection. No native executable, browser, Node, Python, or WASM binding evidence is claimed here. Those host seams remain separate qualification work.
