---
ddx:
  id: umf.evidence.rust-migration.r8-selection-kind-runtime-false-refusal
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-kind-runtime-result-continuation
      kind: continues
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private Selection `kindRuntime` false-result refusal

This receipt records a private host route for the false result of
`kindRuntime.valid`. For a false result, it obtains the live diagnostics value,
passes it through the host's live `JSON.stringify`, and constructs the native
Error carrier so JavaScript string coercion and the Error message match the
predecessor behavior. The resulting refusal remains `CORE_SELECTION_SOURCE`.
The true-result path remains unsupported by this route.

The work is governed by [CONTRACT-001](../../../../02-design/contracts/CONTRACT-001-core-envelope.md)
and [CONTRACT-040](../../../../02-design/contracts/CONTRACT-040-core-ideals.md). It continues the
[Selection result-continuation evidence](../r8-selection-kind-runtime-result-continuation/README.md).
No V4 default route or generated migration artifact is covered.

## Validation

| Check | Result |
| --- | --- |
| Rust focused tests | 7 passed, 0 failed |
| Bun focused host tests | 4 passed, 0 failed; 32 assertions |
| Node differential replay | 36/36 outcomes and 36/36 host traces; Node v26.12.1 |
| Bun differential replay | 36/36 outcomes and 36/36 host traces; Bun 1.4.3 (Node compatibility runtime `v26.3.0`) |
| Chromium differential replay | 36/36 outcomes and 36/36 host traces; Chromium 153.0.8010.12 |

Each runtime replay receipt is checked in beside this README. Receipts include
full source hash inventories, host/runtime versions, and exact per-case outcomes
and traces. The native Node addon hash was
`8782e576b4d479bceb78bff0a4d22e4beb7a6495cbecb2a1a17d5f24222f8e43`;
the browser WASM hash was
`29011aa67719b1c07ea12851487e31dfdd52cd5895a298780b35ec5b482ad7b1`.

Commands (run from the repository root):

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-selection-false-target cargo test --locked --offline -p umf-core --lib selection_host_json::opaque_return_tests
UMF_SELECTION_ADDON=/private/tmp/umf-selection-false-target/debug/umf_core_node.node bun test ./bindings/core/node/tests/selection-host-json.test.js -t 'kindRuntime false result'
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-selection-false-target cargo build --locked --offline -p umf-core-node
cp /private/tmp/umf-selection-false-target/debug/libumf_core_node.dylib /private/tmp/umf-selection-false-target/debug/umf_core_node.node
UMF_SELECTION_ADDON=/private/tmp/umf-selection-false-target/debug/umf_core_node.node UMF_SELECTION_RECEIPT=/private/tmp/umf-selection-false-node-final2.json node scripts/rust-migration/r8/selection-callback-node.mjs
UMF_SELECTION_ADDON=/private/tmp/umf-selection-false-target/debug/umf_core_node.node UMF_SELECTION_RECEIPT=/private/tmp/umf-selection-false-bun-final2.json bun scripts/rust-migration/r8/selection-callback-node.mjs
bun scripts/rust-migration/r8/selection-callback-browser.mjs /private/tmp/umf-selection-false-chromium-final.json
```

The three replay commands above produced the checked-in receipts without
altering them. The Chromium invocation required the local browser sandbox
exception to start Chromium; this is execution environment evidence only.

## Source pins

SHA-256 pins below are for the changed implementation and test-harness sources.
Each runtime receipt contains the complete source inventory used by its replay.

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/host_json.rs` | `42da7a4ef258fea5b249088956f0bfe172095e0621e125807399698cd58f169b` |
| `crates/umf-core/src/selection_host_json.rs` | `5daf961962c7a433d63e22cafc475a324927449e2bf9a6f548db7c817c59876d` |
| `bindings/core/node/src/host-json.js` | `4deb54955daee4ace008978b4b50ba130910e171dd09a2dff169b499cb7a8f63` |
| `bindings/core/node/src/host_json.rs` | `8f4117e8aa170da5b7311f40489ecd8911b6193b65ff5590f4ddf8eb2b41c8d7` |
| `bindings/core/node/tests/selection-host-json.test.js` | `cf1a262c68f6762a1e44e38f2e4e4e06aca6875c464f2caf8424b0dec9a0c665` |
| `bindings/core/wasm/src/host-json.js` | `4deb54955daee4ace008978b4b50ba130910e171dd09a2dff169b499cb7a8f63` |
| `bindings/core/wasm/src/host_json.rs` | `308b28bcc315e5f9f940944c99cc0dfe7988e780f9606c932e97f039453e0812` |
| `scripts/rust-migration/r8/selection-callback-suite.mjs` | `a3b9efb623c4c186194edcb68a6d030c6b7d5967d2142b0239a950aad73e7a0b` |
| `scripts/rust-migration/r8/selection-callback-node.mjs` | `d6554ebae5739fa6033cf86d41ced0c07512fbd74d3ea5a2902d4a2dca4c0a9c` |
| `scripts/rust-migration/r8/selection-callback-browser.mjs` | `e7e36cc86ef8a4c14184da311045b69e302591b05f07ec0f3a16d6c497df0eba` |

## Scope and limits

This evidence covers only `kindRuntime.valid === false` on the private Selection
route and the tested diagnostics, `toJSON`, undefined stringify result,
non-string stringify return, UTF-16 message, and thrown-value controls. The
success result (`valid === true`) is still unsupported; this receipt does not
claim default-root or package-release support.

Host callbacks and JavaScript coercion execute outside the Rust work budget.
Resource-limit ordering and effects from arbitrary getters, Proxies, replacers,
or monkeypatched `JSON.stringify` / `Error` are not qualified. The tested
monkeypatch cases do not establish general monkeypatch parity. The implementation
bounds the returned message after host stringification; it does not bound the
host's stringify work. Evidence is limited to the listed runtime versions and
the replayed cases.

