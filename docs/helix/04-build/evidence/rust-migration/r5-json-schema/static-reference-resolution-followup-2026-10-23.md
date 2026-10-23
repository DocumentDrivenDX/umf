# R5 JSON Schema static reference resolution follow-up

This additive receipt records a bounded resolver correction in the Rust
consumer. It supplements the immutable source-bound v3 capture; it does not
replace that packet or claim corpus parity. A successor full-corpus capture is
pending after the final source-bound wheel replay.

Draft 2020-12 preflight now carries the retrieval/base URI through nested
schema positions and applies a retrieved resource root `$id` exactly once.
URI resolution preserves directory bases with trailing slashes, resolves
relative references against nested IDs, traverses `then` and `else` schema
positions, and resolves local JSON Pointers against URN identifiers. Official
Draft 2020-12 metaschema resources remain explicit corpus-harness dependencies;
they are not made globally implicit and are not passed to Ajv where built-ins
already own those identifiers. Legacy profiles retain their historical
relative URI joiner while absolute IDs and references remain absolute.

Regression coverage includes nested IDs, ignored annotation `$id` values,
retrieved relative root IDs followed by relative references, trailing-slash
and dot-segment paths, URN local pointers, `then`/`else`, anchors and dynamic
reference static fallback, Draft 7 absolute root and nested IDs, explicit
missing-resource refusal, conflicting resource refusal, and bounded cycles.
Existing Python-profile resource-scope and local-reference-path suites were
also rerun to check shared URI helper behavior.

Focused checks passed on Rust 1.90.0:

```text
cargo test --locked --offline -p umf-core static_reference_resolution_tests
7 passed; 0 failed

cargo test --locked --offline -p umf-core \
  --test schema_python_recursive_resource_scope \
  --test schema_python_reference_paths
8 passed; 0 failed (5 resource-scope, 3 reference-path)
```

The Python pytest runner is unavailable in this environment (`pytest` is not
installed); the Rust integration suites above exercise the frozen Python
profile expectations. `git diff --check` passed for the resolver, corpus
harness, and oracle harness changes. The focused Cargo build emitted existing
warnings from concurrently changed Avro/Protobuf modules; none came from the
resolver tests.

Source SHA-256:

```text
crates/umf-core/src/schema.rs
35ad189673cf5dd4f902070ded429896edb399423752aaeb6e67e5ef16a66813
crates/umf-core/tests/r5_json_schema_full_corpus.rs
6312507b67091fb73e597c944b5964e1392b3fef79fbca63dcdc42a3bf4fc56d
scripts/rust-migration/r5/json-schema/upstream-oracle.ts
b3555feef276b2e15c0e47dc411ad21652d4c832d7051da223e55e865f43b068
```

This evidence covers only the focused static-resolution and compatibility
checks above. Dynamic rebinding, unevaluated semantics, numeric behavior,
broader legacy URI behavior, and complete upstream corpus acceptance remain
outside this change. The v3 capture remains rejected on its recorded semantic
differences and compile refusals until a new source-bound capture is reviewed.
