---
ddx:
  id: umf.evidence.rust-migration.r8-native-json-parser
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-json-schema-tree-operations
      kind: informed_by
---

# R8 native JSON parser audit

## Result

No missing opt-in Node or WASM operation was found. `createJsonSchemaEngine()`
in both binding facades exposes `parseNativeJson(source)` under
`umf-r5-json-schema/0.1.0`; both wrappers preflight host controls, dispatch the
tagged `parseNativeJson` operation, and map failures through the JSON Schema
error envelope. The Rust wire dispatcher calls the bounded
`NativeJsonTree::parse_json` implementation. The checked-in profile and
operation plumbing therefore already close the bounded typed-string route;
this audit adds source-bound qualification, not a new route or semantic change.

The frozen predecessor is the 22-case packet at
`docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json`,
SHA-256 `7fa939527796db5b0c541378fa7c877c413d53ed4c88db8a24945e9b08dc8a57`.
It contains 11 `parseNativeJson` cases: exact integer/fraction/exponent/negative
zero tokens; prototype, lone-surrogate and astral strings; scalars and empty
containers; syntax and duplicate-key precedence; and depth, text and value
limits. The complete packet was replayed against a fresh current-source Node
addon in Node 26.12.1 and Bun 1.4.3, and against a fresh current-source WASM
package in HeadlessChrome 153.0.0.0. Each host matched all 22 cases with zero
mismatches; thus the parser subset matched 11/11 on each host. Chromium also
confirmed own `__proto__` retention and absence of Node globals.

## Reproduction and pins

The fresh addon build used Rust 1.90.0, locked offline dependencies, and a
separate target directory:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r8-native-json-node-target \
cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml
```

The built `libumf_core_node.dylib` was copied as
`umf_core_node.node` into a temporary package containing the current checked-out
Node facade and `src/` files. The exact installed-facade replay commands were:

```sh
UMF_R5_NODE_PACKAGE_ROOT=/private/tmp/umf-r8-native-json-node/package \
UMF_R5_RECEIPT=/private/tmp/umf-r8-native-json-node/node-replay-node.json \
node scripts/rust-migration/r5/json-schema-tree-operations-replay.mjs

UMF_R5_NODE_PACKAGE_ROOT=/private/tmp/umf-r8-native-json-node/package \
UMF_R5_RECEIPT=/private/tmp/umf-r8-native-json-node/node-replay.json \
bun scripts/rust-migration/r5/json-schema-tree-operations-replay.mjs
```

The WASM build and generated glue used the same toolchain and wasm-bindgen
0.2.100:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-sdk-v4-wasm-bindgen/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r8-native-json-wasm-target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo build --locked --offline --release --target wasm32-unknown-unknown --manifest-path bindings/core/wasm/Cargo.toml

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-sdk-v4-wasm-bindgen/bin:/opt/homebrew/bin:/usr/bin:/bin \
wasm-bindgen --target web --out-dir /private/tmp/umf-r8-native-json-wasm/package/pkg \
  --out-name umf_core_wasm /private/tmp/umf-r8-native-json-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
```

The real Chromium replay used the current WASM facade and generated artifact:

```sh
UMF_R5_WASM_PACKAGE=/private/tmp/umf-r8-native-json-wasm/package \
UMF_R5_WASM_BROWSER_RECEIPT=/private/tmp/umf-r8-native-json-wasm/chromium-replay.json \
UMF_CHROMIUM_PATH='/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
bun scripts/rust-migration/r5/json-schema-tree-operations-browser.mjs
```

The browser command required the approved shell escalation because the sandbox
could not open the harness's ephemeral local listener. It passed after the
escalated retry. The receipt is outside the repository at
`/private/tmp/umf-r8-native-json-wasm/chromium-replay.json` (SHA-256
`93ee2884814f50dd6070d808b0fb68f36ca300c31e20834700ab272453b4275c`). The
Node receipts are at `/private/tmp/umf-r8-native-json-node/node-replay-node.json`
(SHA-256 `0d45946c334d88f860ef77cb0d96a0c73c64316ac7ecb785067868bb7f3f16bd`)
and `/private/tmp/umf-r8-native-json-node/node-replay.json` (SHA-256
`28bca37fecfe670bdc9ff7f0e73f96d5b92bd7682631a4a60b67b493dc9be9d5`). The
frozen packet and receipts remain unmodified in the repository.

| Input | SHA-256 |
| --- | --- |
| `crates/umf-core/src/native_json.rs` | `c55570fbe3f6895b6ebbfaf017f2d56df6698d351f8293d0359a81e6dda4d300` |
| `crates/umf-core/src/json_schema_adapter.rs` | `f1b22349613930516a758e3c963f73285e1cdd8def4de33693878e95ed09e833` |
| `crates/umf-core-wire/src/lib.rs` | `c6f9b8f3caf888bce8602825cd9b3b0679f560bd0a7606c516fa522dbe1f18e0` |
| Node binding source `bindings/core/node/src/lib.rs` | `60fabfa94da791e7105471a160c55019c44c4cae7b1b77a5e51e66b59fb9e139` |
| Node facade `bindings/core/node/index.js` | `99d06632abee1d16b256ab43766d8f8f1a61e2c883467470db5d7e3015eb9a22` |
| WASM binding source `bindings/core/wasm/src/lib.rs` | `55e82df6a43ad88eaba747162ea62224c5178ccd23a06cf6cebe134f8786eed5` |
| WASM facade `bindings/core/wasm/index.js` | `9816b1fefc4460820722055e2c1bfbac8de432dfa1a66434beb5b4210a95e731` |
| shared JSON Schema host wrapper (Node and WASM) | `2011ad790b0baa28a73c4aa9712283fbeb8c8350547eae17c1920b3e94814cf2` |
| `Cargo.lock` | `d74d138ee00f217cd0b77840d0f0262384c8e3930ed736382fd2b62ef7905fc3` |
| fresh Node addon `umf_core_node.node` | `b799a41d0fde917df8982296c6a8516bca10a945760a04ede53a4e17dd982ce4` |
| fresh generated WASM `umf_core_wasm_bg.wasm` | `587945976c01fdc8f8578e41ad0b874313ab567b7cd5f879a1010ebb4498e322` |
| generated WASM JS glue | `a48cac0a77c1f051067fcf9a4a38cd2124e4a4dacfc90a49921c9e220711c89b` |

The source hashes above pin the selected parser, wire, binding and facade inputs
relevant to this audit. They are not a hash of every transitive Rust source
compiled into either artifact: `umf-core` and `umf-core-wire` were concurrently
changing, including binding `lib.rs` files. The fresh addon and generated WASM
artifact hashes identify the tested outputs; do not interpret this selected
source closure as a complete crate-build provenance manifest.

Focused source checks also passed:

- `PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r8-native-json-wire-target cargo test --locked --offline -p umf-core-wire --test r5_json_schema_wire`: 8/8.
- `bun test ./bindings/core/node/tests/json-schema-wrapper.test.js`: 15/15,
  including Node and WASM wrapper routing of the parser through opt-in dispatch.

## Boundary and remaining work

This qualifies the current opt-in tagged-string parser and its frozen 11-case
subset. It does not change the default `src/index.ts` `parseNativeJson` export,
claim raw JavaScript-host parity, or qualify the broader JSON Schema adapter.
The six-case direct TypeScript host supplement records wrong-type host behavior;
the wire contract admits a tagged string and rejects a non-string `source` as
`REQUEST` before parser entry. That boundary difference is intentional and
remains a blocker to substituting the opt-in operation beneath the unmodified
default root export. Default-route selection and shared R8 inventory/ledger
updates remain separate work.
