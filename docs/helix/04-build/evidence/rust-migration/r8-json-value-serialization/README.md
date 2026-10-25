---
ddx:
  id: umf.evidence.rust-migration.r8-json-value-serialization
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
---

# R8 JSON-compatible value serialization audit

## Candidate boundary

The TypeScript exports `readJsonValue` and `writeJsonValue` in
`src/model/serialization.ts` are still unmapped default-root operations. The
Rust core already exposes JSON and YAML parsing/writing through the unprofiled
`read_value_wire` and `write_value_wire` operations, and the Node/WASM engines
forward those operations with per-call host controls. Their `readJsonValue` and
`writeJsonValue` aliases hard-code JSON, however, while the TypeScript functions
default to YAML. The generic `readValue`/`writeValue` methods accept a format,
but their existing default is JSON. No wrapper/default route was changed here.

The direct TypeScript predecessor is frozen in [predecessor.json](predecessor.json),
SHA-256 `b7088c57d3b59b3a81c7de9ebd59ac34fc98642d95fccaf33791b0d3ab1ef833`.
Its capture script is
[`serialization-predecessor.ts`](../../../../../../scripts/rust-migration/r8/serialization-predecessor.ts),
SHA-256 `7cb755fcbedac15b38cc9335d3d284db117a0e89c00349a0043c9ce679c63df3`.
It contains 24 direct-call cases captured with Bun 1.4.3: default and explicit
JSON/YAML selection, JSON-as-YAML, YAML rejected as JSON, duplicate keys,
aliases, tags, multiple documents, unsafe/rounded/negative-zero numbers,
source/depth/value limits, JSON/YAML output, negative zero, non-finite values,
cycles and output limits.

The packet's 12-file TypeScript source closure is selected input closure, not
the whole application or crate closure. It pins the serializer and its direct
local dependencies, generated schemas and type definitions; package and Bun
lock hashes are embedded in the packet. In particular,
`src/model/serialization.ts` is pinned at
`027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586`.

## Parity blockers

The generic Rust wire tests establish successful explicit JSON/YAML reads and
writes, plus control interruption. They also preserve a Rust-specific error
taxonomy. The frozen TypeScript cases report `ALIAS`, `TAG`, and `SYNTAX` for
the tested YAML refusals; the Rust core reports `YAML_ALIAS`, `YAML_TAG`, and
`YAML_SYNTAX`/`YAML_DOCUMENTS`. TypeScript throws `UmfError`; the Node/WASM
wire wrappers project the Rust envelope as `UmfCoreError`. The complete YAML
parser messages and malformed-source ordering have not been shown equivalent.
The frozen packet also records source-limit-before-syntax, structural depth and
value-limit locations, and write refusal messages, but the current wire test
does not claim byte-for-byte parity for those envelopes. Rust YAML output quotes
plain mapping keys where the current TypeScript writer does not; CONTRACT-001
does not make YAML formatting or property order a fidelity promise.

These differences prevent an accepted `readJsonValue`/`writeJsonValue` mapping
or versioned facade claim at this checkpoint. A format-default correction
alone would misrepresent public-boundary parity. The generic Rust wire path
remains a candidate; classify it as partial pending packet-driven Node/Bun and
WASM differential tests, exact error-code/message/path and precedence
reconciliation, and a versioned wrapper whose omitted format matches the
TypeScript YAML default. Default exports remain unchanged.

## Scoped checks

The Rust core serialization unit suite passed 17/17 with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  cargo test --locked --offline -p umf-core --lib serialization::tests --no-fail-fast
```

The tagged-wire test is
`crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs`. It checks
explicit successful JSON/YAML operation, the Rust alias-refusal envelope, and
host-control propagation. `cargo test --locked --offline -p umf-core-wire --test
r8_json_value_serialization_wire` passed 3/3; `bun
scripts/rust-migration/r8/serialization-predecessor.ts --check` passed; and
Rust 1.90.0 `rustfmt --edition 2021 --check
crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs` passed. These
tests establish current wire behavior, not source compatibility or Node/WASM
artifact qualification. The focused test source SHA-256 is
`d98281475727826281b969f67cbaa54a596d9311bf80085bf0969c713a430b93`.

Relevant source pins at this checkpoint:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/serialization.rs` | `85d69d44d22b7d77877203f8c48b58c596218a82cde2a990bc194341dda218aa` |
| `crates/umf-core-wire/src/lib.rs` | `c6f9b8f3caf888bce8602825cd9b3b0679f560bd0a7606c516fa522dbe1f18e0` |
| `bindings/core/node/index.js` | `99d06632abee1d16b256ab43766d8f8f1a61e2c883467470db5d7e3015eb9a22` |
| `bindings/core/wasm/index.js` | `9816b1fefc4460820722055e2c1bfbac8de432dfa1a66434beb5b4210a95e731` |
