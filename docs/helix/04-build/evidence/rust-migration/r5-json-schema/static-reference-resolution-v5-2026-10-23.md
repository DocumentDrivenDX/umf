# R5 Draft 2020-12 reference-resolution follow-up v5 — 2026-10-23

This additive receipt records the bounded static-reference corrections made
after the rejected v4 capture. The v4 raw report and comparison remain
unchanged. This receipt covers reference and anchor scope for the listed cases;
it does not qualify general Draft 2020-12 parity.

The Rust schema-position walker now includes Draft 2020-12 `then` and `else`,
so resource IDs and references in those applicators are discoverable. Anchor
lookup stops at nested `$id` resource boundaries, keeping duplicate anchor
names scoped to the resource selected by the reference. Evaluation also avoids
joining a relative `$id` twice when a reference has already selected that
resource URI. The URI check compares a resolved candidate against the current
base and charges work for candidate URI processing; it does not use a suffix
match.

The scoped unit suite passed with pinned Rust 1.90.0:

```text
cargo test --locked --offline -p umf-core --lib static_reference_resolution_tests
11 passed; 0 failed
```

The suite includes regressions for sibling references to `then` and `else`
resources, duplicate anchors across nested resources, embedded relative-ID
chains, remote directory scopes, and a parent URI suffix that must not be
mistaken for a resolved child ID. Existing conflict, cycle, dynamic fallback,
URN pointer, legacy URI and nested-scope tests also passed.

## Frozen source-bound corpus capture

The full pinned capture completed with a pre/post-identical source closure:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-v5-frozen-target \
UMF_R5_JSON_SCHEMA_OUTPUT=/private/tmp/umf-r5-json-schema-comparison-v5-frozen.json \
UMF_R5_JSON_SCHEMA_RAW_CAPTURE=/private/tmp/umf-r5-json-schema-rust-raw-v5-frozen.json \
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

The capture covered upstream revision
`ab079cc2bace029fdbb483be28a6ade526bcfbc2`, 46 files, 384 cases and 1,301
vectors. All case records were present; 1,291 vectors executed, 9 were not
compiled, and one returned a runtime error. The five requested cases now match
the upstream outcomes:

| Case | Rust result |
| --- | --- |
| `ref.json:20` | valid, invalid |
| `ref.json:30` | invalid, valid |
| `ref.json:31` | invalid, valid |
| `refRemote.json:5` | valid, invalid |
| `anchor.json:3` | valid, invalid |

The source closure contains 89 files and its sorted path/hash digest is
`924055fc79d6fe182605151d7f763a1ac493c3c351cc18ec9e09774ce3c83c2f`.
The immutable [raw Rust capture](rust-raw-v5-2026-10-23.json) has SHA-256
`fe9f4d0e86bd19903d3a49a166da9fbaaff350d36df7d8c5c3715d91bd20c2f0`; the
[comparison report](comparison-v5-2026-10-23.json) has SHA-256
`a0ef28d8b5d9b4d269db6631ab04278049bab782c1ee750332e12e5c09743d69`.

The acceptance gate was rerun against those exact files and remains rejected.
The residual differences are in dynamic-reference behavior, vocabulary
handling, other Rust/upstream semantic disagreements, three compile-failure
cases, and one runtime error. Ajv/native adapter parity remains 0 mismatches
among 1,273 compared vectors; this does not waive Rust disagreement with
upstream expectations. The v5 capture is evidence of the bounded correction,
not broad schema support.
