---
ddx:
  id: umf.evidence.rust-migration.r5-json-schema-operations
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 JSON Schema operations façade

This additive receipt composes the lossless JSON Schema tree, payload admission,
Draft 2020-12 inspector, native exports, copied pointer read and schema-position
walk into a host-independent Rust operation surface. Import takes UTF-16 source,
caller ID/base URI and an explicit ordered resource list. Every operation takes
one caller-owned `Context`; no operation performs filesystem or network access.
Root/resource/bundle export preserve exact number lexemes and refuse tagged
representation content that native JSON cannot carry.

The new `import_json_schema`, `inspect_json_schema`, `export_json_schema`,
`export_json_schema_resources`, `export_json_schema_bundle`,
`get_json_schema_node` and `walk_json_schema` operations leave the existing
conservative edit operation unchanged. Ordered resource inputs preserve caller
order. Duplicate retrieval URIs in this Rust list are refused as
`JSON_SCHEMA_RESOURCE_COLLISION`; the predecessor's JavaScript object input
cannot represent duplicate own keys.

The source comparison is the immutable TypeScript capture in
[`r5-json-schema/baseline.json`](../r5-json-schema/baseline.json). Its adapter,
tree, test and extension-source hashes remain unchanged. Its captured migration
plan hash predates later additive plan entries; current plan SHA-256 at this
receipt is `9c1bc16993a44f08b2242711c514f0bf085763d8d084ae8049861ea617c3783e`.
The capture was not rewritten. Source hashes below are a bounded historical
snapshot for this repair pass; root will freeze the complete cohort separately.
The façade tests assert predecessor ordering for
base/resource URI and source parsing, exact number and escaped lone-surrogate
round trips, unknown keyword/invalid-known diagnostic order, incomplete missing
reference outcomes, exact compact export-refusal diagnostics and pointer errors.
They also cover copied bundle-source isolation, ordered resources and duplicate
refusal, context value limits and late cancellation, invalid envelope validation,
tagged null roots, invalid caller-ID diagnostics, and isolated high/low-surrogate
diagnostic paths.

Inspection preserves core-document diagnostics in their original order. Its
registered JSON Schema extension package checks present payload structure and
invokes the semantic callback for every occurrence at its actual element path.
Malformed present payloads receive `EXTENSION_STRUCTURE` diagnostics before
native interpretation. Invalid relative base/resource URIs become validation
diagnostics; root/resource URI collision follows representation and numeric
warnings, including when dialect or numeric interpretation is incomplete.
The generic `UNKNOWN_EXTENSION` warning is removed for the declared version
`0.1.0`, while warnings for other extensions and absent/unsupported JSON Schema
declarations remain unchanged. Payload-selection operations validate with an
empty registry, so another element's invalid extension does not alter their
selected `schema`/`schema` result. A
successful native Rust compile adds `JSON_SCHEMA_VALIDATOR_LIMIT`; this is an
intentional conservative profile delta from the TypeScript predecessor and is
not evidence of full Ajv parity. For a future extension warning alongside a
JSON Schema payload, the core `UNKNOWN_EXTENSION` diagnostic stays first and
the conservative native validator warning follows. Unknown dialects remain
valid but incomplete. Bundle export emits resources before the root, matching
the predecessor's operation order.

These finite vectors do
not establish general Draft 2020-12, browser/WASM, installed-wrapper or Ajv
parity.

Focused verification used Rust 1.90.0 with the locked offline dependency set:

```text
cargo test --locked --offline -p umf-core --test r5_json_schema_adapter --test r5_json_schema_inspect --test r5_json_schema_operations
r5_json_schema_adapter: 12 passed
r5_json_schema_inspect: 7 passed
r5_json_schema_operations: 17 passed
total: 36 passed
```

The updated regression cases remove the required root and resources fields and
replace the present payload with null; all are invalid with an
`EXTENSION_STRUCTURE` diagnostic. A cancellation sweep confirms control failures
still propagate and malformed payloads never become valid.

The following source hashes identify this implementation cohort:

| Source | SHA-256 |
|---|---|
| `crates/umf-core/src/json_schema_adapter.rs` | `70d9af13d7381d2256a75a9cb4854b540bd83fc44dbbd41507effbf0c66b86b7` |
| `crates/umf-core/src/json_schema_inspect.rs` | `e17b4d6e742c6dd5865d6b72192983a1a813bd15e6c5cb774b9fb792e0fb3e71` |
| `crates/umf-core/src/native_json.rs` | `afbac8e48057179afb353dbd66370a536d11dfe48d85c517bfbda1b5d8c5f556` |
| `crates/umf-core/tests/r5_json_schema_operations.rs` | `88325beb66d7be13e38b45ab6e65adae0f5bbf6172fda6450173e0f4ff36dd75` |
| `crates/umf-core/tests/r5_json_schema_adapter.rs` | `4376544e4080dc2d927500255f3aecccf8475fb182f1dd743154e6148dc68c7c` |
| `crates/umf-core/tests/r5_json_schema_inspect.rs` | `7b8acceb9c306cb8bd3e7eca180bf80b95e8f5885977996a2c09c06436de6e9b` |

The source-faithful predecessor capture plus these focused Rust checks qualify
this bounded operation composition only. Full upstream corpus, browser and
installed-binding replay remain separate gates.

The R4 packaging checkpoint now includes the checked-in JSON Schema package in
its source inventory and core-sdist force-include list. Its frozen wheels predate
this completed R5 operation source. The final integrated source cohort still
requires a fresh offline extracted-sdist build and installed replay.
