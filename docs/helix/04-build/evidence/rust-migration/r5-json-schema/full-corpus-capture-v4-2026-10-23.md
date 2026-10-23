# Source-bound R5 JSON Schema corpus capture v4 — 2026-10-23

This additive packet captures the current R5 Rust consumer and oracle harness
after the static-reference follow-up. The earlier capture and v3 packet remain
immutable. The capture is complete, but the tightened acceptance gate rejects
it on remaining semantic differences, compile refusals, and runtime errors;
it does not qualify general Draft 2020-12 parity.

Capture command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-v4-target \
UMF_R5_JSON_SCHEMA_OUTPUT=/private/tmp/umf-r5-json-schema-comparison-v4.json \
UMF_R5_JSON_SCHEMA_RAW_CAPTURE=/private/tmp/umf-r5-json-schema-rust-raw-v4.json \
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

Acceptance command:

```sh
bun scripts/rust-migration/r5/json-schema/acceptance.ts \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/comparison-v4-2026-10-23.json \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/rust-raw-v4-2026-10-23.json \
  scripts/rust-migration/r5/json-schema/ajv-exclusions.json
```

The source revision is `ab079cc2bace029fdbb483be28a6ade526bcfbc2`. The capture
closed at 46 files, 384 cases, and 1,301 vectors. All 384 Rust case records were
present. The source closure contained 87 files and was byte-identical before
and after capture. Its closure-map digest (sorted `path:sha256\n` entries) is
`6e9b9c2fd41e7b790e9b4a360c43b6b206f5cecfb587a44da231ee2fc94dba6f`.
Compared with v3, the only changed closure entries were:

```text
crates/umf-core/src/json_schema_inspect.rs
  9a41bb8b5144bf670c83244d558d5b7c0924ca202f7031ad18429c54709f6fd6
  -> 63d313ea9d006d7aba72de12766ceff2341f04b72424b239f27df9451d05b8cd
crates/umf-core/src/schema.rs
  bfd513e2c2076ed067d4e237dae06036b924639b9dd76711791259b6a8a9e116
  -> 35ad189673cf5dd4f902070ded429896edb399423752aaeb6e67e5ef16a66813
crates/umf-core/tests/r5_json_schema_full_corpus.rs
  d81951fd3791fb6d10090d70b30a7d75f6b10a11b28d80910442e45e1f0a9b11
  -> 6312507b67091fb73e597c944b5964e1392b3fef79fbca63dcdc42a3bf4fc56d
scripts/rust-migration/r5/json-schema/upstream-oracle.ts
  ac84784c6e83039f33a6f457c01b8535e950565b70cec1421cbe6c3b3c120ff5
  -> b3555feef276b2e15c0e47dc411ad21652d4c832d7051da223e55e865f43b068
```

The comparison report SHA-256 is
`51dc758cf643fca2e39eb8728f575cfef3f6af4dd8eb31ff2a9dde7dc8387184`; the raw
report SHA-256 is `31ee168943af4b7bb8d274322226616a6a9de824c2794e1c675071653d7c3fa1`.
The reports are archived beside this note as `comparison-v4-2026-10-23.json`
and `rust-raw-v4-2026-10-23.json`. Rust/Ajv coverage is fully linked to those
raw bytes by hash.

The gate result is **rejected**. Rust executed 1,283 vectors, did not compile
13 vectors, and returned 5 runtime errors. There were 5 compile-failure cases,
14 Rust/upstream disagreements, and 34 Rust/Ajv disagreements among 1,255
comparisons. Adapter failures were zero. Original-versus-exported Ajv parity
had zero mismatches among 1,273 compared vectors; 28 vectors in 11 cases were
not compared. Ajv retained 30 baseline mismatches and 8 baseline execution
errors. The gate exited with status 1 and reported these failures:

```text
Unclassified Rust/Ajv discrepancy anchor.json:3#0
Unclassified Rust/Ajv discrepancy anchor.json:3#1
Unclassified Rust/Ajv discrepancy dynamicRef.json:3#1
Unclassified Rust/Ajv discrepancy dynamicRef.json:5#1
Ajv discrepancy is not corrected by Rust at dynamicRef.json:11#1
Ajv discrepancy is not corrected by Rust at dynamicRef.json:11#2
Unclassified Rust/Ajv discrepancy dynamicRef.json:14#1
Unclassified Rust/Ajv discrepancy dynamicRef.json:15#1
Unclassified Rust/Ajv discrepancy dynamicRef.json:16#1
Ajv discrepancy is not corrected by Rust at vocabulary.json:0#2
Rust semantic disagreements with upstream remain
Rust schema compile/refusals remain
Rust execution is incomplete or contains errors
```

The static resolver changes removed 10 compile refusals from v3. `defs.json:0`,
`ref.json:6`, `refRemote.json:4`, `refRemote.json:6`, and `dynamicRef.json:4`
now compile and execute. `ref.json:15`, `ref.json:16`, and `ref.json:28` also
execute, while Ajv reaches its own stack-overflow compile error for those
recursive cases. The new remaining compile refusals are `const.json:13`
(`NUMBER`), `ref.json:30` and `ref.json:31` (`SCHEMA_REF_UNRESOLVED`), and
`vocabulary.json:0` and `vocabulary.json:1` (`SCHEMA_DIALECT`). The `then`/`else`
refusal cases therefore remain open despite focused traversal coverage.

The five runtime errors are `multipleOf.json:3#0` (`NUMBER`),
`ref.json:20#0` and `ref.json:20#1` (`SCHEMA_REF_UNRESOLVED`), and
`refRemote.json:5#0` and `refRemote.json:5#1` (`SCHEMA_REF_UNRESOLVED`). Anchor
semantics remain inverted at `anchor.json:3#0` and `anchor.json:3#1`.
Dynamic-reference behavior remains outside this static-resolution slice;
notable expected-result disagreements include `dynamicRef.json:3#1`,
`dynamicRef.json:5#1`, `dynamicRef.json:11#1/#2`, and
`dynamicRef.json:14#1`, `dynamicRef.json:15#1`, and `dynamicRef.json:16#1`.
Existing unevaluated and numeric differences
also remain visible in the per-vector report. No reviewed Ajv exclusion waives
Rust disagreement with the source corpus expectation.

The v4 capture ran after the focused checks recorded in
`static-reference-resolution-followup-2026-10-23.md`; the R6 agent also
confirmed final core wheel builds and installed replays for Python 3.11 and
3.12 against the stable source cohort. This packet establishes source closure,
capture completeness, adapter parity, and the listed gate result only. It does
not establish broad Draft 2020-12 parity or production isolation.
