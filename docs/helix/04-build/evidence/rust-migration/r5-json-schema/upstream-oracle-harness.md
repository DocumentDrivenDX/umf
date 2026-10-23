# R5 JSON Schema upstream-oracle harness

This is a runnable qualification harness for the Draft 2020-12 Rust evaluator and the current JSON Schema adapter. It is separate from `baseline.json`, which records the earlier TypeScript/Ajv predecessor and is not evidence for Rust parity.

Run from the repository root with:

```sh
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

The runner verifies the vendored upstream revision (`ab079cc2bace029fdbb483be28a6ade526bcfbc2`), all manifest SHA-256 entries, the 46 root files / 384 cases / 1,301 vectors, and Ajv 8.20.0. Ajv uses Draft 2020-12 with `strict: false`, `validateFormats: false`, `ownProperties: true`, and `addUsedSchema: false`; the same locally packaged remote resources as the existing TypeScript oracle are explicitly preloaded, with no network resolution. It runs the Rust `CompiledSchema::compile_consumer` and `validate` against each vector, and separately captures `json_schema_adapter::admit_payload`, `export_root`, `export_resources`, `get_node`, `walk`, and `json_schema_inspect::inspect_payload`. Ajv results compare upstream expected outcomes and the native Rust adapter export.

The Rust integration test is `crates/umf-core/tests/r5_json_schema_full_corpus.rs`; the orchestration and pin checks are in `scripts/rust-migration/r5/json-schema/upstream-oracle.ts`. The generated comparison JSON goes to `/private/tmp/umf-r5-json-schema-comparison.json` by default, or to `UMF_R5_JSON_SCHEMA_OUTPUT` when set. The cargo invocation uses `--locked` and an exact named-test filter. Every Rust run writes first to a fresh unique temporary report path; the runner requires the exact test's `... ok` result, parses and validates the report's source revision/counts/record closure, and only then copies those bytes to the persistent raw-report path. A stale persistent report therefore cannot stand in for a successful current capture. Before and after Cargo, the runner hashes all UMF core source inputs, the vendored Saphyr parser, manifests, corpus manifest, test and runner; a changed closure aborts qualification. It verifies every upstream corpus SHA before and after the capture. The raw Rust report is retained at `/private/tmp/umf-r5-json-schema-rust-raw.json` by default (override with `UMF_R5_JSON_SCHEMA_RAW_CAPTURE`) and its hash is recorded in the comparison report.

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

On 2026-10-23, `bun node_modules/typescript/bin/tsc --noEmit --pretty false` passed. The Ajv-only mode (`UMF_R5_SKIP_RUST=1 bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts`) verified all manifest hashes and ran all 46 files / 384 cases / 1,301 vectors with Ajv 8.20.0. It produced 24 cases with upstream expected-result disagreements (30 vectors), 7 Ajv compile failures, and 4 cases / 8 vectors that errored during vector evaluation. These counts match the predecessor oracle's 24 disagreement cases and 11 unavailable cases (7 compile plus 4 evaluation-error cases). Its report explicitly marks 384 Rust records missing, 1,301 Rust vectors not run, and Rust/native parity metrics null. Rust was deliberately skipped during a coordinated no-build campaign; `cargo`/`rustc` were not on this shell's `PATH`, although a configured rustup location exists on the host. The Rust capture and Rust-vs-Ajv counts therefore remain **not run**. No hosted CI result is claimed. The first implementation-level coverage limitation is the `f64` evaluator boundary described above. A source-bound result still needs to be generated after the no-build window on a Rust-enabled host before any Rust parity claim can be made.
