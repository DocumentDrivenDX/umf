---
ddx:
  id: umf.evidence.rust-migration.r5-iceberg-bindings
  type: execution-evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-020
      kind: verifies
    - id: TD-020
      kind: informed_by
    - id: US-020
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 standalone Iceberg schema Node/Bun and WASM bindings

This packet qualifies the opt-in Node/Bun and browser-WASM bindings for the
standalone Iceberg schema JSON profile `umf-r5-iceberg-schema/0.1.0`. Both
wrappers expose `importSchema`, `exportSchema`, `inspect`, `getNode`, and
`proposeNodeEdit` over the shared `umf.core-wire/1` dispatcher. They check the
native capability version before creating an engine and use Rust's pinned
Iceberg resources. The TypeScript/default facade was not activated.

The binding test replays the immutable
[R5 predecessor baseline](../r5-iceberg-schema/README.md) without refreshing
it. Its 35 authored cases contain 26 successful imports and nine refusals.
For each successful case the test compares the inspection, exact native JSON
export, copied node value, missing-pointer error code/message, candidate edit
validation, candidate export, and unchanged source export. Bun completed all
three tests and 265 assertions. Real Chromium completed the same 35-case
operation replay. This is bounded comparison to the frozen TypeScript source
packet; it does not establish behavior outside those inputs or native Iceberg
equivalence.

Additional checks cover a lone UTF-16 surrogate through import, node access,
and export; ordered `ICEBERG_CONTEXT_UNVERIFIED` diagnostics; per-operation
host metering; a zero-work `RESOURCE_LIMIT`; and absence of Node's `process`
and `Buffer` globals in the browser. The browser run used Chromium
153.0.8010.12. A direct Node 26.12.1 smoke test imported, inspected and
exported the pinned `type-0.json` fixture.

The changed source files are:

- `bindings/core/node/index.js`, `bindings/core/node/index.d.ts`,
  `bindings/core/node/src/lib.rs`
- `bindings/core/wasm/index.js`, `bindings/core/wasm/index.d.ts`,
  `bindings/core/wasm/src/lib.rs`
- `tests/rust-core/iceberg-schema-bindings.test.mjs`
- `scripts/rust-migration/r5/iceberg-schema-bindings-browser.ts`

The Node and WASM Rust modules are thin host adapters to the shared wire
dispatcher. The wrappers provide one host-control bridge per operation. The
WASM initialization helper checks for a browser WebAssembly runtime before
loading the package. No core Iceberg semantics or shared dispatcher code is
duplicated in these bindings.

## Validation

Environment: Rust/rustc 1.90.0, Bun 1.4.3, Node v26.12.1,
wasm-bindgen 0.2.100, and Chromium 153.0.8010.12.

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
  RUSTUP_TOOLCHAIN=1.90.0 CARGO_BUILD_JOBS=2 \
  cargo build --locked --release -p umf-core-node
cp target/release/libumf_core_node.dylib bindings/core/node/umf_core_node.node
bun test tests/rust-core/iceberg-schema-bindings.test.mjs

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
  RUSTUP_TOOLCHAIN=1.90.0 CARGO_BUILD_JOBS=2 \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-iceberg-target \
  cargo build --locked --release --target wasm32-unknown-unknown -p umf-core-wasm
/private/tmp/umf-r7-wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-r5-iceberg-pkg \
  /private/tmp/umf-r5-iceberg-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun scripts/rust-migration/r5/iceberg-schema-bindings-browser.ts
```

The focused Bun suite passed `3 pass, 0 fail` with 265 assertions. Chromium
reported `status: pass`, 26 successful cases, nine authored refusals,
`utf16: pass`, positive metered work, and `RESOURCE_LIMIT`. The standalone
Node smoke test also passed. `bun run typecheck` and `git diff --check` passed
for the binding source changes.

SHA-256 values bind this receipt to the captured inputs and outputs:

| File | SHA-256 |
| --- | --- |
| Frozen predecessor `baseline.json` | `22b7654f7e05cbf3290da46db3dab887e62f419b4973eb1ee25e64a4bbef68ef` |
| `bindings/core/node/index.js` | `19adc2e67b25a21d39a8555073dab54d4442aaf429bd2ba0c4546fc452b83de3` |
| `bindings/core/node/index.d.ts` | `43b2bd9fbea613236df5d3032599e3d09b71ff752389894a9f09afe781c829e4` |
| `bindings/core/node/src/lib.rs` | `d7d0ea5a5295c55018e1995efb414b39122ef15fda07d6bac9bb5a0fbf738cb6` |
| `bindings/core/wasm/index.js` | `1381aac192af0f5d9375eabf919bd1f964ff8276ca4f029b4d43f613cf1f24cd` |
| `bindings/core/wasm/index.d.ts` | `ae8cf45dc0ffdb4474cd6e641547592098c75611afa65487565cdb6903278e04` |
| `bindings/core/wasm/src/lib.rs` | `3ff0113c36986010271090cf6a288e3d5bad45884d4f190668ae3e7f5f6794c1` |
| `tests/rust-core/iceberg-schema-bindings.test.mjs` | `1f52146b3f83ee6333f08ec69137651a8d492eb02143499c7b5119590ef7c4c5` |
| `scripts/rust-migration/r5/iceberg-schema-bindings-browser.ts` | `8b4e9c8e88665b368d11e1e5a90c19354e47c6a0db417400cdaa7843911cf877` |
| Built Node addon `umf_core_node.node` | `8cb123be4534b9d167af95e7b95170e3fd77b4fbed0f9868d1a0c334bce39fbe` |
| wasm-bindgen `umf_core_wasm.js` | `43a59e3aef55cf72138947ef8629d5ce051a2a8ba87acb7a6366326cb3f1428b` |
| wasm-bindgen `umf_core_wasm_bg.wasm` | `a6c4290354207e67a114e0a01370034a35812b9c1eab6ce0eec168caeaad59ca` |
| wasm-bindgen `umf_core_wasm.d.ts` | `015d0dd5e77ae406dbfc022ba0b63c113392c0cf743154559f08cec5d7c7424e` |

The Node addon and generated WASM package were built in this local environment;
the generated package files live under `/private/tmp` and are not checked in.
This evidence covers the opt-in adapter only. It does not claim a default
facade cutover, the broader Iceberg format, or full behavior parity beyond the
frozen authored packet and listed controls.
