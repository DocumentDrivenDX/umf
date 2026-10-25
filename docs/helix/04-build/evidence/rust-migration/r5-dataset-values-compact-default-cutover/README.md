---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-compact-default-cutover
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact
      kind: informed_by
---

# R7 compact Dataset values root-route qualification

This additive packet freezes current TypeScript `validateCoreDatasetValuesCompact` outcomes before selecting the Rust implementation for the Node and browser v4 roots. It retains the earlier 15-vector R5 packet unchanged and adds individual/crossed source and input refusals. The 17 validation cases cover commerce, supply-chain, archaeology, ecology, unknown/residual content, absent and present-null states, exact decimal tokens, duplicate keys/locators, missing and parallel links, structural/work limits, and crossed invalid source/input. A forged receipt and adjacent 349/350 controls remain separate verifier/resource cases. The packet index is `index.json`; its capture remains source-bound to the paths and SHA-256 values recorded there.

The live TypeScript order probes establish that malformed receipt copy/schema refusal occurs before `current` is traversed. Once receipt admission succeeds, TypeScript copies `current` and then `expectedInput` before comparing either against the retained receipt. Thus a stale current plus a getter-bearing expected input visits both in that order before returning the stale-receipt refusal. Tests under `tests/dataset-values-compact-visitation.test.ts` pin these observable visitation points. The Rust compact verifier now follows the copied host argument order, recomputes from the host copies, and compares the result surface after excluding retained `source` and `input` fields.

The Node and WASM compact binding wrappers perform a receipt-only prepare operation before forwarding `current` and `expectedInput` to the existing full verifier. The prepare operation returns the copied, schema-admitted receipt. The full verification call remains in one Rust `Context`. Rust unit and wire tests cover the prepared receipt and complete verify path; this binding behavior remains opt-in until installed root replay is source-coherent.

The clean compact wire replay passed on the captured source cohort with this command:

```sh
cargo test -p umf-core-wire --test r5_dataset_values_compact_wire --locked --offline -- --test-threads=1
```

It exited 0 with 3/3 tests in 591.03 seconds. The frozen-envelope/refusal case, 349/350 plus host-cancellation controls, and structural-limit predecessor refusal all passed. The test source SHA-256 is `50fe3c3bfadaf9a402a42d6a0b53eef73cd8d1c7445af38ed04f5708591de93b`; the executed test binary SHA-256 is `23639659a3138d4e22f702cd34889abf713e2cbf5712243202c1d6f89deba1ce`. The Dataset core source SHA-256 for this run is `2cf7a5ca519b6247f98165d65d3d99911b3f205a903ff320edcfa14c53ebc7ef`. An earlier duplicate run was stopped before completion and has no result; this receipt is the sole observed clean pass.

The v4 default root currently selects Rust for compact `validateCoreDatasetValuesCompact`. Compact `verifyCoreDatasetValuesCompact` remains inherited from the TypeScript reference because the Rust `Context` work meter and its separate compact ledger do not yet prove the predecessor's single cumulative `ValueWork` accounting and canonicalization/refusal thresholds. No full Dataset operation, default family retirement, or publishable SDK qualification is claimed. The 349/350 validation boundary remains covered by the R5 packet and is required again in the clean installed root replay.

The source, test, freezer, packet, Node/Bun package, and browser/WASM archive hashes will be recorded here after the combined source cohort is frozen and the installed Node, Bun, and Chromium root replays complete. Until then, the tests establish core/wrapper behavior and predecessor visitation only; they do not establish installed default-route qualification.

An integrated private SDK archive (`614ef1272deca9079a0dcca21cfb8624db10783cfefb56015ec7185d6e7f9727`) built from a fixed-point source tree with zero generated transforms. Its stronger installed Node replay stopped at `structural-limit`: the selected Rust route matched the frozen `LIMIT` code, `/context/99998` path, and message, but exposed the binding error class rather than the predecessor's `UmfError`. The root adapter now maps known compact operation refusals, including structural and work limits, to the public `UmfError` class while preserving unrelated host/control errors. The focused adapter suite passes 5/5 and typecheck passes. This fix postdates that archive; no installed Node/Bun/Chromium qualification is claimed for it until a new archive is built and replayed. The historical archive's earlier focused Node/Bun checks and inconclusive Chromium timeout are recorded separately in [the selected-operation replay evidence](../r7-sdk-selected-operation-replay/README.md).
