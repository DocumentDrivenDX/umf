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
comparison with three completion cases: a callback returning `undefined`, a
non-callable `Symbol.iterator`, and a throwing `Symbol.iterator` getter whose
thrown object has an observable `toString`. Rust performs the spread-stage
decisions under the same operation `Context`; the Node and WASM bindings each
create one `Context` per route invocation. The direct TypeScript predecessor
and candidate are run in the same host, and both the final refusal and callback
event trace must match exactly.

Node 26.12.1 and Bun 1.4.3 each pass all 18 cases with 18/18 exact outcome and
event-trace matches. The fresh Rust 1.90.0 Node addon is shared by both runs.
The Bun binding suite additionally passes 14/14 focused tests, including the
full direct Selection trace for the throwing getter, exactly-once
`String(error)` conversion, final `CORE_SELECTION_SOURCE`, and source/refusal
diagnostic order. Rust diagnostic materialization unit tests pass 6/6 and the
frozen R5 Selection suite passes 10/10. `wasm32-unknown-unknown` compiles.

Real Chromium 153.0.8010.12 passes the same 18 cases with 18/18 exact outcomes
and host traces, zero page errors, and a fresh WASM artifact. Its receipt is
`chromium.json`; the WASM SHA-256 is
`9e3799b2f8393f5aa674f117f7b44189c937733dbd6111b4e352116855695eec`.

This evidence is limited to the three added callback completion cases and the
preexisting 15-case callback suite. It does not qualify iterator `next`,
`done`/`value` access, iterator closing, all native spread TypeErrors, opaque
callback diagnostic materialization, `kindRuntime`, installed packages,
default route selection, or release readiness. The V4 public route is
unchanged.

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
