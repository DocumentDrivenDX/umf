---
ddx:
  id: umf.evidence.rust-migration.r5-core-record-type-sol-review
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

# Independent Sol review: Record Type candidate

Sol compared the current Rust candidate with `src/model/record-type.ts`, the
v6 receipt schema and the frozen predecessor packet. The initial Rust version
omitted the predecessor's edited-target document validation and complete v6
receipt-schema validation. Those gates were added before review. The scoped
wire request now accepts the host's exact empty `registry` with five named
resources and refuses extra/missing request or resource fields and a nonempty
registry.

Sol independently reran the predecessor `--check` and the focused offline Rust
wire test: 2/2 passed. The differential covers three complete declaration and
verification pairs, eight exact refusal outcomes, and closed-request controls.
The ninth predecessor refusal is a raw-host getter-order case: tagged JSON
admits both values before dispatch, so that adapter alone cannot prove it.

The tagged adapter compiles its pinned operation schemas on each request; the
focused differential took 82.12 seconds. This first review accepted only the
bounded opt-in core/wire semantic packet, not default selection or retirement.

## Retained production interface and host review

The subsequent retained Rust runtime holds exact five-resource Engine/Registry
and a compiled v6 receipt schema. Its owner-bound stage separates receipt
admission/recomputation from current decoding and comparison. Sol requested
two corrections: seed receipt work and constraint counts into the finish
Context *before* current decode, and reject a direct Rust finish with counters
below the stage totals. Both are now implemented; the runtime unit suite
passes 4/4 and the generic tagged wire suite passes 2/2 in an independent Sol
run (84.71 seconds). The direct interface requires no extension callback.

Sol reviewed the Node facade's private-handle registry, discard/dispose,
64-stage cap and resource lifecycle, and required its opt-in factory to avoid
constructing unrelated Core Key runtimes. The frozen private N-API package
matched source JS bytes; independent Node 26.12.1 and Bun 1.4.3 replays passed
the three v6 declaration/verification pairs and malformed receipt, stage
ownership/reuse, finish failure, and cumulative host-work controls. The
focused Bun suite passed 8/8. The exact source and binary pins are in
[`node-retained.md`](node-retained.md).

The opt-in WASM facade also passed its five focused wrapper tests and Sol's
real Chromium 153.0.8010.12 replay, including no Node globals. Sol reran the
browser test against a combined optimized WASM package after the direct-Rust
finish guard and Record Members runtime landed; the three frozen declaration
and verification pairs, staged verify and controls still pass. The new WASM
binary SHA-256 is `db0895e5d000c34847adef6ea34ab826972930f64be21d024dc463bf521486a3`;
[`wasm-retained.md`](wasm-retained.md) records its scoped source pins. Neither
opt-in host checkpoint qualifies a default package route, extension callbacks,
broader diagnostic strings, installed SDK archives, Python/CLI or native
record-type interpretation.
