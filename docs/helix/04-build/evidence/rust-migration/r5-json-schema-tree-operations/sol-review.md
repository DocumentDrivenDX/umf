---
ddx:
  id: umf.evidence.rust-migration.r5-json-schema-tree-operations.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-json-schema-tree-operations
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# Independent Sol review: bounded JSON Schema tree edit packet

I independently reran `cargo test --offline -p umf-core --test
r5_json_schema_edit` against the moving worktree: 7/7 passed. I inspected the
expanded validator profile in `json_schema_inspect.rs` at SHA-256
`089d5b5a27d5605a75f7e960cf6f9e172625112ec900fefd38dbbd07a2dae04a`
and verified the frozen 22-case predecessor packet hash
`7fa939527796db5b0c541378fa7c877c413d53ed4c88db8a24945e9b08dc8a57`.
The Node and Bun installed replay receipts each report 22 exact matches, and
the corrected Chromium receipt at SHA-256
`24a54047d7b13b826eb5f169400c17f9fd0a0abb69240bd7c341d90fa29cc22b`
reports 22 matches from the fresh WASM package.

The first Chromium receipt lost an own `__proto__` property when Playwright
serialized the in-page result object, despite a passing in-page comparison. I
compared that receipt with the frozen predecessor and required a repair. The
new harness, SHA-256
`66dcc746ec3d6b738b55bec1163ef707b0abc216bfa5db803ee7edef3e821b2a`,
transports JSON text and asserts the own property and exact case equality in
Chromium. I independently read its corrected receipt: the property is present
and all three explicit retention checks are true. The historical three-case
qualified edit packet still expects a `minimum` refusal; it is marked as a
superseded source cohort in the evidence and cannot be used for current-source
parity.

This accepts the bounded opt-in 22-case tree operation packet. It does not
qualify complete Draft 2020-12 validation, default routing, or R8 retirement.

The later `parseNativeJson` raw-host supplement is a **boundary exclusion**, not
a wider parity claim. Sol independently checked its six Bun TypeScript cases
against the current predecessor source, then reran the core parser tests
(11/11), focused tagged-wire refusal/control tests (2/2), and Node/WASM
wrapper shape tests (15/15, 43 assertions). The supplemental packet hash is
`1b10a80b22782dcccb19cb392b37162fd35031d5d39753f4dcd07ff67d259355`.
Direct TypeScript calls with `null`, non-string primitives, arrays, a boxed
String and a plain object do not all match the tagged Rust wire's string-only
admission and errors. This leaves the opt-in claim limited to admitted string
inputs; a default-root cutover needs a separate raw-host compatibility decision
and a fresh installed cohort.
