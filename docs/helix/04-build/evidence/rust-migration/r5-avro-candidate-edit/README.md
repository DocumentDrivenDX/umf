---
ddx:
  id: umf.evidence.rust-migration.r5-avro-candidate-edit
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: verifies
    - id: CONTRACT-001
      kind: informed_by
---

# R5 Rust Avro candidate edit

This packet records the bounded Rust core candidate-edit profile
`umf-r5-avro-candidate/0.1.0`. It qualifies candidate construction and the
separation between UMF/payload admission and the bounded native Avro structural
inspector. It does not qualify wire, CLI, Node, Python, WASM, browser, default
adapter activation, Avro datum behavior, compatibility, or migration.

The normative report and refusal order are defined by
[CONTRACT-007](../../../../02-design/contracts/CONTRACT-007-avro.md#rust-core-candidate-profile--umf-r5-avro-candidate010)
and [`rust-candidate-edit-report.schema.json`](../../../../../../spec/extensions/avro/rust-candidate-edit-report.schema.json).
The report intentionally has no predecessor `validation` member: successful
admission and source/candidate native inspections are separate results. Native
inspection errors remain visible in the report when candidate admission
succeeds. This is a documented difference from TypeScript
`proposeAvroNodeEdit`, whose `validation` field carries the TypeScript validator
result.

## Current checkpoint

The focused target
`cargo test -p umf-core --test r5_avro_candidate_edit -j 2 -- --nocapture`
passed all nine tests in 56.59 seconds with `CARGO_TARGET_DIR` set to the
coordinated isolated R6 target and `CARGO_INCREMENTAL=0`. After Sol review, the
implementation was refined to update only the selected native root in place,
preserving all untouched dependency object ordering. Regressions cover
`root,id` dependency member order on both primary-root and dependency edits,
plus preservation of an explicitly empty `dependencies` member and payload
member order. The focused tests also cover exact tagged-tree comparison, exact
int64 tokens, separate inspector errors, dependency representation refusal,
refusal order, and field metadata retention.
Core-only candidate construction is the qualified surface for this checkpoint.
No core-wire, CLI, or binding qualification is claimed here.

The test source is [`crates/umf-core/tests/r5_avro_candidate_edit.rs`](../../../../../../crates/umf-core/tests/r5_avro_candidate_edit.rs). It covers report shape, exact int64 tokens, separately reported native-inspector errors, dependency representation refusal, pointer/replacement/dependency refusal order, four primary authored edits, and named fixed-decimal dependency editing. The TypeScript behavior examples and existing native observations remain in [`tests/avro/candidate-edit.test.ts`](../../../../../../tests/avro/candidate-edit.test.ts), [`fixtures/avro/candidate-edits.json`](../../../../../../fixtures/avro/candidate-edits.json), and [`fixtures/avro/candidate-edits-oracle.json`](../../../../../../fixtures/avro/candidate-edits-oracle.json); these files are inputs/evidence from the TypeScript/native profile, not Rust parity results.

## Remaining gates

- Resource-control refusal and independent native-oracle replay for this Rust operation.
- Separate core-wire, CLI, Node, Python, and WASM profile work and qualification.
- Browser execution and any default adapter activation are outside this checkpoint.
