---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-host-admission
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# R5 Dataset values host admission

This opt-in binding path moves Dataset values input copying and validation into Rust while retaining JavaScript object semantics through opaque host handles. It does not change default selection. The path is scoped to `validateCoreDatasetValues` and `verifyCoreDatasetValues`; resource construction is retained once per engine, while each operation uses a fresh `Context`.

The implementation follows CONTRACT-001, CONTRACT-080, and the R5 Dataset values wire-bindings evidence. `copy_host_json` preserves the TypeScript predecessor's admission/refusal order and diagnostic path while the Dataset operation runs against the admitted copies. Verify keeps the predecessor checkpoints: receipt copy and operation/schema checks precede current input; expected input is admitted only after current input matches; validation then recomputes its receipt. Resource setup creates the control bridge before reflection, charges work before inspecting descriptors, and moves decoded resource members into `ResourceSet` rather than cloning them unmetered.

The frozen negative controls in [frozen-host-controls.json](frozen-host-controls.json) pin eight refusal/order cases: source accessor, source non-finite number, sparse array, cycle, custom prototype, malformed receipt before current input, stale current before expected input, and expected mismatch after current input matches. The Bun and Chromium replays also check successful validate/verify parity, copy isolation, and zero-touch setup refusal for `maxWork: 0` and cancellation.

| Check | Result | Receipt or artifact SHA-256 |
| --- | --- | --- |
| Focused Rust `r5_dataset_values` integration tests | 9 passed | Rust test run; see implementation-plan execution log |
| Node binding `cargo check` and release build (Rust 1.90.0, locked/offline) | passed | native addon: `0b46582829a88e16a6f142a194c14249370f6aaf070ad8e2e3675c0444abe59d` |
| WASM binding `cargo check` and release build (Rust 1.90.0, locked/offline) | passed | fresh wasm-bindgen 0.2.100 module: `cf36b3e8eb31f7af440da7e8c1177e15535341e9394a42968a9ec2eb0d1d0019` |
| Bun/Node differential: eight frozen controls and successful validate/verify (about 43 seconds) | passed | receipt: `ab6739fce87d773ee0c19d385fdc0ba52af70bea2c8b63749898d5046fbb5b8e` |
| Chromium 153 differential: eight controls, successful validate/verify and copy isolation (about 50 seconds) | passed | receipt: `96603f1567814061b95e2bc1a6cf656d3e95e87448ac313fa5b981021b3ca64a` |
| TypeScript typecheck | passed | — |
| Rust boundary check | passed, 678 modules, zero findings | — |

The Bun replay ran against an isolated package under `/private/tmp/umf-dataset-values-host-package`, not the repository's checked-in native artifact. The Chromium replay ran against a separately built WASM package under `/private/tmp/umf-dataset-values-wasm-pkg`; it compares serialized results inside the page before returning them to Playwright. Final receipt files are `/private/tmp/umf-dataset-values-host-admission-node-replay-final.json` and `/private/tmp/umf-dataset-values-host-admission-browser-replay-final.json`, identified by the hashes above. These checks qualify only the frozen packet and listed operations; the factory remains opt-in pending independent review and broader package qualification.

The final replay used these source hashes: Node `index.js` `10d95d1e7e50d9d6a8d420b97e9d2e93449a712841c7dcc4dff91899616e1f6d`; WASM `index.js` `0c8faa29194bf679852ebc444696e23d67ef2501e1aa713318b814f4dd8656f4`; Node/WASM `host_json.rs` `6748e9ec4af9b888d764c9cf1be6c7c8c72a370e0251d695627eec2d8c1a95ec` / `bb258160cd1c44cc0c025ec495a5f0b3ad57c771429014b62d7f22afd78b57d1`; Node/WASM `host-json.js` `fbfa820268ff1d30fbb398c09a2ea3de8f32315a5f0704fa7e52743a72783a09` / `3f7412d5ac867cc4de8b268fbc62f1026f70f99857e2de699edc684df157b39e`; Rust host operation `core_dataset_values_host_json.rs` `4e0dbd430e9cf0f76d0605561962072e2896b7dc47d9ed1836e933d7d535f118`; Dataset validator `dataset_values.rs` `e377f80d2e3a442a137190d46cb8753dddd00a04a56dd6d231796e64900d153f`; frozen controls `b3c67f62756cb0e7a22c0bc1a90413566e65814b5962e2d0203539520761330d`.

The primary changed sources are `crates/umf-core/src/core_dataset_values_host_json.rs`, `crates/umf-core/src/dataset_values.rs`, the Node/WASM `host_json.rs`, `host-json.js`, Node/WASM `index.js`, and their declarations. The focused differential assertions live in `tests/rust-migration/dataset-values-host-admission.test.js`, outside production binding source scans.
