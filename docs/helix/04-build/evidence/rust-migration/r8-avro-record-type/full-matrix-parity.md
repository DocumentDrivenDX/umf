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
seconds. This exercises the Node-API addon from Bun's host runtime. Fresh Node
26 and Chromium/WASM full-matrix replays are recorded below.

## Node 26 host replay

A fresh debug Node-API addon was built from this checkout using Rust 1.90.0,
locked and offline, into a private Cargo target. Its copied `.node` artifact
SHA-256 is `cf404e3f9b6e14924b2e2b67d74a9082f5f5e6ee2752443cf30a6b779eb9589f`.
Node v26.12.1 loaded the private public facade and addon. The direct replay
compared all 30 complete receipts after object-key canonicalization and all ten
classified-case JSON recoveries against the frozen packet. Result: 30 cases,
10 recoveries, passed. This is a fresh host replay; it does not establish an
installed/default SDK route.

Build and replay:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-avro-matrix-node26-target \
cargo build --locked --offline -p umf-core-node
cp /private/tmp/umf-avro-matrix-node26-target/debug/libumf_core_node.dylib \
  /private/tmp/umf-avro-matrix-node26.node
cp -R bindings/core/node /private/tmp/umf-avro-matrix-node26-facade
cp /private/tmp/umf-avro-matrix-node26.node \
  /private/tmp/umf-avro-matrix-node26-facade/umf_core_node.node
node /private/tmp/umf-avro-matrix-node26.mjs
```

The direct replay script SHA-256 is
`1c9beb3b2295edcbe2124a4f4b29ca497a908c7727f8ed66d6726528ac75ae77`.

## Chromium/WASM host replay

A fresh release WASM build was produced from the current checkout using Rust
1.90.0, locked and offline, then processed with wasm-bindgen 0.2.100. Private
bundles of the WASM facade and tagged-wire transport were loaded into
HeadlessChrome/153.0.8010.12. The in-page replay compared all 30 complete
receipts and ten exact recoveries with the same frozen predecessor packet.
Result: 30 cases, 10 recoveries, passed. This is a fresh browser/WASM host
replay; it does not establish an installed/default SDK route.

Build and replay:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-avro-matrix-wasm-target \
cargo build --locked --offline -p umf-core-wasm --release --target wasm32-unknown-unknown
/private/tmp/wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-avro-matrix-wasm-pkg \
  /private/tmp/umf-avro-matrix-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun build ./bindings/core/wasm/index.js --target browser --format esm \
  --outfile /private/tmp/umf-avro-matrix-wasm-facade.mjs
bun build ./bindings/core/wasm/src/wire.js --target browser --format esm \
  --outfile /private/tmp/umf-avro-matrix-wire.mjs
node /private/tmp/umf-avro-matrix-browser.mjs
```

The first Chromium launch was blocked by the sandbox's macOS MachPortRendezvous
permission. The same private replay passed when launched with the local process
permission used by the existing browser evidence workflow. The browser replay
script SHA-256 is
`6278c6e0f8c2e0d5336c3e38e55d20b3ef224bbebe6ee7f5e32ee7b58ec52ccd`.

## Source and artifact pins

The Rust core classifier remains pinned at
`b1a7cc4cfbd3a2800f25ce28f550bdcfbebf51d67df66c453d62b475922d327a`; the Node
binding source is `70ba184b677bfed79a9eac6a628b3647a9d1b4c6b641a435521fa278888a161f`
and its public facade is `90613c3367d6dc02e3740cbd3159b55a92b86bea76c7d681e0bbd37614a9269a`.
The WASM binding source is
`3359145e79d004d10eb019f8346c74cc18933cf9f2c31eea37a32b20212a9ebc`, its
public facade is `9a20ef27a2726aa8e30c8883986955a00744faf2152fc04fed7e8c07117457ea`,
and the shared-source manifest is
`5173e6860f5783523333309e2201c6af993bacdfad47c8d3fd86bf59e1f8949c`.
The fresh Node addon hash is listed above. The fresh WASM release artifact is
`39dec231408977f703a12a6f3c19860c705d54b95c1c31922293ec8c5122414c`; generated
wasm-bindgen JS is `548abebfb3c92b317cfa24ef4c23e7501f343cee7248f8f32df89784fc348bd0`
and generated WASM is
`c14dee6e5801797e2fde48784b42758c251e63c74eda293da08476498a39bfb8`. The
frozen predecessor packet remains
`c032bb1886460c45659ec9e73ab2e3ca73c1a2ab5681c17d96a9e37644737fa9`.

The Node full-matrix test source SHA-256 remains
`52f7c68e810bbbdd5f157d9858bdb0033874ea4e12c45357b042bb288ed6685c`; the
focused Rust test source SHA-256 remains
`b1a7cc4cfbd3a2800f25ce28f550bdcfbebf51d67df66c453d62b475922d327a`.

## Source pins

The focused Rust test resides in
`crates/umf-core/src/avro_record_type_classifier.rs`, SHA-256
`b1a7cc4cfbd3a2800f25ce28f550bdcfbebf51d67df66c453d62b475922d327a`.
The Node binding test is
`bindings/core/node/tests/record-type-binding.test.js`, SHA-256
`52f7c68e810bbbdd5f157d9858bdb0033874ea4e12c45357b042bb288ed6685c`.
`rustfmt --check` and `git diff --check` passed. No production classifier or
binding implementation changed in this follow-up.
