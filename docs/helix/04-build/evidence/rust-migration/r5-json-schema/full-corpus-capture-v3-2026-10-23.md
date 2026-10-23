# Source-bound R5 JSON Schema corpus capture v3 — 2026-10-23

This capture uses the per-vector comparison format and reviewed gate. It is
complete as evidence, but the gate correctly fails; it does not qualify general
Draft 2020-12 parity.

Capture command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-target \
UMF_R5_JSON_SCHEMA_OUTPUT=/private/tmp/umf-r5-json-schema-comparison-v3.json \
UMF_R5_JSON_SCHEMA_RAW_CAPTURE=/private/tmp/umf-r5-json-schema-rust-raw-v3.json \
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

Acceptance command:

```sh
bun scripts/rust-migration/r5/json-schema/acceptance.ts \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/comparison-v3-2026-10-23.json \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/rust-raw-v3-2026-10-23.json \
  scripts/rust-migration/r5/json-schema/ajv-exclusions.json
```

The pinned revision `ab079cc2bace029fdbb483be28a6ade526bcfbc2` closed at 46
files, 384 cases and 1,301 vectors, with 384 Rust records present and the same
87-file source closure before and after capture. Comparison-report SHA-256 is
`a3b3c4277dce8bf4f310aea804cbe69f1e6a41bb0a5950fc4e97611313707927`; raw-report
SHA-256 is `1366b65385ea62ad2dfbdd375666960f90c39bc808e90a26c3500acebd43ffea`.
The exact comparison and raw reports are archived beside this note as
`comparison-v3-2026-10-23.json` and `rust-raw-v3-2026-10-23.json`. The comparison
report records its original capture path `/private/tmp/umf-r5-json-schema-rust-raw-v3.json`;
the acceptance gate links archived bytes by SHA-256 so the evidence is replayable
from a repository checkout.

The gate result is **rejected**. Rust compiled and executed 1,265 vectors, refused
15 schemas (35 vectors), returned one runtime error, and disagreed with upstream
on 14 vectors. Rust/Ajv comparison covered 1,245 vectors and found 33 differing
outcomes. The per-vector report exposes which Ajv differences are not covered by
the reviewed defect catalog or where Rust does not match upstream; those remain
failures. Adapter failures were zero. Original-versus-exported Ajv parity had
zero mismatches over 1,273 compared vectors; 28 vectors in 11 cases were
unavailable and remain separately classified. Ajv's 30 baseline discrepancies
and 8 evaluation errors remain visible as their own counts.

The gate rejects for unresolved Rust/Ajv semantic differences, compile
refusals, runtime error and expected-result disagreements. Ajv exclusions do
not excuse Rust disagreement with the upstream expected result and do not waive
original-versus-exported parity. The detailed case/vector list for Rust/upstream
disagreements is in `full-corpus-capture-2026-10-23.md`; this v3 report adds the
raw-linked per-vector outcomes needed for further review. No semantic fixes or
parity claims are implied by this evidence.

On a later replay after concurrent core work changed the checkout, the gate
stopped at source-closure verification before semantic assessment. The v3
recorded hash for `crates/umf-core/src/schema.rs` is
`bfd513e2c2076ed067d4e237dae06036b924639b9dd76711791259b6a8a9e116`; the
current checkout hash was `1eeda0a12ba0250e6437605c955d4f6364365c94255667edf06a834f70e7db9b`.
That rejection is expected for an immutable prior source cohort. Retain the v3
packet as captured; a fresh source-bound capture is needed for semantic gate
results against the changed core.
