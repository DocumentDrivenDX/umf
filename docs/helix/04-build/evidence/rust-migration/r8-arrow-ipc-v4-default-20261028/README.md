---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-ipc-v4-default-20261028
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
---

# R8 Arrow IPC V4 source selection

The V4 Node and browser roots now source-select the Rust-backed host operations
`captureArrowIpc`, `exportArrowIpcCapture`, and `inspectArrowIpcCapture`. The
`./reference` package route remains the TypeScript implementation. These
operations preserve exact captured bytes and document data; they do not parse,
validate, or interpret native Arrow IPC framing or payload semantics. Rust
migration ledger retirement remains pending an installed current-source receipt.

`rust-ipc-default.ts` converts binding-local `UmfError` and recognized native
`UmfCoreError` values into the public model `UmfError`. The focused tests verify
that the exported V4 class is used for wrong byte class, cross-realm bytes,
oversize bytes, invalid IDs, and invalid export documents. Caller iterator and
ID getter exceptions retain the original thrown object identity. `inspect({})`
returns the TypeScript predecessor's diagnostic result; it does not throw.

## Verification

`bun test tests/rust-core/arrow-ipc-v4-default.test.mjs` passes 3 tests and 101
assertions. The suite runs the actual `src/index-node-v4.ts` root against all 18
frozen R5 IPC fixtures and the retained TypeScript source. Capture documents,
inspection results, and exported bytes match; it also checks defensive copying,
host admission order, error shape/class, invalid export input, and caller
exception identity.

A fresh browser WASM package was built from this worktree source, outside the
repository, so the stale generated `bindings/core/wasm/pkg` package was not used:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-arrow-ipc-v4-target \
cargo build --locked --offline --release --target wasm32-unknown-unknown \
  -p umf-core-wasm --features umf-core-wire/embedded-adapters
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen \
  --target web --out-dir /private/tmp/umf-arrow-ipc-v4-pkg \
  --out-name umf_core_wasm \
  /private/tmp/umf-arrow-ipc-v4-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun scripts/rust-migration/r8/arrow-ipc-v4-chromium-smoke.mjs \
  /private/tmp/umf-arrow-ipc-v4-pkg
```

The real Chromium 153.0.8010.12 run passes all 18 fixtures and 54 capture,
inspect, and export operations. It also confirms public error identity, iterator
exception identity, no page errors, and fail-closed initialization for synthetic
missing and corrupt WASM assets. Browser bundle SHA-256:
`108b36d0dd03ce7ffdb00730c5dc57450f57b9d0c971c8d158b21b9009c2eb64`.
Fixture manifest SHA-256: `6a921cebb0fefdf5cfe3ca72d074e354754c2a0fe56735d8485d896084f7e009`;
ordered fixture packet SHA-256: `b2846cb1350a0f426f51e39d5816429cf8facdd11b2ac244bc5429cf12da4651`.
Fresh WASM binary SHA-256:
`79a62650b37dde8ce1c4711062d0d4c64264e9f4ef825ad1b028286a7fabc7e3`.
The browser test builds the V4 root with the matching freshly generated
wasm-bindgen JS glue and binary. It does not qualify the stale checked-in
`bindings/core/wasm/pkg` output.

`PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH
CARGO_TARGET_DIR=/private/tmp/umf-arrow-ipc-v4-target cargo test -p umf-core-wire
--test r5_arrow_ipc_capture_wire --quiet` passes 4 tests. Full
`bun run typecheck` passes for both the project and tools TypeScript configurations.

## Snapshot identity and limits

The following hashes bind the evidence to the source used for this run:

- `src/index-node-v4.ts`: `03fbf6c138ff391a64bb19743108003cb33aa6fc1d92819b44c45a369e6562c5`
- `src/index-browser-v4.ts`: `c8afadc3ab4d98ee8c357f826c760600b1ee0de392bfc0577865d14bf5b2c965`
- `src/adapters/arrow/rust-ipc-default.ts`: `5bad0b6941a42fd17a57732afc7f6d6a79b997ebde67dbb981f66348b802a103`
- TypeScript predecessor `src/adapters/arrow/capture.ts`: `d8b75f23a0d2637eac6c18e7826c6c75a3c217b1c5933120e4174812934d79f9`
- Node addon `bindings/core/node/umf_core_node.node`: `412aeed98ff2cae10f987eb1cc5a474d2d24e491d0d5e184eaf42e3d874b55c9`
- Fresh WASM JS glue: `81d853e7a5421f837d212f86da3665461931c34c66461d065657e7e1bfab0b11`
- Focused Node test: `8f2e42a58792c0f310289025813677c70cb3d2d012548edecf2b7bf47e44bdea`
- Chromium harness: `378c7d167259da3a3b5fe4a35c0166b9f8f98734972299f765ac86fdbea22b7d`

The TypeScript host behavior is preserved for ordinary byte arrays and the
frozen iterator/getter ordering cases. Arbitrary proxies, accessors, and
custom-prototype document values are not qualified across the JSON bridge.
These source-selection results are not an installed-package current-source
receipt, do not retire the migration ledger, and make no claim of native IPC
framing, schema decoding, or data validation.
