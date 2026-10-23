# R5 JSON Schema full upstream capture — 2026-10-23

This records the first completed source-frozen Rust capture against upstream
Draft 2020-12 revision `ab079cc2bace029fdbb483be28a6ade526bcfbc2`. It is failure
evidence and does not qualify Rust/Ajv parity or general Draft 2020-12 support.

The comparison report is `/private/tmp/umf-r5-json-schema-comparison-current.json`;
the raw capture is `/private/tmp/umf-r5-json-schema-rust-raw-current.json`.
The raw SHA-256 recorded by the comparison report is
`1366b65385ea62ad2dfbdd375666960f90c39bc808e90a26c3500acebd43ffea`. Capture
comparison-report SHA-256 is
`5eed89b7c5a876604f52203ce7dbe66d6aa6bdc2cdf210d941ca25ceebed9c44`. Capture
accounting closed at 46 files, 384 cases and 1,301 vectors, with all 384 Rust
case records present. The source closure was identical before and after capture.

The reviewed gate command is:

```sh
bun scripts/rust-migration/r5/json-schema/acceptance.ts \
  /private/tmp/umf-r5-json-schema-comparison-current.json \
  scripts/rust-migration/r5/json-schema/ajv-exclusions.json
```

It correctly exits nonzero. The capture had 15 schema compile/refusal cases,
35 vectors not compiled, one vector runtime error, 1,265 Rust/upstream outcome
comparisons, and 14 disagreements. Rust/Ajv comparison recorded 1,245 vectors
and 33 disagreements. Adapter operation failures were zero. Exported Ajv
round-trip validation had zero mismatches among 1,273 compared vectors, with 28
vectors (11 cases) not compared because an exported schema could not be compiled.

The 15 Rust compile/refusal cases are:

- `const.json:13` — `NUMBER` (large integer/float representation boundary).
- `defs.json:0` — `SCHEMA_REF_UNRESOLVED`.
- `dynamicRef.json:4` — `SCHEMA_REF_UNRESOLVED`.
- `ref.json:6`, `:15`, `:16`, `:20`, `:28`, `:30`, `:31` —
  `SCHEMA_REF_UNRESOLVED`.
- `refRemote.json:4`, `:5`, `:6` — `SCHEMA_REF_UNRESOLVED`.
- `vocabulary.json:0`, `:1` — `SCHEMA_DIALECT`.

The single vector runtime error is `multipleOf.json:3#0` (`NUMBER`). Rust/upstream
outcome disagreements affect 14 vectors in these 11 cases; bracketed values are
the zero-based vector indexes:

- `anchor.json:3` [0, 1].
- `dynamicRef.json:3` [1], `:5` [1], `:11` [1, 2], `:12` [0, 2], `:14` [1],
  `:15` [1], `:16` [1], `:20` [1].
- `unevaluatedItems.json:18` [0].
- `unevaluatedProperties.json:21` [0].

The comparison report also lacks a usable `adapterStable` result for seven
cases where Ajv could not compile the exported form: `dynamicRef.json:9`, `:10`,
`:12`; `enum.json:14`; and `ref.json:15`, `:16`, `:28`. The raw adapter capture
is retained separately, but the acceptance gate intentionally treats an absent
comparison-level preservation result as unresolved instead of passing it.

The report provides the aggregate 33 Rust/Ajv disagreements but does not retain
their per-case identities. This is an evidence-format gap; preserve this report
unchanged and add per-case Rust/Ajv classifications in a later capture revision.
The 35 Ajv predecessor discrepancies and unsupported cases are explicitly
listed in `scripts/rust-migration/r5/json-schema/ajv-exclusions.json`. Those
exclusions classify known Ajv baseline behavior only; they do not waive Rust
compile failures, runtime errors, expected-result disagreements, missing
preservation observations, or unexplained Rust/Ajv differences.
