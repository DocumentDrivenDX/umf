---
ddx:
  id: umf.evidence.rust-migration.r5-core-record-type-wasm-retained
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-core-record-type
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Retained WASM Core Record Type checkpoint

This is an opt-in WASM factory only. `createCoreRecordTypeEngine` does not
change `createCoreModelRootEngine` or any package default route. It exposes
declaration, one-shot `verifyCoreRecordTypeDeclaration`, and explicit
prepare/finish/discard methods. The explicit handle is engine-local and
single-use. At most 64 unconsumed stages may be retained; the 65th fails with
`CORE_RECORD_TYPE_STAGE_LIMIT`. `discardCoreRecordTypeVerification` and
`dispose` release abandoned native handles; dispose is idempotent and later
operations fail with `CORE_RECORD_TYPE_DISPOSED`.

Setup work uses `setupControls`; each logical call gets fresh call controls.
The prepared Rust stage carries receipt work/constraint totals. Finish first
consumes and owner-checks the handle, seeds those totals into its Context, and
then admits current. The JS facade consumes its private WeakMap entry before
current serialization, so foreign/reused handles do not reflect current.
Convenience verify retains one host admission bridge across prepare and finish,
so max-work, cancellation, and deadline checks apply to the whole logical
verification.

## Reproduction

From the repository root:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  cargo check -p umf-core-wasm --target wasm32-unknown-unknown --offline
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  cargo build -p umf-core-wasm --target wasm32-unknown-unknown --release --offline
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-record-type-wasm-pkg --out-name umf_core_wasm \
  target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun test ./bindings/core/wasm/tests/core-record-type-retained.test.js
bun run typecheck
UMF_RECORD_TYPE_WASM_PKG=/private/tmp/umf-record-type-wasm-pkg \
  node bindings/core/wasm/tests/core-record-type-browser.mjs
```

The focused wrapper suite passed 5/5. Typecheck passed. The WASM target check
and optimized build passed. The browser script passed on Chromium
153.0.8010.12: all three frozen v6 declaration outputs and verification outputs
matched, explicit staged verification matched, handle reuse and zero-work
refusals were observed, setup/call controls were separate, and call-two work,
cancellation, and deadline refusals fired. It also confirmed Node globals are
absent in the browser. Frozen predecessor packet:
`r5-core-record-type/frozen-typescript.json` (SHA-256
`c4e49ee65d25abb8b7f68a189dc809ca444b6e4960cf4c4d15cfaa33560225d5`).
This browser replay was rerun against the combined optimized WASM package
after adding the retained Record Members runtime; the Record Type behavior
remained identical.

## Source and artifact pins

| Input | SHA-256 |
| --- | --- |
| `bindings/core/wasm/index.js` | `3203422a117f51ebf33548019d772e3542e1149e037ee123755aedbb636775a8` |
| `bindings/core/wasm/index.d.ts` | `cdca35226c19bba1c00b90c2e3e90f462240939fe72933f504259b51de685da3` |
| `bindings/core/wasm/src/lib.rs` | `6139d02e75a6374e8636734a22b181a7b49cfb6390d220f00589a9d96d18626b` |
| `bindings/core/wasm/src/core_record_type_verification.rs` | `f5deca37675e92d3146cdc3e13f4ac47c2d109fcf74cfefee2c543c3c6340935` |
| `crates/umf-core-wire/src/core_record_type_verification_binding.rs` | `242000d4ee9d3015b4fac2e0795f23214685b508658524a993389d304d10a2c5` |
| `bindings/core/wasm/tests/core-record-type-retained.test.js` | `72dd79fdfb6f3cf5c8edb9cdfd8d9c2dde1a19e1363d2ce0275852c4bdfcdb54` |
| `bindings/core/wasm/tests/core-record-type-browser.mjs` | `bc441965ca17d6e1ea28d4791774e03b7403b72f19524dd4545e0833d0a16e8b` |
| combined generated `umf_core_wasm.js` | `483750f9ac11622a3afeccb57803fb4d6d71d4fa98bdd703dac10e93cf743bcc` |
| combined generated `umf_core_wasm_bg.wasm` | `db0895e5d000c34847adef6ea34ab826972930f64be21d024dc463bf521486a3` |

This receipt qualifies the opt-in WASM surface and its Chromium replay only.
It does not establish Node, Python, CLI, default-root, package-release, or
installed-SDK qualification. The Rust predecessor evidence itself records
broader diagnostic-string, callback, malformed-resource, and host getter
limitations; those remain open.
