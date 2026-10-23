# R5 Draft 2020-12 reference-resolution follow-up v6 — 2026-10-23

This additive receipt records the resource-identity correction after the v5 review. Earlier v4 and v5 captures remain unchanged. The implementation now carries explicit resolver provenance: direct evaluation applies each schema `$id`; a resolver-selected resource root skips only an identifier resolution already performed by the resolver. JSON Pointer traversal normalizes each entered resource and resets its fragment at each `$id` boundary. Anchor targets are treated as already scoped only when the selected target is the exact resource root, including embedded resources in supplied external documents. Annotation scans preserve the same provenance. Python-profile resolution keeps its prior path and error behavior.

The focused Rust suite passed with pinned Rust 1.90.0 using an isolated Cargo target:

```text
cargo test --locked --offline -p umf-core --lib static_reference_resolution_tests
16 passed; 0 failed
```

Regressions cover repeated direct relative IDs, parent-URI suffix collisions, local and external anchored resource roots, pointer targets with nested IDs, pointer traversal into dynamic resource scope, nested anchor isolation, and the original `then`/`else`, remote resource, and relative-ID cases.

## Frozen source-bound corpus capture

The pinned capture completed with a pre/post-identical source closure:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-v6-frozen-target \
UMF_R5_JSON_SCHEMA_OUTPUT=/private/tmp/umf-r5-json-schema-comparison-v6-frozen.json \
UMF_R5_JSON_SCHEMA_RAW_CAPTURE=/private/tmp/umf-r5-json-schema-rust-raw-v6-frozen.json \
bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
```

It covered upstream revision `ab079cc2bace029fdbb483be28a6ade526bcfbc2`, 46 files, 384 cases, and 1,301 vectors. All case records were present; Rust executed 1,291 vectors, left 9 uncompiled, and returned one runtime error. The source closure contained 89 files, with sorted path/hash digest `d8636017a616625a66cde26f87ad31ec8fd06f270f187662271037efb3afb2a3`.

The five requested cases still match upstream outcomes:

| Case | Rust result |
| --- | --- |
| `ref.json:20` | valid, invalid |
| `ref.json:30` | invalid, valid |
| `ref.json:31` | invalid, valid |
| `refRemote.json:5` | valid, invalid |
| `anchor.json:3` | valid, invalid |

The immutable [raw Rust capture](rust-raw-v6-2026-10-23.json) has SHA-256 `fe9f4d0e86bd19903d3a49a166da9fbaaff350d36df7d8c5c3715d91bd20c2f0`; the [comparison report](comparison-v6-2026-10-23.json) has SHA-256 `123789ac924c05fb4a354da36ebb3629f6a5fe07a8ceb2b323b5b0ca3b87b74e`.

The reviewed acceptance gate was rerun against these exact reports and remains rejected. It reports remaining dynamic-reference and vocabulary disagreements, Rust semantic disagreements with upstream, three Rust compile refusals, nine not-compiled vectors, and one runtime error. Original/exported Ajv parity remains 0 mismatches among 1,273 compared vectors; that does not waive Rust disagreements with upstream. This capture is evidence of the bounded resource-identity correction, not broad Draft 2020-12 support.
