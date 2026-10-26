---
ddx:
  id: umf.evidence.rust-migration.r8-avro-record-type-full-matrix-parity
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: references
---

# Avro Record Type full matrix parity follow-up

## Scope and result

The frozen TypeScript predecessor packet's 30 strict/report matrix cases now
receive complete Rust result comparison, extending the previous three-case
full-result check. For every case the test compares the entire receipt after
object-key canonicalization, including source, request, status, mappings,
residuals, diagnostics and target. For each of the ten classified matrix
receipts, it also recomputes recovery and compares the complete JSON recovery
bundle. All 30 result comparisons and ten recoveries pass. No matrix mismatch
remains in this tested subset.

The change is scoped to parity tests. It does not widen the direct
record/error-classifier subset. Author and recovery controls outside the
30-case matrix, same-name ambiguity controls, unions and containers remain
separate packet cases. Raw JavaScript accessor/proxy order and the default SDK
route are not qualified here.

## Rust core replay

Rust 1.90.0, locked and offline:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target \
cargo test --locked --offline -p umf-core --features embedded-adapters \
  avro_record_type_classifier::tests::matrix_predecessor_full_results_and_recoveries_match \
  --lib -- --nocapture
```

Result: 1 passed, 0 failed, 356 filtered out; 496.14 seconds. The comparison
uses the checked-in predecessor packet at SHA-256
`c032bb1886460c45659ec9e73ab2e3ca73c1a2ab5681c17d96a9e37644737fa9`.

## Bun Node-API host replay

A fresh N-API addon was built from the current checkout into a private Cargo
target and copied to a private `.node` path. No repository addon was replaced.
The addon SHA-256 is
`89c0c07b98e1dfd94e429329c24e42e4f98305eff7ed0fa97dc70d16062c9403`.
The focused host test sends every matrix case through the tagged wire encoder,
the fresh addon, and tagged result decoder; it compares every full receipt and
all ten exact JSON recoveries to the packet.

Build and test commands:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-record-type-final-target \
cargo build --locked --offline -p umf-core-node
cp /private/tmp/umf-record-type-final-target/debug/libumf_core_node.dylib \
  /private/tmp/umf_core_node-avro-matrix.node

UMF_RECORD_TYPE_NODE_ADDON=/private/tmp/umf_core_node-avro-matrix.node \
UMF_RECORD_TYPE_NODE_PACKAGE=/private/tmp/umf-core-node-final-facade \
bun test ./bindings/core/node/tests/record-type-binding.test.js \
  -t 'full Avro Record Type matrix'
```

Result: Bun 1.4.3, 1 passed, 4 filtered out, 0 failed, 42 assertions; 664.00
seconds. This exercises the Node-API addon from Bun's host runtime. It does not
claim the full matrix under Node 26 itself or in Chromium/WASM. Earlier selected
Node and Chromium tagged-wire checks remain scoped to the source cohort and
cases recorded in `wire-binding.md`; no browser matrix replay is included here.

## Source pins

The focused Rust test resides in
`crates/umf-core/src/avro_record_type_classifier.rs`, SHA-256
`b1a7cc4cfbd3a2800f25ce28f550bdcfbebf51d67df66c453d62b475922d327a`.
The Node binding test is
`bindings/core/node/tests/record-type-binding.test.js`, SHA-256
`52f7c68e810bbbdd5f157d9858bdb0033874ea4e12c45357b042bb288ed6685c`.
`rustfmt --check` and `git diff --check` passed. No production classifier or
binding implementation changed in this follow-up.
