---
ddx:
  id: umf.evidence.rust-migration.r8-selection-spread-boundary
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-private-host-route
      kind: continues
    - id: umf.evidence.rust-migration.r8-selection-callback-trace
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Private Selection spread failure cohort

This cohort extends the private `executeCoreElementSelectionHostJson` callback
comparison with spread failure cases for an `undefined` result, a non-callable
`Symbol.iterator`, a throwing iterator getter, and abrupt failures at iterator
`next`, step `done`, and step `value`. Each abrupt failure has a throwing
`return` getter; the same-host TypeScript predecessor and Rust-stage candidate
both leave it untouched. Rust performs the spread-stage decisions under the
same operation `Context`; each binding creates one `Context` per route call.
Final outcome and callback event trace must match exactly.

Node 26.12.1 and Bun 1.4.3 each pass all 21 cases with 21/21 exact outcome and
event-trace matches. The fresh Rust 1.90.0 Node addon is shared by both runs.
The Bun binding suite additionally passes 14/14 focused tests, including the
full direct Selection trace for the throwing getter, exactly-once
`String(error)` conversion, final `CORE_SELECTION_SOURCE`, and source/refusal
diagnostic order. Rust diagnostic materialization unit tests pass 6/6 and the
frozen R5 Selection suite passes 10/10. A focused Rust regression suite passes
3/3, including explicit next/done/value throw propagation with no iterator
close event. `wasm32-unknown-unknown` compiles.

Real Chromium 153.0.8010.12 passes the same 21 cases with 21/21 exact outcomes
and host traces, zero page errors, and a fresh WASM artifact. Its receipt is
`chromium.json`; the WASM SHA-256 is
`fc9ae0be48fa2bda7073a9a4d63f2f82a4185b3feaba923bbaab00efd415e8c5`.

This evidence covers the 21 pinned callback and spread cases only. It does not
qualify all native spread TypeErrors, opaque callback diagnostic
materialization, `kindRuntime`, installed packages, default route selection, or
release readiness. The V4 public route is unchanged. ECMAScript array spread
does not perform IteratorClose for these abrupt `next`/`done`/`value` failures;
the tested guarantee is that the host never reads or invokes `return` here.

Reproduce the Node and Bun callback comparisons with:

```sh
UMF_SELECTION_ADDON=/path/to/fresh/umf_core_node.node \
  node scripts/rust-migration/r8/selection-callback-node.mjs
UMF_SELECTION_ADDON=/path/to/fresh/umf_core_node.node \
  bun scripts/rust-migration/r8/selection-callback-node.mjs
bun scripts/rust-migration/r8/selection-callback-browser.mjs \
  docs/helix/04-build/evidence/rust-migration/r8-selection-spread-boundary/chromium.json
```

Receipt summaries and addon identity are in `node.json` and `bun.json`.
