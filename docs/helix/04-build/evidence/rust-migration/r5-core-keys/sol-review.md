---
ddx:
  id: umf.evidence.rust-migration.r5-core-keys.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-keys
      kind: references
---

# Independent Sol review: opt-in Core Keys binding

I reviewed the five tagged wire dispatch arms, the Node and WASM facades,
their types, and the frozen predecessor comparisons at the source pins in
[`README.md`](README.md). The authoring Luna agent did not perform this review.
The binding passes the request fields directly to the Rust operation and does
not independently interpret a Key or receipt. The Rust operation retains
unknown qualifier values and raw UTF-16 diagnostics, checks receipt shape
before recomputation, and charges existing Key subtree copies to the operation
Context. Earlier review defects in request validation order and unmetered copy
work were repaired before this acceptance.

I independently ran the core tests (6/6), the wire tests (2/2, including all
16 frozen complete-envelope cases and resource/cancellation controls), and the
two Node/WASM facade tests (2/2). I inspected the source-pinned clean Node
installed replay: 17 cases passed, and actual Rust receipts passed Draft
2020-12 validation while a forged version failed. No remaining P1/P2 finding
appears in this bounded opt-in binding at the reviewed pins.

The installed replay compares JSON data after normalizing decoded
null-prototype objects; it does not prove JavaScript prototype identity. The
WASM facade has source-level routing evidence but no real browser runtime
replay at this checkpoint. Installed Bun, Python exposure, full source-package
default routing, and R8 retirement remain open. Subsequent edits to the shared
wire require a fresh source-cohort check before release qualification.
