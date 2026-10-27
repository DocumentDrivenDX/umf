---
ddx:
  id: umf.evidence.rust-migration.r8-json-schema-additional-properties
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-json-schema-eight-operations
      kind: informed_by
---

# R8 JSON Schema `additionalProperties` profile extension

This packet closes one observed Rust profile-gate mismatch for the opt-in
`inspectJsonSchema` operation. It does not change the TypeScript default route
or qualify Draft 2020-12 generally.

The frozen same-process Bun counterexample is
`baseline-profile-mismatch.json`, captured at source revision
`7e829756706838f70c4a4bb8b6cfffd185a746d3` before the Rust change. In both
`additionalProperties:false` and an admitted schema-valued form, direct
TypeScript returned `valid:true, complete:true, diagnostics:[]`, while the
Rust Node candidate returned `valid:true, complete:false` with
`JSON_SCHEMA_VALIDATOR_LIMIT` at the extension path. The receipt pins the exact
schema strings, source hashes, runtime and pre-change Node addon hash.

Rust now admits `additionalProperties` only when its value is a boolean or an
object. An object is visited by the existing recursive schema-position walk
and must satisfy the same profile grammar as other schema roots. The newly
qualified forms are therefore `false` and object-valued schemas whose nested
keywords remain inside the existing restricted grammar. Examples cover root
and nested positions, declared-property interaction, valid and invalid extra
values, and both boolean rejection and object-schema validation. A
nested `pattern` remains outside the Rust profile; the same input stays
`complete:false` in Rust while direct TypeScript accepts it as complete. No
unsupported construct is silently widened.

`node.json` records a fresh isolated Rust Node addon compared with direct
TypeScript in Bun 1.4.3. `browser.json` records the same comparison inside real
Chromium 153.0.8010.12, with a freshly built Rust/WASM artifact and direct
TypeScript adapter in the same browser page. Both receipts include exact
runner, source, facade and generated-artifact hashes. They are scoped opt-in
semantic comparisons; they do not establish every host shape, platform, or
Draft 2020-12 feature.

The Rust integration test also compares valid/invalid instance vectors through
two separately identified implementations: UMF's `CompiledSchema` validator
and the pinned `jsonschema` crate Draft 2020-12 oracle. These checks support
the instance semantics; neither substitutes for the TypeScript comparisons.
The changed profile gate itself is in
`crates/umf-core/src/json_schema_inspect.rs`, with tests in
`crates/umf-core/tests/r5_json_schema_inspect.rs`.

Reproduce the opt-in Node check and receipt with:

```sh
bun scripts/rust-migration/r8/json-schema-additional-properties-node.mjs
```

Reproduce the fresh WASM build and browser comparison with:

```sh
bun scripts/rust-migration/r8/json-schema-additional-properties-browser.mjs
```

The earlier 41-case evidence in
`../r8-json-schema-eight-operations/README.md` is retained as historical
evidence. This packet supersedes its former statement that false and
schema-valued `additionalProperties` remain outside the profile. It does not
retire a ledger row, change V4 defaults, or claim full API parity.
