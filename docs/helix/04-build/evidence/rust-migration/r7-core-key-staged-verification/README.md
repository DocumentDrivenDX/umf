---
ddx:
  id: umf.evidence.rust-migration.r7-core-key-staged-verification
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R7 staged Core Key verification candidate

This source-pinned opt-in candidate splits `verifyCoreKeyOperation` into two
Rust-owned stages. Stage 1 admits and validates the receipt, recomputes the
operation once, and retains the verified receipt in a non-serializable Rust
value. Stage 2 admits current, compares it with the retained target, and moves
the retained receipt out of the one-use handle without a second receipt copy.
Node N-API and WASM expose opaque, engine-bound, one-use handles. The JS facade
keeps only the native Rust handle in a closure-private `WeakMap`; forged,
reused, and cross-engine facade handles are refused before current is read.

The core-wire runtime requires the exact closed resource set
`coreSchema`, `referenceSchema`, `packageSchema`, `constraints`, and
`domainPolicy`. Its current capability object has no extension callbacks, so
verification requiring extension semantic callbacks is outside this
candidate. Generic wire has no finish operation accepting caller-prepared JSON.
The generic JS operation remains available to direct wrapper construction used
by unit tests; the Node/WASM public engine factories always install the native
staged runtime and fail closed with `RUST_BINDING_MISSING` or
`RUST_WASM_BINDING_MISSING` when it is unavailable. The default package/root
routes are unchanged. No default-route selection or extension-callback parity
is claimed.

## Source and build pins

The existing TypeScript predecessor packet is
[`r5-core-keys/frozen-typescript.json`](../r5-core-keys/frozen-typescript.json),
SHA-256 `b6e976136750ed0112e9830d24b6e7e41d41485ed172f8a059954a12c413dd8f`.
It freezes the operation semantics and receipt-before-current ordering. The
staged APIs are additive; their handle behavior is covered by focused native
and wrapper tests rather than presented as predecessor API behavior.

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/core_keys.rs` | `8e19fcf99929331eef7c55db095c765418665483037976345fdee80a2088fef7` |
| `crates/umf-core-wire/src/core_key_verification_binding.rs` | `d758bd70d5649811450e897fedc6de092124a81583c928836b152ea594dd6eea` |
| `bindings/core/node/src/core_key_verification.rs` | `164e3035a160f7d60cbd7eda1c672e06f7a3ccdd8e9d5f74ab7894038fd41011` |
| `bindings/core/wasm/src/core_key_verification.rs` | `b1e474c8b00e2679ea205fc010250302365f79169bbc534cb181816c66b42698` |
| `bindings/core/node/src/core-keys.js` and `bindings/core/wasm/src/core-keys.js` | `afa78b6aa6923332cbbfc56d5d61cf3d142322740eaa2382b39ca73c4dbddcfc` |
| `bindings/core/node/index.js` | `3841cbe12f700cc1b20d3756d8d4a50967db83c64fc917de25ebf4937864f12e` |
| `bindings/core/wasm/index.js` | `c7c67b7cbd569132ac688d20b125306c66858fb1aeff38ad4aa8f0c5b127efac` |

Private build inputs and outputs for this replay:

- Rust: `1.90.0`; Node target: `aarch64-apple-darwin`; WASM target:
  `wasm32-unknown-unknown`.
- `cargo build --manifest-path bindings/core/node/Cargo.toml --offline`
  using `CARGO_TARGET_DIR=/private/tmp/umf-r7-key-verification-target`.
- `cargo build --manifest-path bindings/core/wasm/Cargo.toml --target
  wasm32-unknown-unknown --release --offline` using
  `CARGO_TARGET_DIR=/private/tmp/umf-r7-key-verification-target`.
- `wasm-bindgen 0.2.100 --target web` generated the private browser package.
- Fresh Node addon SHA-256:
  `a8bcf5205ff70c0b7ea5898aa1e53f5712c273c3b78b0668bb4fa5b8e28aebec`.
- WASM binary SHA-256:
  `9cf1db065a450394ad916c94a267b5954a7d4adb90dbd792d76debaec1a15218`.
- Generated `umf_core_wasm.js` SHA-256:
  `e70109ed5dd5c9cc37a9d7f5adf7a1f073de3edc4b9a1bacd1662928026494e5`.
- `wasm-bindgen` executable SHA-256:
  `00326bebe59ad1efe1330427b21200efaba7b4f2c45e766ede3361217b61ceb1`.

## Verification

- `cargo test -p umf-core-wire --lib core_key_verification_binding::tests
  --offline`: 3 passed. Includes unknown-resource refusal, engine-bound
  one-use receipt comparison, and a 700,000-unit unknown-root retention case.
- `cargo check --manifest-path bindings/core/node/Cargo.toml --offline`: passed.
- `cargo check --manifest-path bindings/core/wasm/Cargo.toml --target
  wasm32-unknown-unknown --offline`: passed.
- `rustfmt --edition 2021 --check` on the four new/changed Rust source files:
  passed.
- `bun run typecheck`: passed.
- Node wrapper and WASM factory tests: 9 passed, including two independent
  host-facade checks that a finish failure consumes its handle.
- Node package binding tests against the fresh private addon and copied current
  package source: 4 passed, 13 assertions. The first run against the existing
  package addon failed because that addon did not export
  `CoreKeyVerificationRuntime`; no checked-in addon was overwritten.
- A direct fresh-addon N-API replay passed success, cross-runtime refusal, and
  one-use refusal.
- Fresh private package replay in Chromium passed with Chromium
  `153.0.8010.12`. Exact command: `bun
  /private/tmp/umf-r7-private-wasm/wasm-stage-browser.ts`, run with localhost
  bind enabled after the sandboxed attempt returned `EADDRINUSE`. The replay
  initialized the freshly generated WASM package in Chromium and verified
  successful staged receipt equality, cross-engine handle refusal, and
  one-use refusal. Harness SHA-256:
  `92230c92454d569d23000544cfe126e959730ef6413a07196fcf93adbceb3aa3`.
  The private package used the current wrapper/index hashes above and the
  generated WASM/JS hashes recorded above. No checked-in package artifact was
  overwritten.

These checks qualify an opt-in candidate on the pinned Rust/wasm-bindgen,
Darwin-arm64 Node build, and Chromium 153.0.8010.12 replay. They do not qualify
other hosts, generic extension callbacks, default routes, or default-root
selection.
