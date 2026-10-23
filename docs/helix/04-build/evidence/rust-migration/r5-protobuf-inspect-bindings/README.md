---
artifact_id: R5-PROTOBUF-INSPECT-BINDINGS
artifact_type: evidence
status: captured
---

# R5 Protobuf inspector Node and browser bindings

This packet records the additive, opt-in Node/Bun and browser WASM binding for
the reviewed Rust Protobuf descriptor inspector route. The public profile is
`umf-r5-protobuf-inspect/0.1.0`; the only operation is
`protobuf.descriptor.inspect`, carried as `{op, document}` through the tagged
`umf.core-wire/1` protocol. The JS API is `createProtobufInspector(...).inspect(document)`;
browser callers can use `initializeProtobufInspectWasm(...)`. No default route
changes.

The wrapper uses one Rust control hook for tagged admission, inspector work and
result encoding. Host-side tagged conversion and envelope decoding also use
the existing meter bridge. `maxWork`, cancellation and deadlines are
cooperative checks at charged work points; they do not preempt Rust work.
UTF-16 code units use the established tagged transport. Hard isolation is
unavailable.

## Scoped observations and limits

The Node/Bun and Chromium checks compare the empty-descriptor compiler warning
and unknown-root-wire diagnostic order against the frozen TypeScript inspector
predecessor observations. On the repaired inspector source they also observe
an unpaired surrogate in an actual `PROTOBUF_REPRESENTATION` diagnostic path.
The fake WASM envelope test verifies exact UTF-16 path and message code units;
the native Node control check verifies a real `METER_FAILURE` error envelope
with ordinary UTF-8 text. Both real runtime probes count the synchronous meter
callbacks made during JavaScript admission, then throw once on the next callback
inside the Rust operation and assert the returned Rust error envelope. Chromium
also verifies per-call metering, resource refusal, cancellation and absence of
Node globals. These observations do not establish broad Protobuf
conformance, native compiler acceptance, or source compiler/import support.
Results remain `complete: false`; the inspector reports that native compiler
validation is required. Unknown wire content is retained in the descriptor
representation and surfaced as a warning, without semantic interpretation.

## Focused verification

The native module was built using an isolated Cargo target directory. The
compiled addon was staged under `/private/tmp` because the worktree's existing
`.node` file is outside this task's writable filesystem roots.

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-inspect-bindings-target \
cargo build --locked --offline -p umf-core-node
mkdir -p /private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node
mkdir -p /private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node/src
cp bindings/core/node/index.js bindings/core/node/package.json /private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node/
cp bindings/core/node/src/*.js /private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node/src/
cp /private/tmp/umf-r5-protobuf-inspect-bindings-target/debug/libumf_core_node.dylib \
  /private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node/umf_core_node.node
UMF_NODE_BINDING_DIR=/private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node \
  node scripts/rust-migration/r5/protobuf-inspect-bindings-node.mjs
UMF_NODE_BINDING_DIR=/private/tmp/umf-r5-protobuf-inspect-node/bindings/core/node \
  bun test tests/rust-core/protobuf-inspect-bindings.test.mjs
```

The native Node runner passed on Node 26.12.1, matching two frozen predecessor
observations, an actual UTF-16 diagnostic path, the real error envelope and
four host-control cases, including a failure injected at the first Rust hook.
Bun 1.4.3 passed three focused tests (21 assertions),
including the WASM wrapper's tagged request, exact UTF-16 error path/message
and profile checks with a fake module. The real browser test passed in Chromium
153.0.8010.12, matching both predecessor observations and checking the real
UTF-16 diagnostic path, UTF-16 meter failure injected at the first Rust hook,
resource limit, cancellation and Node global absence. The native addon SHA
matches the staged `.node` binary used by both Node and Bun; all source and
WASM artifact hashes are in the adjacent manifest and browser receipt.

The WASM module was built and bound with isolated outputs:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-inspect-bindings-target \
cargo build --locked --offline --release --target wasm32-unknown-unknown -p umf-core-wasm
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/wasm-bindgen-cli-target \
cargo install wasm-bindgen-cli --version 0.2.100 --locked --offline --root /private/tmp/wasm-bindgen-cli
/private/tmp/wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-r5-protobuf-inspect-pkg \
  /private/tmp/umf-r5-protobuf-inspect-bindings-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun scripts/rust-migration/r5/protobuf-inspect-bindings-browser.ts
```

The browser harness requires localhost access to serve the staged WASM package.
Its temporary server bind was approved by the environment reviewer for this
focused Chromium check.

## Source identity

Source hashes are recorded in `source-hashes.json` alongside this packet and
identify the binding files, focused tests and browser harness used for this
capture. The predecessor source archive remains frozen and untouched.
