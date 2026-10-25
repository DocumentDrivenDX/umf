# R8 core relationship-selection opt-in binding

This evidence qualifies the tagged `model/selectCoreRelationships` operation
through the Node and browser-WASM `createCoreModelEngine` facades. It does not
change or qualify the default TypeScript route, the default package root, or
Registry callback behavior.

## Frozen predecessor and selected source pins

The independent predecessor is
`r5-core-relationship-selection/frozen-typescript.json`, SHA-256
`e18d492425078db54e0a057e4d71fae65fe2501895a1006d9d51a6cf02326a10`.
All 16 cases were replayed in each host. Ordered outputs are compared
structurally; failures compare `code`, `message`, and `path` only.

Selected implementation pins at qualification:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core-wire/src/lib.rs` | `672499c68b0f834ec076d73c40de3ef93a11e89ab46d87d244d2e6853643d17c` |
| `crates/umf-core/src/core_relationship_selection.rs` | `f34b6f761985b62786ec76b0feb3fa7fc9e533839fab4a507a28b84052c0bbd5` |
| `bindings/core/node/index.js` | `094741afa50d48f7b3f6ca27a91f6ad3e475d34904d0609216e0c5ec36c22f2e` |
| `bindings/core/node/src/core-relationships.js` | `ded6c56efbed6b9309d23c2880b62fe04abfa2c26325ec8c4423811fce033c04` |
| `bindings/core/wasm/index.js` | `0f68d3048f0ac353bd05f4dec6aa77677f9f3ae802e857525ed00a6f4e29f4c4` |
| `bindings/core/wasm/src/core-relationships.js` | `ded6c56efbed6b9309d23c2880b62fe04abfa2c26325ec8c4423811fce033c04` |
| `crates/umf-core-wire/tests/r8_core_relationship_selection_wire.rs` | `dd5d2729c05e193fd259fbabd9b2a7079251fbc8ae35bf17f094586821c987ae` |

These are selected source pins, not a hash of the entire workspace or crate
closure. Builds below were performed from this worktree with the lockfile and
offline dependency cache.

## Build and replay

Fresh release artifacts were built with Rust 1.90.0 into isolated temporary
targets:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r8-relationship-selection-node-target \
cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/wasm-bindgen-cli/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r8-relationship-selection-wasm-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo build --locked --offline --release --target wasm32-unknown-unknown \
  --manifest-path bindings/core/wasm/Cargo.toml

wasm-bindgen --target web \
  --out-dir /private/tmp/umf-r8-relationship-selection-wasm/package/pkg \
  --out-name umf_core_wasm \
  /private/tmp/umf-r8-relationship-selection-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
```

The staged fresh native addon SHA-256 is
`0627cd9e6e4ca3ca76ab1a299882f5289528a83905501ca47ec1d086253acea1`.
The generated WASM binary SHA-256 is
`f24c7544c759eb0f8f78aa914adce9544daa857d7fa171f43f4001647154a7e0`; generated
wasm-bindgen JavaScript glue SHA-256 is
`309ee578f3d4ba7d44f66304592eaa9e2b6647839dabd9952098eb85c2c940cd`.

Public-facade Node and Bun replays used the freshly staged package:

```sh
UMF_RELATIONSHIP_SELECTION_PACKAGE_ROOT=/private/tmp/umf-r8-relationship-selection-node/package \
  node scripts/rust-migration/r8/relationship-selection-binding-node.mjs
UMF_RELATIONSHIP_SELECTION_PACKAGE_ROOT=/private/tmp/umf-r8-relationship-selection-node/package \
  bun scripts/rust-migration/r8/relationship-selection-binding-node.mjs
```

Both returned all 16 cases, zero mismatches, packet SHA above, cancellation
`CANCELLED`, and successful control reset. Runtime versions were Node
`v26.12.1` and Bun `1.4.3`.

The real Chromium run imported the public WASM `index.js`, initialized the
generated wasm-bindgen artifact, and replayed the same packet. Exact command:

```sh
UMF_RELATIONSHIP_SELECTION_WASM_PACKAGE=/private/tmp/umf-r8-relationship-selection-wasm/package \
UMF_CHROMIUM_PATH='/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  node scripts/rust-migration/r8/relationship-selection-binding-browser.mjs
```

Chromium `153.0.8010.12` returned 16 cases, zero mismatches, no page errors,
`CANCELLED` followed by successful reset, and `process`, `Buffer`, and `require`
all undefined. The harness used a temporary loopback listener to serve the
fresh package and input packet; it did not substitute a facade stub or a
prebuilt WASM module.

The tagged wire replay also passed:

```sh
cargo test --locked --offline -p umf-core-wire --test r8_core_relationship_selection_wire
```

Result: 1 test passed, replaying all 16 cases in 66.95 seconds. TypeScript
typecheck passed (`bun run typecheck`); generated WASM source mapping was current
(`bun scripts/rust-migration/r7/wasm-package-sources.ts --check`); the scoped
Rust test passed rustfmt check, both replay scripts passed `node --check`, and
scoped `git diff --check` passed.

Compact host receipts are preserved in `receipts.json`, SHA-256
`2590b55f1cfcbf6cd71dda2ef598573371230969932837925bb34f3d5a4ef897`.

## Limits

This is opt-in tagged-wire and host-facade evidence. It does not establish
default-route replacement, package-root selection, arbitrary optional Registry
callbacks, broader installed-package/release behavior, or cross-platform
parity. Error parity is limited to `code`/`message`/`path`; JavaScript error
class identity and `instanceof` behavior are not claimed.
