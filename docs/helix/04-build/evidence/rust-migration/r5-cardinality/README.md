---
ddx:
  id: umf.evidence.rust-migration.r5-cardinality
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R5 core cardinality operations

This bounded R5 slice implements core cardinality inspection and explicit
authoring in Rust for current core `0.10.0`, governed by
[CONTRACT-001](../../../../02-design/contracts/CONTRACT-001-core-envelope.md),
[CONTRACT-040](../../../../02-design/contracts/CONTRACT-040-core-ideals.md),
and operation schemas `cardinality-operation-v6` (inspection `6.0.0`) and
`cardinality-operation-v4` (declaration `4.0.0`). It does not infer physical
or native cardinality. Source, target, request, operation result and retained
receipt validation use the checked-in schemas; JSON copies and verifier
canonicalization are admitted through the invocation `Context`.

The retained TypeScript capture and native Rust harness cover complete
inspection, declaration, verification, unknown-overwrite refusal, and missing
identity refusal envelopes. The oracle compares successful and refusal
envelopes as complete JSON values, then validates the three actual Rust
success envelopes with independent Ajv 8 Draft 2020-12 against the operation
schemas. The invalid-request refusal is also compared as the full ordered Ajv
diagnostic array, including its empty outer path. A lone-surrogate unknown
cardinality (`\ud800`) is compared losslessly through the UTF-16 value carrier.
The declaration differential also includes a lone-surrogate itemType element
ID, proving the request parser accepts the nonempty UTF-16 identifier and the
authored receipt retains it. Inspection also selects module and element IDs
containing lone surrogates through the UTF-16 Identity carrier. Verification
fixtures with malformed archived source or target confirm that the operation
schema checks both referenced core documents before recomputation and returns
the retained TypeScript receipt refusal.
Module tests cover multi-diagnostic source refusal, target conflict paths,
tampered and stale receipts, archived declaration error propagation,
cancellation, work-meter refusal, oversized copies, canonical depth, long
common-prefix key sorting and copy isolation. Run the combined capture, parity
comparison and Ajv oracle with:

```sh
node docs/helix/04-build/evidence/rust-migration/r5-cardinality/schema-oracle.mjs
```

The TypeScript vectors can be recaptured to stdout with:

```sh
bun run docs/helix/04-build/evidence/rust-migration/r5-cardinality/capture-vectors.ts
```

Pinned Rust 1.90.0 focused and crate-wide tests are recorded with the current
source tree. A separate Sol final review reproduced the corrected lone-surrogate
itemType case, passed the complete TypeScript/Rust differential and independent
Ajv oracle, and ran 12 focused Rust tests. It found no P1/P2 issue in this
bounded Rust core slice. The TypeScript API remains the default pending Node/Bun
and real-browser wrapper parity. This slice establishes no native equivalence
or adapter support.

A later cross-slice inspection reopened that bounded review. Retained receipt
`source`/`target` now validate against the complete current core schema, and
module/element identities use raw UTF-16. The expanded differential matches
TypeScript's malformed-receipt refusals and lone-surrogate identity results;
independent Ajv rejects both malformed receipts. A second Sol final review
found no P1/P2 and passed 12 focused tests plus the full `umf-core` suite,
including 107 unit tests and all integration tests. This approval remains
limited to the Rust core slice; bindings and default cutover are open.
