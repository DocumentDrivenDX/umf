# R5 JSON Schema upstream-oracle harness

This is a runnable qualification harness for the Draft 2020-12 Rust evaluator and the current JSON Schema adapter. It is separate from `baseline.json`, which records the earlier TypeScript/Ajv predecessor and is not evidence for Rust parity.

Run from the repository root with:

```sh
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

The runner verifies the vendored upstream revision (`ab079cc2bace029fdbb483be28a6ade526bcfbc2`), all manifest SHA-256 entries, the 46 root files / 384 cases / 1,301 vectors, and Ajv 8.20.0. Ajv uses Draft 2020-12 with `strict: false`, `validateFormats: false`, `ownProperties: true`, and `addUsedSchema: false`; the same locally packaged remote resources as the existing TypeScript oracle are explicitly preloaded, with no network resolution. It runs the Rust `CompiledSchema::compile_consumer` and `validate` against each vector, and separately captures `json_schema_adapter::admit_payload`, `export_root`, `export_resources`, `get_node`, `walk`, and `json_schema_inspect::inspect_payload`. Ajv results compare upstream expected outcomes and the native Rust adapter export.

The Rust integration test is `crates/umf-core/tests/r5_json_schema_full_corpus.rs`; ordinary `cargo test --workspace` marks it ignored because the wrapper must supply a fresh report path. The orchestration and pin checks are in `scripts/rust-migration/r5/json-schema/upstream-oracle.ts`. The generated comparison JSON goes to `/private/tmp/umf-r5-json-schema-comparison.json` by default, or to `UMF_R5_JSON_SCHEMA_OUTPUT` when set. The cargo invocation uses `--locked` and an exact named-test filter with `--ignored`. Every Rust run writes first to a fresh unique temporary report path; the runner requires the exact test's `... ok` result, parses and validates the report's source revision/counts/record closure, and only then copies those bytes to the persistent raw-report path. A stale persistent report therefore cannot stand in for a successful current capture. Before and after Cargo, the runner hashes all UMF core source inputs, the vendored Saphyr parser, manifests, corpus manifest, test and runner; a changed closure aborts qualification. It verifies every upstream corpus SHA before and after the capture. The raw Rust report is retained at `/private/tmp/umf-r5-json-schema-rust-raw.json` by default (override with `UMF_R5_JSON_SCHEMA_RAW_CAPTURE`) and its hash is recorded in the comparison report.

Each comparison record also retains every vector's expected boolean, Rust result/error, original Ajv result/error, and exported-schema Ajv result/error/status. Run the separate reviewed acceptance gate against both files: `bun scripts/rust-migration/r5/json-schema/acceptance.ts <comparison-report> <raw-capture> [exclusions]`. It checks the pinned manifest and exact case/vector closure, raw report path and SHA-256 linkage, source-closure evidence, per-vector Rust results against the raw capture, reconciled aggregate counters, and original-versus-exported semantic parity. Explicit Ajv catalog entries may classify an observed Ajv/upstream disagreement only when Rust matches upstream, or an observed unavailable case. They never waive original-versus-exported semantic mismatches. Synthetic negative controls cover fabricated and malformed reports.

## Operation correspondence and scope

| TypeScript operation | Rust entry point exercised or required |
| --- | --- |
| `importJsonSchema` | `json_schema_adapter::admit_payload` on the native tagged schema/resource envelope. This is adapter admission, not a claim that a Rust public host binding exists. |
| `inspectJsonSchema` | `json_schema_inspect::inspect_payload` |
| `exportJsonSchema` / resource export | `json_schema_adapter::export_root` / `export_resources` |
| `getJsonSchemaNode` | `json_schema_adapter::get_node` |
| `walkJsonSchema` | `json_schema_adapter::walk` |
| `editJsonSchemaNode` | Existing `crates/umf-core/tests/r5_json_schema_edit.rs` exercises the document/registry/engine transaction. The upstream harness does not yet perform one edit per upstream case; its exports are read-only captures. |
| JSON Schema instance validation | `CompiledSchema::compile_consumer` / `validate`, separate from the adapter inspector. |

This harness does not establish complete Draft 2020-12 equivalence. The Rust evaluator accepts UMF `Value`, whose number representation is `f64`; the native JSON tree retains exact number tokens, but converting a schema or instance through `Value` can lose or reject values outside the interoperable numeric profile. The runner must report compile/refusal/error counts and vector mismatches rather than treating an uncompiled case as a pass. Exact-number values and unsupported host operations remain explicit missing coverage.

## Local execution status

The 2026-10-23 Ajv-only run is historical and deliberately did not execute Rust. It verified the pinned 46 files / 384 cases / 1,301 vectors and marked Rust records missing. A later full capture and its expected gate failure are recorded in `full-corpus-capture-2026-10-23.md`; that comparison predates per-vector result attribution. A new source-bound capture is required after the reviewed vector-outcome format change. No hosted CI result or general Draft 2020-12 equivalence is claimed. The `f64` evaluator boundary remains an explicit coverage limitation.
