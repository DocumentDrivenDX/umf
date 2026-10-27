---
ddx:
  id: umf.evidence.rust-migration.r8-relationship-consumer-source-replay
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-relationship-consumer-predecessor
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
---

# R8 relationship consumer source replay

The source V4 Node root matched the frozen TypeScript reference outcomes for all
18 predecessor cases: 6 projected receipts, 6 blocked projections, and 6
`NON_JSON` accessor refusals. The full returned receipts, exception shapes, and
accessor traces matched the frozen packet exactly. The frozen packet SHA-256 is
`63b3192b3328eecb9d76790f8f4170e7754b17d8e25fce7bb4e690755a440ba1`.
The Node V4 source root used the worktree's existing native Node addon; its
binding entry and addon hashes are pinned in [`node.json`](node.json), but the
addon was not rebuilt as part of this replay. See that receipt for per-case and
source/input hashes.

A freshly bundled source V4 browser root passed the 15 browser-capable cases in
real Chromium 153.0.8010.12: 5 projected, 5 blocked, and 5 accessor refusals.
Outcome and trace parity matched the same frozen packet exactly; Chromium
requested the freshly built WASM once, reported no page errors, and had no
`process` or `Buffer` globals. The browser build used Bun 1.4.3, Rust/Cargo
1.90.0, and wasm-bindgen 0.2.100. Its WASM SHA-256 is recorded in
[`browser.json`](browser.json).

Reproduce the Node source replay with:

```sh
bun scripts/rust-migration/r8/relationship-consumer-source-node-replay.ts
```

Rebuild the browser WASM package and replay Chromium with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-r8-relationship-consumer-wasm-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
cargo build --locked --offline --release \
  --manifest-path bindings/core/wasm/Cargo.toml --target wasm32-unknown-unknown
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen \
  --target web --out-dir /private/tmp/umf-r8-relationship-consumer-wasm-pkg \
  --out-name umf_core_wasm \
  /private/tmp/umf-r8-relationship-consumer-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
UMF_R8_RELATIONSHIP_WASM_PKG=/private/tmp/umf-r8-relationship-consumer-wasm-pkg \
bun scripts/rust-migration/r8/relationship-consumer-source-browser.mjs
```

The browser subset excludes PostgreSQL because its supplied
`@libpg-query/parser` backend is Node-only. These are source-root and
representative-case results, not installed-package or release qualification;
the packet covers selected cases rather than each consumer's full matrix.
