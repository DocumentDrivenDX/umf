---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-types-bindings.current-source-replay-2026-10-24
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-types-default-root
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-types-bindings
      kind: informed_by
---

# R5 semantic-type bindings current-source replay

This follow-up records runs against the shared source snapshot after the older
`receipt.json` checkpoint. The older receipt remains intact; its source hashes
do not match this snapshot. The Node package and optimized WASM artifact below
were rebuilt from the source hashes listed here. Both bindings remain opt-in;
no default SDK route changed.

Focused checks passed with Bun 1.4.3, Rust 1.90.0, Node 26.12.1, and Chromium
153.0.8010.12:

- `bun test ./bindings/core/node/tests/semantic-value-registry.test.js`: 9 passed, 53 expectations.
- `bun test ./bindings/core/wasm/tests/semantic-value-wrapper.test.js`: 6 passed, 15 expectations.
- `cargo test --locked --offline -p umf-core --test r5_core_semantic_types`: 11 passed.
- `cargo test --locked --offline -p umf-core-wire --test r5_semantic_types_wire`: 2 passed.
- A clean npm pack install imported by package path passed all six opt-in semantic-type operations under Node: absent versus null, copy isolation, zero-work, cancellation, and deadline controls.
- Chromium passed all six semantic-type operations with the absent sentinel, copy isolation, zero-work and cancellation controls, and no Node globals.
- The Chromium semantic-value callback replay passed 14 direct, 10 registration, and 5 aggregate cases, including reported-work charging, invalid reports, initializer behavior, dispatcher errors, and control errors.

The current Node package was built with:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-semantic-agent-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --locked --offline -p umf-core-node
```

Its clean tarball is `/private/tmp/umf-semantic-current-pack/umf-core-rust-native-0.1.0.tgz`
(SHA-256 `8b2379268c2573116f45c588f9c8b029d712b395add28696f67c3202827cf351`). The installed addon at
`/private/tmp/umf-semantic-current-install/node_modules/@umf/core-rust-native/umf_core_node.node`
has SHA-256 `16fcd40b9db77d1766736a5aa387593c20d2f207debe54dc70e4367c110db609`.
The replay command was:

```sh
UMF_R5_NODE_PACKAGE_PATH=/private/tmp/umf-semantic-current-install/node_modules/@umf/core-rust-native \
node scripts/rust-migration/r5/semantic-types-binding-node.mjs
```

The optimized `umf-core-wasm` build used the same Rust toolchain and
`CARGO_TARGET_DIR=/private/tmp/umf-semantic-wasm-build`, with
`--release --target wasm32-unknown-unknown`. wasm-bindgen 0.2.100 generated
`/private/tmp/umf-semantic-current-wasm-package/pkg/umf_core_wasm_bg.wasm`
(SHA-256 `cc3cc9f1cf925feafa9fde9f38b1d0e0964f7a1b2c55896cef4477920571daa3`)
and `umf_core_wasm.js` (SHA-256
`0c95324f4c9379e3a1f0639c6b710b81c1203df24e9443419d7169805f919435`). Both
browser replays used this freshly built artifact:

```sh
UMF_R5_WASM_PKG=/private/tmp/umf-semantic-current-wasm-package/pkg \
bun scripts/rust-migration/r5/semantic-types-binding-browser.mjs

UMF_SEMANTIC_VALUE_WASM_PACKAGE=/private/tmp/umf-semantic-current-wasm-package \
bun ./bindings/core/wasm/tests/semantic-value-browser.mjs
```

The real-browser commands use a temporary localhost server for Chromium. The
current six-operation browser replay source is
`scripts/rust-migration/r5/semantic-types-binding-browser.mjs` (SHA-256
`8102335287b04b7f9b8c51106774f4f76d9c5a6101403d93b656d9f592b2f63d`). It copies
all current `bindings/core/wasm/src/*.js` modules into its isolated test host.

SHA-256 source snapshot:

| Path | SHA-256 |
| --- | --- |
| `Cargo.lock` | `d74d138ee00f217cd0b77840d0f0262384c8e3930ed736382fd2b62ef7905fc3` |
| `bindings/core/node/package.json` | `a3808abf4ca470a7f606b1fa4046c9f71f2877ebfab9ff1159e21caa97dacbd8` |
| `bindings/core/wasm/Cargo.toml` | `5633ccb692f4cc80b9fe55a1ab9ca2ceb99642c9132d986b8f850cc4a67633c3` |
| `crates/umf-core/src/core_semantic_types.rs` | `de4dd6a48aa2c73ba918e1929ecbfd15d98970c25aecc584ddba40749e826076` |
| `crates/umf-core/src/semantic_type_accessors.rs` | `896dd809d034f468094ce9b675e6ed3597f218c1e3376eda35bdebbe5961226b` |
| `crates/umf-core-wire/src/lib.rs` | `a154801f4f414f215303ee83bb7675924b60895a18fbdcbac4c1aaab010aa228` |
| `crates/umf-core/tests/r5_core_semantic_types.rs` | `8fc1fd2238d93aed6e4c267505ddea75dce97dae1c77201fc13f15af28138e52` |
| `crates/umf-core-wire/tests/r5_semantic_types_wire.rs` | `8dc1c8b7538e5ef77cf6d357b136ee0f189ee1afcac40bdf5ecff046a0ba5779` |
| `bindings/core/node/src/core-model.js` | `d4883e2ad406e23774f1b2e3604883ce26af0c0c23be71a9db783ab2bd174764` |
| `bindings/core/node/index.js` | `aa1821a31a9c5403ebebda208f32b97b81f1697b2f5b5cee8093c752f49fecb7` |
| `bindings/core/node/index.d.ts` | `088e1fda77000ed464942d0a3e408f0f73debe86c430e250cadfd8bc5ecfd061` |
| `bindings/core/wasm/src/lib.rs` | `881e39c94322432db2318731843c40e714fcbf417a6aa75a04d8e7e65ce5b815` |
| `bindings/core/wasm/src/core-model.js` | `d12cac6e7b4be8184e69069e246e64cebfc07cb3418947a0af5f4a5ee0a5c5b4` |
| `bindings/core/wasm/src/semantic-value.js` | `708f8d9379c1391ebfa0c9cf7edb4d428c5b0c6fdb7194011316c5c50b6941eb` |
| `bindings/core/wasm/index.js` | `e1b86c2fec0a39327424a53a529b79d146b620325243141b43bdf8b63e737843` |
| `bindings/core/wasm/index.d.ts` | `c35b72b1596e4742b00a0b123e137c8c8a874bd844e1c053597169e9b1fb132e` |
| `scripts/rust-migration/r5/semantic-types-binding-node.mjs` | `f664ee6896528020a9106a4ad031f937122d8683d5bc4acb4841ca2df943a828` |
| `scripts/rust-migration/r5/semantic-types-binding-browser.mjs` | `8102335287b04b7f9b8c51106774f4f76d9c5a6101403d93b656d9f592b2f63d` |
| `bindings/core/wasm/tests/semantic-value-browser.mjs` | `fcd4b1536819c36410c0db863a808c9e9174ad72a2bbb70f050ac2a9d2c6bfd9` |

This is scoped binding and callback transport evidence. It does not qualify
large registry scaling, hard callback preemption, complete CONTRACT-078
transition behavior, default-route replacement, or a general WASM release.
