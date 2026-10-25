---
ddx:
  id: umf.evidence.rust-migration.r5-javascript-numeric.sol-retained-stage-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-javascript-numeric
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# Independent Sol review: retained numeric stage

Sol rejected the earlier caller-forgeable staged wire request. The replacement
owns scalar literals and outputs inside an opaque, single-use Rust stage and
retains the resource Engine. Sol then identified a predecessor order mismatch:
`numericToNumberLossless` validates carrier grammar before context, but checks
lossless binary64 conversion after Field validation. The candidate now stages
that sequence; crossed malformed-carrier/context and lossy-value/invalid-Field
controls are included.

On 2026-10-24 Sol independently reran the frozen Node stage harness, the Bun
27-vector Python Decimal/Fraction/struct oracle and TypeScript differential,
and the Edge 156.0.4314.42 WASM browser harness from the isolated packages.
All passed, including direct forged-wire refusal, one-shot consumption,
malformed-token precedence, invalid-Field before lossy conversion, resource
setup separation, cumulative context work and per-call reset. Sol recomputed
the package hashes: native addon
`7fe79a33055bee33a8105a654715f0cc06e5694101dd03b825efb002ac88329d`,
WASM binary
`14a10507acdbaa1289f70d5c8b309b1baa089f622daf6824d92f4919d2c6e8a9`,
and bindgen JavaScript
`42d466c02f653f0d5cae17fef70790ed1cf51853bdff3e5c92f2f84bc0d4826`.
Sol found stale artifact hashes and work counts in the first README revision;
the agent reconciled it with the immutable JSON receipts before this review.

This accepts the five-operation **opt-in** Node/Bun/WASM binding subset for the
captured source and artifacts. The browser replay uses an isolated index that
selects the production numeric factory, not a clean installed SDK root.
Python parity, default routing, source-frozen archive qualification, broader
host behavior and R8 TypeScript retirement remain open.
