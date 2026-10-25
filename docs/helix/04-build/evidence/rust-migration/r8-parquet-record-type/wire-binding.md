---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-record-type-wire-binding
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
    - id: umf.evidence.rust-migration.r8-parquet-record-type
      kind: references
---

# Opt-in Parquet Record Type tagged binding

`umf_core_wire::record_type_binding` exposes caller-selected
`classifyParquetRecordType` and `recoverParquetRecordTypeBytes` operations under
`umf.record-type-binding/1.0.0`. Classification receives the complete source
and request `Value`; recovery receives the complete receipt and current target.
The binding initializes its engine and Avro/Parquet registry from the pinned
embedded UMF resources. The core operation and recovery validate their exact
result/receipt schemas and core, semantic-reference and kind-operation
references. Caller work control covers transport, resource construction,
classification, recovery and hex result encoding. Recovered bytes are returned
as lowercase hexadecimal text without changing their byte values.

The supported native interpretation remains the bounded LIST struct-member
subset in the linked core evidence. This tagged operation is opt-in and makes
no claim about Node/Bun, WASM, browser, installed-package or default host routes.

Focused command:

```sh
cargo test --locked --offline -p umf-core-wire record_type_binding
```

The 4/4 focused binding tests passed on Rust 1.90.0. The Parquet case classifies
and recovers the pinned LIST fixture and compares every recovered byte.
Malformed indexes and unknown request members are rejected. The no-default-
features check also passed; the module is compiled only with
`embedded-adapters`. The source is moving with the shared R8 worktree, so this
packet does not freeze source hashes, broaden layout support or claim native-
fragment parity.
The envelope rejects unknown and repeated top-level members before dispatch;
the UTF-16 allocation for recovered hex output is charged before construction.
