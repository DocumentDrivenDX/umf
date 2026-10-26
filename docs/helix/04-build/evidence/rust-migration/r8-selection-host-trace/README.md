---
ddx:
  id: umf.evidence.rust-migration.r8-selection-host-trace
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
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R8 `selectCoreElements` host trace

This is a bounded diagnostic comparison of the unchanged TypeScript
`selectCoreElements` route and the private Rust host-JSON candidate. It does
not change default routing and does not establish complete parity. The matrix
has 13 cases for callback warning and registration order, thrown values and
invalid callback results, query/source refusal order, source validation,
copy-budget admission, `kindRuntime` delegation, source-then-query Proxy
reflection, and output prototypes/own descriptors.

## Reproduction

From the repository root:

```sh
node scripts/rust-migration/r8/selection-host-trace-node.mjs docs/helix/04-build/evidence/rust-migration/r8-selection-host-trace/node.json
bun scripts/rust-migration/r8/selection-host-trace-node.mjs docs/helix/04-build/evidence/rust-migration/r8-selection-host-trace/bun.json
bun scripts/rust-migration/r8/selection-host-trace-browser.mjs docs/helix/04-build/evidence/rust-migration/r8-selection-host-trace/chromium.json
```

The browser command requires the approved local Chromium launch environment.
The Node/Bun runner verifies the fixed-point manifest plus the reference
bundle, Node bundle, native addon, and all selected source inputs. Chromium
verifies the reference bundle, WASM binary, and all selected live Selection
inputs. The browser replay uses older checked-in wasm-bindgen glue
(`bindings/core/wasm/pkg/umf_core_wasm.js`, pinned separately in the receipt)
because generated glue is not included in this manifest cohort; this only
establishes focused compatibility with the manifest-pinned WASM binary. The
receipts are selected-input diagnostics against the earlier fixed-point
distribution; concurrent unrelated worktree edits mean they are not proof that
the entire live source tree still matches the package closure.

## Results

The source-pinned Node 26.12.1 and Bun 1.4.3 runs each completed all 13 cases
with 2 exact value/error matches, 9 output-shape matches, and 5 exact host
trace matches. Real Chromium 153.0.8010.12 completed the same 13 cases with
zero page errors and the same 2/9/5 comparison counts. Full per-case details
and artifact/source hashes are in `node.json`, `bun.json`, and `chromium.json`.

The remaining cutover gates are callback warning/registration behavior,
callback thrown-value projection and callback-invalid-result handling,
invalid-query and invalid-source diagnostic parity, validation on empty
results, and `Registry.kindRuntime` delegation. The candidate does not promise
semantic callback or `kindRuntime` equivalence. Host traces and bounded
own-property summaries are diagnostic probes; they do not prove parity for all
Proxy/accessor combinations. Keep the default route unchanged until these
semantic and host-boundary differences are either resolved or explicitly
excluded by an approved support contract.
