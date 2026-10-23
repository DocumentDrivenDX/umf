---
ddx:
  id: umf.evidence.rust-migration.r5-selection-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-model-bindings
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R5 opt-in core element selection binding

`model/selectCoreElements` now routes through tagged `executeRequestWire` in
the opt-in Node/Bun and WASM core-model wrappers. It carries the source, query,
extension registry and callback token through the same ordinary operation
`Context` that constructs trusted resources, validates the entire source,
selects and copies results, and encodes the response. Raw UTF-16 values,
object keys, module and element identities remain in tagged transport. The
operation reuses the model-binding resource ceiling, host work accounting,
cancellation, deadline and hard-isolation preflight. The default TypeScript
API remains active.

Before wrapper comparison, the retained TypeScript selector was executed to
freeze seven complete success results plus the raw lone-surrogate identity
result in
[`frozen-typescript.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-typescript.json).
Inputs are in
[`input.json`](../../../../../../scripts/rust-migration/r5/selection/input.json).
They cover unknown scalar and extension content, repeated annotated edges,
AND/OR filters, empty filters, transitive cycles and preserved copied source
context. Complete TypeScript refusal envelopes, including caller-registry
semantic rejection with an empty selection, malformed source/query and copy
limits, are in
[`frozen-refusals.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-refusals.json).
The freeze checker passes without changing these snapshots.

Node 26.12.1 and Bun 1.4.3 both execute the rebuilt native addon and match all
eight selection success envelopes and five refusal envelopes. The shared run
also retains the predecessor cardinality, kind and nullability parity. Ajv
8.20.0 Draft 2020-12 accepts all eight actual Rust selection outputs alongside
the 15 actual model receipts, and rejects four mutations: two receipt-source
and two selection-field controls. Chromium
153.0.8010.12 executes the rebuilt `wasm32-unknown-unknown`
artifact through `initializeCoreModelWasm`, matches the same selection success
and refusal envelopes, passes zero-touch resource preflight for zero-work,
already-cancelled, expired-deadline and hard-isolated construction, and has no
Node `process` or `Buffer` globals. The complete successful Chromium model
factory and operation account 25,157,485 host work units.

Independent Sol review found that caller-registry conversion originally ran
before per-operation cancellation and work preflight. The Node/Bun and WASM
wrappers now use one fresh control bridge for registry admission and the
request/response path. A pre-cancelled proxied registry is untouched; a
128-entry proxied registry cancels at 389 metered units before reading any
extension descriptor. Node, Bun and real Chromium replay the corrected
success/refusal cohort. Reopened independent Sol review reproduced the
corrected Node, Bun and real Chromium cohorts and found no remaining P1/P2 in
this opt-in binding. It verified Node wrapper SHA-256
`1f6c644701a3616a8a62719c02909e8a0b3d5fed85d17afedcf92696df67762a`,
WASM wrapper SHA-256
`f1a8e73b1c0fea26a3eb48d4ac212a488fcdbfd2ec5d152cab885f1204d289e8`,
and the native addon and bound WASM hashes below.

The build used rustc/cargo 1.90.0, wasm-bindgen 0.2.100, Node 26.12.1, Bun
1.4.3, Ajv 8.20.0 and Playwright Chromium 153.0.8010.12 on Darwin arm64.
Artifacts were built under `/private/tmp/umf-r5-selection-bindings-target`;
the native addon and bound browser module SHA-256 values are:

| Artifact | SHA-256 |
| --- | --- |
| Node addon (`libumf_core_node.dylib`) | `75579fc711b1dfa9123423223329a41e8eebc2fe034d5b032a88fd32d50e0cc6` |
| Bound WASM (`umf_core_wasm_bg.wasm`) | `71db9329caec9b114e8ee2b203395034df37a5f02ec4e79c72253230eeb4600b` |

Reproduction commands:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-r5-selection-bindings-target \
  cargo check --locked -p umf-core-wire -p umf-core-node -p umf-core-wasm

UMF_R5_BINDING_ENTRY=/private/tmp/umf-r5-node/index.js \
  node scripts/rust-migration/r5/model-bindings-parity.mjs
UMF_R5_BINDING_ENTRY=/private/tmp/umf-r5-node/index.js \
  bun scripts/rust-migration/r5/model-bindings-parity.mjs
bun scripts/rust-migration/r5/verify-model-binding-ajv.mjs
UMF_CHROMIUM_PATH=/Users/erik/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  bun scripts/rust-migration/r5/model-bindings-browser.ts
```

This qualifies only the recorded opt-in current-core selection operation and
the tested runtime versions. It does not establish native adapter equivalence,
R7 default cutover, or retirement of the TypeScript selector.
