---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-ipc-capture-bindings-current-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-ipc-capture-predecessor-20261027
      kind: informed_by
---

# Arrow IPC capture bindings: current-source host replay

This packet records opt-in Arrow IPC exact capture/export/inspect through the Node NAPI and browser WASM engines, replayed against the frozen TypeScript predecessor packet. It qualifies only these bindings, fixtures, packet, and source cohort; it does not select or claim a public default route.

The Node and Bun runs each passed 23 predecessor cases, 7 mutated-envelope cases, and 88 operations with no mismatches. The actual Chromium run passed the same counts. All three included the exact 1,000,000-byte case, the 1,000,001-byte `ARROW_IPC_LIMIT` refusal, unknown-payload export refusal, and input/output `Uint8Array` copy checks (`boundarySkipped: []`). Each operation used a 120,000 ms deadline control and the metering hook was observed. Inspect diagnostics were compared with object-key canonicalization while array order, paths, and error messages were preserved.

Host versions: Node v26.12.1 with N-API 10; Bun 1.4.3 (embedded Node 26.3.0, N-API 10); Headless Chromium 153.0.8010.12; Rust 1.90.0; wasm-bindgen 0.2.100; macOS arm64.

Fresh artifacts were built from the source cohort hashed in `source-manifest.json`:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-arrow-ipc-bindings-target cargo build --locked --offline --release -p umf-core-node --features umf-core-wire/embedded-adapters
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-arrow-ipc-bindings-target cargo build --locked --offline --release --target wasm32-unknown-unknown -p umf-core-wasm --features umf-core-wire/embedded-adapters
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen --target web --out-dir /private/tmp/umf-arrow-ipc-wasm-pkg --out-name umf_core_wasm /private/tmp/umf-arrow-ipc-bindings-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
UMF_ARROW_IPC_NODE_PACKAGE=/private/tmp/umf-arrow-ipc-node-package UMF_ARROW_IPC_RECEIPT=/private/tmp/umf-arrow-ipc-node-final.json node bindings/core/node/tests/arrow-ipc-current-source.mjs
UMF_ARROW_IPC_NODE_PACKAGE=/private/tmp/umf-arrow-ipc-node-package UMF_ARROW_IPC_RECEIPT=/private/tmp/umf-arrow-ipc-bun-final.json bun bindings/core/node/tests/arrow-ipc-current-source.mjs
node bindings/core/wasm/tests/arrow-ipc-current-source.chromium.mjs /private/tmp/umf-arrow-ipc-wasm-pkg
```

The Chromium runner served the fresh package and fixtures over loopback and ran in real Headless Chromium. Artifact hashes are recorded in `source-manifest.json` and `chromium.json`. Per-host outcomes are in `node.json`, `bun.json`, and `chromium.json`. The independent final-source pure Rust CLI replay in `cli.json` passed 23 cases, seven mutations, and 84 operations, including the exact and over-limit byte cases. Its focused CLI tests passed 3/3; the wire tests passed 4/4. The separate installed Python wheel [receipt](../r5-arrow-ipc-python-20261027/receipt.json) passed six focused tests on CPython 3.13.16.
