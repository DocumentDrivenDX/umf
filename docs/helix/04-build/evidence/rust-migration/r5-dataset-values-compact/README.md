---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-compact
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
---

# R5 compact dataset-values core slice

This evidence freezes the live TypeScript `validateCoreDatasetValuesCompact` and `verifyCoreDatasetValuesCompact` operation cohort and compares the opt-in Rust `umf-core` implementation against complete result values. The packet covers commerce, supply-chain, archaeology, ecology, unknown/residual content, absent versus present-null, exact decimal-token spelling, duplicate/missing/parallel links, duplicate locators, structural/work limits, and a forged compact receipt. Object member order is treated as JSON-insignificant; array order and every retained field/value are compared.

The Rust implementation shares the Record/Field evaluator body and uses a compact Key tuple body with a single top-level source and `sourceRef` fragments. It has explicit compact receipt/input schemas and separate validate/verify entry points. Public full dataset operations and defaults remain separate.

## Qualification and remaining gates

The opt-in Rust compact `validate`/`verify` slice passes the 15-vector frozen complete-envelope/refusal cohort. The suite also exercises a frozen 349/350 near-threshold pair against the production invocation-local `CompactWorkLedger`. For 349 records, Rust reports 998,489 units and all 59 `work.categories` entries exactly match the live TypeScript frozen map. For the first refused TypeScript vector (350 records), Rust reaches 273,191 at `dataset-composition`, then first crosses the 1,000,000 ceiling during `receipt-and-compact-schema` at 1,001,090. It returns the frozen `LIMIT` code, message, and empty path. The full Rust category map and phase snapshots are in `production-work-ledger-threshold.json`.

The trace used to capture those internal totals was behind `UMF_R5_COMPACT_LEDGER_TRACE`, ran the production path, and was removed after capture. It did not affect admission or output. The captured accepted map was compared by exact category-name/value equality to the frozen TypeScript `work.categories`; the source fixture SHA is recorded in the snapshot. The test asserts the successful complete 349 receipt and exact 350 refusal. The frozen full-vector test compares complete result values with object member order ignored and array order preserved.

Before any recursive ledger walk, compact entry points run an iterative depth/value preflight over caller-owned `Value`s using the active Context maximum depth (128 in ordinary profile) and maximum values. It uses a depth-sized frame stack, borrows object keys, and materializes escaped paths only for refusals. Host cancellation/deadline controls are polled at entry and every 1,024 nodes without adding Context work charges; tests cover the exact depth boundary, large keys, periodic cancellation, and deadline expiry. The ledger checks at bounded phase boundaries for schema/semantic traversals and immediately before copying each source/input/result JSON node. During schema reservations, source/context scans, and dataset composition, a phase may finish before its accumulated ledger is enforced. Those traversals are still bounded by Context controls and structural preflight, but this is not proof of identical intra-phase early-stop points for every large input; the exact ledger threshold boundary established here is the frozen 349/350 pair. This opt-in slice does not qualify compact operations generally or enable default routing. Full operations remain separate.

The compact operation is also exposed through opt-in Node and WASM facade methods. The focused wire test passed 3/3, including frozen result/refusal vectors, both threshold controls and cancellation/structural-limit cases. The clean offline-installed private Node package replay passed all 17 cases under both Bun 1.4.3 and Node 26.12.1 after rebuilding the native addon against the current source/resource snapshot. Both host captures have SHA-256 `fa7b4e3f6147969574140602887761a79750fe0247c0e247b0b88443d9afab8f`, and the Node capture passes the independent Ajv 8.20.0 Draft 2020-12 schema replay. The host comparator checks JSON data semantics (object-key order ignored, duplicate key multiplicity rejected, UTF-16 string units and array order retained); it does not assert JavaScript object prototypes.

The retained 17-case predecessor packet was also replayed against the current fixed-point TypeScript source/resource closure without rewriting expected outcomes. `current-source-replay.json` records zero result/refusal mismatches across the 17 cases and identifies seven changed source/resource hashes. The five `inputSchemaWork` differences are freezer-only diagnostic metadata, outside operation results, refusal envelopes, and prior Context/work snapshots. A fresh native addon built with those current resource bytes passed the same 17-case installed Bun replay; its receipt and Ajv output are pinned separately below. The current source closure is `current-source-closure.json`; the original `index.json` and case files remain the immutable predecessor cohort.

A fresh wasm32 build using Rust 1.90.0 and wasm-bindgen 0.2.100 was packed and extracted to a clean standalone package, then replayed in Chromium 153.0.8010.12. `chromium.json` records 17/17 frozen cases, receipt verification and forged-receipt refusal, the 349/350 threshold pair, zero-work, cancellation, and deadline controls; Node globals were absent. The Node, WASM, and current TypeScript source closure have separate archive/output/source pins. These are private opt-in binding receipts only; the package root and default route are unchanged.

The local ledger is separate from the existing host `Context` meter. An observer regression confirms ordinary and observed document validation return equal envelopes and charge equal Context totals; all six observer categories match the frozen commerce categories. The schema work visitor follows local/external references in frozen resources; regex reservation and unbounded resource graphs are not covered. Independently replayed Ajv 8.20 Draft 2020-12 schema validation applies to captured Rust commerce output and establishes schema validity only.

## Reproduction

The live TypeScript freezer is `scripts/rust-migration/r5/freeze-dataset-values-compact.ts`. `index.json` contains hashes for the full enumerated relative-import/resource closure and separately records the public `src/index.ts` route. `SHA256SUMS` pins the 17 packet case files (15 matched result/refusal vectors plus two TypeScript-only threshold controls), the source-bound index, current Rust/freezer source pins, and production ledger snapshot. The Rust integration test is `crates/umf-core/tests/r5_dataset_values_compact.rs`. Actual Rust commerce output was captured at `/private/tmp/umf-r5-dataset-values-compact-rust-final.json` (SHA-256 `c74b6a44065073d085f9c45bbac5d99a2fd6fa4e068433e9a6e06b0873cdb642`) and independently validated by Ajv 8.20.0 Draft 2020-12. `bun run typecheck` passed. The final serial compact integration suite passed 4/4 (279.32s), including all 15 frozen envelopes, the production 349/350 boundary, and the direct caller-owned depth/control case. Three focused depth-preflight unit tests also passed (exact boundary/path, large borrowed key, cancellation/deadline). The trace-enabled threshold run passed 1/1 (84.60s); after removing the diagnostic, the focused threshold case was included in the final serial suite. The 16 `context::tests` host-control regressions passed, as did the observer/context-invariance test (1/1).

Historical predecessor and current-source/browser SHA-256 pins:

| Artifact | SHA-256 |
| --- | --- |
| `crates/umf-core/src/dataset_values.rs` | `4d94b0daf38a925711e790778360d806adc178f20d1a2309fc3a22ea8becc720` |
| `crates/umf-core/src/engine.rs` | `12278c5bb02d018e82a54ab227c7f4dc7b045095ba90836509f9d02509e53a4c` |
| `crates/umf-core/src/constraints.rs` | `518abd60d28acae736e2c45e89170770e39a5179b0e3ddcccd2752abcc873551` |
| `crates/umf-core/src/record_values.rs` | `4e8fb50bc1ae997076d848cf315cf51d19c30f065c7af43d702376c7b6ef55b4` |
| `crates/umf-core/src/core_key_tuple.rs` | `d3f82c374da48ff27da7869649342ea555b2197acdec684d0edd6eff2771e7f8` |
| `crates/umf-core/tests/r5_dataset_values_compact.rs` | `e0f23a2c9ed26d127ceeafe9816881153f6e40a2b7202640bcd7b4d98c5385c2` |
| `scripts/rust-migration/r5/freeze-dataset-values-compact.ts` | `5004ad60c738bead40fca1fb5ca1893f7abf37b9d130c218bd8562a082be0f22` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/index.json` | `f22dfc6bea1d30cdf194682465db510ead1c5d4050fdbc4c11127044c9551db7` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/SHA256SUMS` | `0ffa757e7180d0f1e19af90cea31fb5c7b755635ecd8dfee4a967662f999597a` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/independent-schema-check.mjs` | `4fbc47310c53382abbbe9a9a06cbe4b21bc52743dfa7bdc843e7f60857eaa34e` |
| Captured Rust commerce JSON (`/private/tmp/umf-r5-dataset-values-compact-rust-final.json`) | `c74b6a44065073d085f9c45bbac5d99a2fd6fa4e068433e9a6e06b0873cdb642` |
| `production-work-ledger-threshold.json` | `2fd54d014ccd0b0c68ac5736545203f249367c1776e9623768ccacae10beea6a` |
| `crates/umf-core-wire/tests/r5_dataset_values_compact_wire.rs` | `9a38b55183928e308b8c2fe277a1831fd99ca4714b8099eaf944c83b21d14160` |
| `bindings/core/node/src/dataset-values-compact.js` (same bytes as WASM facade) | `60c78863e833cc0cdc03f69a97ce41ac451f7f5961cab11ee6390425ab9a3899` |
| `bindings/core/node/tests/dataset-values-compact-wrapper.test.js` | `3baf43587f8784342a37203de5a976f87fabb3ca5cdffd029874a0b6c633e479` |
| `scripts/rust-migration/r5/dataset-values-compact-binding-node.mjs` (Node/Bun compatible runner) | `d1e280d45b4dc145e95431b596f55417ad067aa6044dff9568bdf0f5f206e572` |
| Private Node package tarball (`@umf/core-rust-native`, offline clean install) | `d4a757bc32310072a4349a02ad975319f06e2b7359d701cfbd88b993dc44a49b` |
| Installed-package Bun capture (`/private/tmp/umf-r5-dataset-compact-node-capture-final.json`) | `fa7b4e3f6147969574140602887761a79750fe0247c0e247b0b88443d9afab8f` |
| Installed-package Node capture (`/private/tmp/umf-r5-dataset-compact-node-capture-node-final.json`) | `fa7b4e3f6147969574140602887761a79750fe0247c0e247b0b88443d9afab8f` |
| Installed Node addon (`umf_core_node.node`) | `2e92116d4bd398a4507bdf27506f285fbf204f7e977a6fdd3cb7833c4b6d5568` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/current-source-closure.json` | `8352dd785230478bf0af6fc5e55ace1d49719da518aa0681bdec98be5e5248ad` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/current-source-replay.json` | `7e113e932c199df723e30d9462854b270c48f37106007960873098575da16ffa` |
| `scripts/rust-migration/r5/freeze-dataset-values-compact.ts` (current freezer with output override) | `aac5b23d0d47d5b316a94ece6443a459ccc8b24cadf1134feb26c9e3b1367e87` |
| `scripts/rust-migration/r5/dataset-values-compact-binding-browser.mjs` | `ee53792903a72a828007ce65ef77b3afe2c2fcb6e530bf0a3691e8a976583bf3` |
| `docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact/chromium.json` | `6fa8ba8cb9aec16417544afb7cf93d85951044639735895bc2a0d42392a7a6a5` |
| `crates/umf-core-wire/src/lib.rs` (WASM captured cohort at build) | `c1edc00d89d1837248e1eeb758b9631917d61e1e383f568ec9d259c51c87c45a` |
| `bindings/core/wasm/src/lib.rs` | `08b8557073c3b4a78cc79b431d1da5c68a045948062aee414036afb193c5cbf5` |
| `bindings/core/wasm/src/core-evolution.js` (shared package file) | `d72a448cc854c9483a6a3456f770a33a1d67d35aa04075ce674ee5ea61ff7967` |
| Fresh extracted WASM archive (`@umf/core-rust-wasm@0.1.0`) | `c3385834bf4c8b479b4760e5e151fc8779ff374ac2f96a85be77ad622337069b` |
| Fresh WASM binary (`umf_core_wasm_bg.wasm`) | `638d8db7fa9a6e86f9d0d01d0159d75b3932ac2d4866509e48c05eafd89f9494` |
