---
ddx:
  id: umf.evidence.rust-migration.r7-retained-codegen-handle
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Retained codegen handle ABI replay

This evidence is limited to the opt-in retained `CodegenResources` handle. It does not claim a default-route speedup or release readiness. Real Node-target WASM and Chromium browser-target ABI replays passed.

## Reproduction

From the repository root, with `wasm32-unknown-unknown` installed and the pinned wasm-bindgen CLI available:

```sh
PATH="$HOME/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH" \
  CARGO_TARGET_DIR=/private/tmp/umf-codegen-handle-wasm-target \
  cargo build -p umf-core-wasm --target wasm32-unknown-unknown --release

/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen \
  /private/tmp/umf-codegen-handle-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm \
  --target nodejs \
  --out-dir /private/tmp/umf-codegen-handle-wasm/pkg \
  --out-name umf_core_wasm

node scripts/rust-migration/r7/test-retained-codegen-wasm-node.mjs \
  /private/tmp/umf-codegen-handle-wasm/pkg

/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen \
  /private/tmp/umf-codegen-handle-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm \
  --target web \
  --out-dir /private/tmp/umf-codegen-handle-wasm/webpkg \
  --out-name umf_core_wasm

node scripts/rust-migration/r7/test-retained-codegen-wasm-browser.mjs \
  /private/tmp/umf-codegen-handle-wasm/webpkg
```

Both replays reported `status: pass` and a real `RetainedCodegenResourcesRuntime` class. The Node replay matched a successful `generatePythonClient` request/output against the stateless Node binding. The Chromium replay matched that request's retained and stateless WASM outputs. Each replay also matched frozen `generateAccessPackage` and `diffAccessPackages` results, checked later meter/cancellation/deadline refusals, checked idempotent disposal plus refusal after disposal, and compared current default accounting to retained accounting. `controlProbeCalls: 4` counts the initial retained `generatePythonClient` operation and its three later refusal probes; mutation/copy checks, stateless comparisons, maxWork checks, and two convenience parity operations are additional calls. The initial retained operation charged 15,801,452 work units in each replay. The scripts assert the hashes of the three frozen R3 fixture files before running.

Node-target and Chromium receipts matched: `status: pass`, four control-probe calls, 15,801,452 retained work units, stateless setup/call work 236,886 / 952,618,338, retained setup/call work 937,053,874 / 15,801,452, and shared threshold 484,209,895. At that threshold meter/cancellation/deadline differed; the maxWork pair differed as described below. Parity cases were `generatePythonClient`, `generateAccessPackage`, and `diffAccessPackages`; Chromium browser was `Chromium`, browser WASM SHA-256 `7d524dd8da6777a943c491f5d3de194807ae45b6946860f0d719f9772283fb80`.

## Default promotion assessment

The exact same browser-target WASM build produced matching successful operation outputs and matching mutation/copy behavior, but default promotion is not semantics-preserving. With the same resources and a successful frozen `generatePythonClient` case, stateless setup metered 236,886 host work units and each stateless invocation metered 952,618,338 units because compilation occurs inside that call. Retained setup metered 937,053,874 units (host snapshots plus one-time native resource compilation), and a retained invocation metered 15,801,452 units.

At shared threshold 484,209,895, the stateless call refused with `METER_FAILURE`, `CANCELLED`, `DEADLINE`, and `RESOURCE_LIMIT`; the retained invocation succeeded for all four. The current API therefore charges compilation against every invocation's fresh control context, while the opt-in handle charges it once to `setupControls`. Moving the compiled setup behind the default factory changes when work is charged, which invocation can be interrupted, and whether a per-call budget refuses. Resource mutation after each factory left both outputs unchanged, and mutating a returned retained output did not change the next result. With `tablesPackage.schema = null`, the stateless factory returns an engine and the first call reports `CODEGEN_RESOURCE_INVALID`; the Node retained factory rejects construction with `GenericFailure`, while the browser WASM retained factory also rejects construction. These observed boundaries block transparent default promotion.

The safe current choice is to keep `createCodegenEngine` stateless and the retained handle opt-in with distinct `setupControls` and per-call `controls`. Any future default promotion needs an explicit accepted control-accounting/API change or a design that preserves per-call compilation charges; output parity alone is insufficient.

## Artifact and source fingerprints

SHA-256 fingerprints from the successful replay:

| File | SHA-256 |
| --- | --- |
| `umf_core_wasm.js` | `c0019c7abd57d7b33fbfb159cc007c65b363e9f9aa7f555fec4c31e04922ba3e` |
| `umf_core_wasm.d.ts` | `b4ec4965f9ad8719c8909ec595133dc4ff941f15aa6cc4dbb07476fb37aebbcc` |
| `umf_core_wasm_bg.wasm` | `5be893fc734f6408fa2d206fc5ba9203e8b06e7705892615d207e3e88f3aaa97` |
| `umf_core_wasm_bg.wasm.d.ts` | `0425f6c376e6b689e2cf43ead85c41053edb7727537d4c723888b414d57671bd` |
| Browser-target `umf_core_wasm.js` | `fc290c1745e0fec1d7e1e9edb6e84c75a599b556d784489c07b09e96402d36f7` |
| Browser-target `umf_core_wasm.d.ts` | `c4370e26f0d69f161b1acf1adf537f042dcc56b60de4f49efcbb1e5b4a0f962c` |
| Browser-target `umf_core_wasm_bg.wasm` | `7d524dd8da6777a943c491f5d3de194807ae45b6946860f0d719f9772283fb80` |
| Browser-target `umf_core_wasm_bg.wasm.d.ts` | `0425f6c376e6b689e2cf43ead85c41053edb7727537d4c723888b414d57671bd` |
| `crates/umf-core-wire/src/codegen.rs` | `524dcfd72e60461ab1b8fede43aef42af62ce631bae02a97e66dec085e1faf47` |
| `crates/umf-core-wire/src/lib.rs` | `c8dde7e1646f0ed84a40139001f68efa694e79240215d82f87684b88ef71f731` |
| `bindings/core/wasm/src/lib.rs` | `142ab8daec6b5b668a346da57b51ab0f5b1d5117a02ba710bf55fb94f0a125b7` |
| `bindings/core/wasm/index.js` | `9b901f44e02a168bef8391d442c84caf61d6744e143e8ee9c6a1372b101fd7ce` |
| `scripts/rust-migration/r7/test-retained-codegen-wasm-node.mjs` | `36df83a0fd9f275ecaf2b2a22690368cc01010b57a7980c02def83b2f2a8d4c4` |
| `scripts/rust-migration/r7/test-retained-codegen-wasm-browser.mjs` | `5fc120fd574e24cf8c79a21aa225d3c4fe871819706026345e9e5b95dcd8f34d` |

Frozen R3 fixture fingerprints checked by both replay scripts:

| File | SHA-256 |
| --- | --- |
| `docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json` | `40c05901135a90b4d9777b88a1f62aa0ade6aa47dcf85f054db01dad04560c78` |
| `docs/helix/04-build/evidence/rust-migration/r3/sol-generation-binding-module-boundary-review/frozen.json` | `574607790d9c91f72b4b0213facbf6f80ad8ea68c9bdaa953e3215e81dfc9120` |
| `docs/helix/04-build/evidence/rust-migration/r3/sol-final-access-diff-utf16-review/frozen.json` | `db359e559fd320c3ea28487e594b31b5438e8bcef51c2a73f23e664e787f2820` |

The Node suite adds frozen convenience-method parity and lifecycle/control checks in `tests/rust-core/codegen-host-admission.test.mjs`. Its full run passed 10/10 tests. The Rust context regression is in `crates/umf-core-wire/tests/codegen_context.rs`.
