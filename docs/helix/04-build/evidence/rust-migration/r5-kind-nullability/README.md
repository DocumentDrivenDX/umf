---
ddx:
  id: umf.evidence.rust-migration.r5-kind-nullability
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

# R5 core kind and nullability operation evidence

This bounded Rust shard ports core Field/Record/Group inspection and explicit
author declarations, plus nullability inspection and explicit field authoring.
The operations preserve complete source and target documents, retain opaque
extension values, validate full result envelopes against their versioned
operation schemas, and replay receipts against current content. They do not
classify native representations and do not establish default binding cutover.

## Frozen parity cohort

`scripts/rust-migration/r5/kind-nullability/freeze.ts` captures the prior
TypeScript operation results in `frozen-typescript.json` from the shared input
in `input.json`. The cohort covers inspect, declare, and verify for both ideals.
It includes known and unspecified kind inspection; known, missing and
inapplicable nullability inspection; and complete declaration receipts. The
Rust integration test compares each entire result `Value`, including source,
target, identity, path, and provenance. A separately frozen refusal cohort
compares full ordered multi-diagnostic source rejection, declaration conflict,
malformed receipts, invalid nested receipt source/target documents, stale
receipts, wrong-role requests and missing identities. Invalid nested documents
return the predecessor's fixed malformed-declaration refusal.

`crates/umf-core/tests/r5_kind_nullability.rs` also verifies declaration replay,
stale document refusal, nullability's field-only rule, raw lone-surrogate label and module/element identity
retention, cancellation propagation, deep-copy resource refusal, wide unknown
property copies, and metered canonical ordering over long-prefix keys. Source
diagnostics use compact ordered JSON matching TypeScript `JSON.stringify`; bad
receipt schemas become fixed malformed-receipt errors while resource and
cancellation failures propagate. Running that test with `UMF_R5_CAPTURE` set
emits actual Rust results. `verify-ajv.ts` checks them using standalone Ajv
Draft 2020-12 against the actual operation schemas and current core schema, then
rejects four mutated nested-document controls, including receipt source/target.
Captured outputs are in
`rust-outputs.json`.

## Reproduction and limits

On the recorded Darwin arm64 environment, Rust 1.90, Bun 1.4.3 and Ajv from the
repository lockfile were used. The focused cargo test passed 6 tests; independent
Ajv accepted all 11 captured Rust envelopes and rejected all four mutated
nested-document controls.
The full core suite subsequently passed with 107 unit tests and all integration
tests after the concurrent cardinality capture example was repaired. That
shared-tree run does not replace this slice's source-bound focused receipt.
Reproduce with:

```sh
bun scripts/rust-migration/r5/kind-nullability/freeze.ts
UMF_R5_CAPTURE="$PWD/scripts/rust-migration/r5/kind-nullability/rust-outputs.json" \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-kind-target \
  cargo test --locked -p umf-core --test r5_kind_nullability
bun scripts/rust-migration/r5/kind-nullability/verify-ajv.ts \
  scripts/rust-migration/r5/kind-nullability/rust-outputs.json
```

This cohort covers the core authoring semantics only. It does not establish
native classification, Node/Bun/browser binding parity, broader fuzz or resource
qualification, or replacement of the TypeScript default API. A separate Sol
final review reproduced all four malformed nested-receipt refusals against
TypeScript, reran six focused Rust tests and the 11-accepted/four-rejected Ajv
cohort, and found no remaining P1/P2 in this bounded core slice. R5 family
retirement and cutover remain open pending the shared binding gates.
