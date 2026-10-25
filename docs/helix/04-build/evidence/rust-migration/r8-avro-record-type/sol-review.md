---
ddx:
  id: umf.evidence.rust-migration.r8-avro-record-type-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: Avro Record Type predecessor

Sol inspected the frozen runner against `classifyAvroRecordType` and
`recoverAvroRecordTypeBundle`. It captures full result objects and exact thrown
name, code and message; it pins the operation, helpers, generated schemas,
case builder and focused test. The matrix spans direct and qualified record
references, recursion, dependencies, union/container refusals and both modes.
Additional controls preserve author conflict, tampering, source/target recovery,
ambiguous same-name dependencies, host Proxy access and an options accessor.
The 100,001-value control establishes the current copy limit only.

Sol independently reran the packet `--check`: 10 classified, 24 blocked and
20 JSON/YAML recovery outputs matched. The focused predecessor test passed 2/2
with 105 assertions; repository typecheck passed after the runner's cast
correction. Packet SHA-256 is
`8727ca247e210d15789b3eed34dd9bda05193253a4d084d3b03a17f202e99038`;
runner SHA-256 is
`91069b204293a7cd7a8c1282a8aafc33a085315c314561ccf05178c5180bbce8`.

The packet is a TypeScript predecessor, not independent Avro behavior or a
Rust result. The chosen Rust interface must retain exact core, kind-operation
and result-schema resources; classify and recover need caller-owned controls,
and recover must recompute the receipt before comparing the current target.
A tagged wire replay cannot qualify raw host getter order or default binding
selection. Rust core/wire, Node/Bun, real Chromium, installed package and
release qualification remain open.

## Rust resolution foundation follow-up

Sol reviewed the opt-in `resolve_candidate` and tagged wire operation after
the predecessor packet. The first record search walked arbitrary JSON objects,
which could mistake a record-shaped annotation for a schema declaration.
The corrected search visits only Avro schema positions: top-level schemas,
record field types, union branches, array items and map values. A focused
impostor-annotation test now returns unresolved, and UTF-16 paths and names
are preserved without lossy conversion. Sol independently reran the focused
Rust core test and offline core-wire check; both passed. The Python sdist
closure test also passed 12/12 after adding the candidate's new unconditional
classification-schema input.

After the candidate extension, Sol independently checked duplicate qualified
dependencies, direct definitions missing a name, and nested declarations under
a dotted parent name. The first returns ambiguous, the second unsupported,
and the third inherits the declared parent namespace. The focused Rust library
test passed 1/1 after these corrections on Rust 1.90.0 offline. Candidate
source SHA-256 at this review is
`ac3e88fe77211d82441d7abb38136b4814ba4f881441646cb1d4d666f9676dff`.

This Rust module only reports a possible direct or qualified record resolution.
It does not compile or enforce the three declared schemas, validate native
Avro behavior, interpret authors or existing UMF ideals, build a target, or
recompute a receipt on recovery. Unqualified names without an explicit
enclosing namespace and several nested-name contexts remain outside the
candidate. Its tagged wire result must not be
counted as either of the two Avro Record Type exports or as packet parity.

## Selected record-field discovery follow-up

The next opt-in dependency resolves the selected record and discovers only its
direct native fields, with each field's derived `avro.fields` identity and
dependency ID. Sol required explicit refusal for invalid UTF-16 record paths
and duplicate metadata keys, plus work charging before path and result
allocation. Those changes were made before independent review. The five
focused Rust 1.90.0 offline tests pass for nested direct records, named
dependencies, Avro error declarations and ambiguous/unresolved/unsupported
refusals. Sol formatted the source and reran 5/5. Its SHA-256 at review is
`23fd88556806f4c544256b1a44b6df4b54d9e5e0d8e6f6e89c3ab72152cba792`.

This discovery result is an input to classification, not a classification
receipt. It does not reconcile Field/Record author provenance, build a target,
or implement recovery. The two Avro Record Type exports remain unmapped and
unretired.

## Declaration-inventory follow-up

The subsequent `avro_record_declarations` module ports the TypeScript
`avroRecords` traversal order as a bounded native-tree inventory: ordered
dependencies first, then root, visiting only schema positions. Sol rejected
an initial wrapper that merely repeated selected-field discovery and required
this substantive inventory instead. Review then required work charging before
path and fullname-derived UTF-16 copies. The final source is formatted and
the three focused Rust 1.90.0 locked/offline tests independently pass,
including nested records, array/union positions and annotation exclusion.
Source SHA-256 at review is
`7b6857d31a7d7292be2f287f0e3d24989f2d61db33188abbc8faa7255cb666e7`.

The inventory retains unknown native subtree content but does not classify
the declared Record or selected Record Type, verify authors, construct a UMF
target or recover a bundle. It adds no accepted mapping for the two public
Avro Record Type exports.

## Record classifier and recovery composition review

Sol compared the new opt-in `classify_avro_record` with the TypeScript
`classifyAvroRecord` predecessor and required the requested-module collision
path to continue author verification and field classification. The corrected
blocked receipt retains each direct-field mapping, the record mapping and all
conflict diagnostics. The stale-author reason retains its underlying error
code. Sol also moved untrusted dependency, field-reference and record-name
copy charges before allocation and formatted the source. The recovery module
validates the exact result schema, recomputes classification from retained
source/request, compares the complete receipt and current target, then returns
the original root/dependency texts; Sol moved its final dependency copy charge
ahead of allocation.

An independent Rust 1.90.0 locked/offline `cargo test -p umf-core --lib record_`
run passed 27/27 tests across the adjacent Record foundations, including the
three classifier and three recovery cases. The classifier module SHA-256 is
`e3eec30265d73edda4f5e38df11cebebb68755979380f2c56bb38994ee06cd4b`;
recovery is
`697d2b0bbbc56842e2f1f3aa51554611e4fc2a67e38f247a16f748a41a0e24b1`.
`git diff --check` passed. This accepts bounded core composition evidence,
not full TypeScript receipt or native Avro parser parity. Record Type
classification/recovery, Node/Bun and Chromium routes, installed package
replay and default retirement remain open.

## Direct Record Type classifier and recovery review

The subsequent opt-in Rust classifier composes retained native Record
resolution, the Record classifier and selected Field assertions. Sol's first
independent run found that the target lacked the Field kind promised by its
mapping. The correction sets that kind, refuses an existing unverified kind,
and validates the resulting target with the Engine and Avro registry. Sol
also corrected Record Type provenance: a root Field can reference a Record
declared in a dependency, so the Field and Record Type mappings carry the
Field's dependency identity, while the Record mapping retains the
declaration's identity. The Record Type native path ends in `/type`. Untrusted
text and mapping copies are charged to the caller's Context before copying.

Recovery validates the complete classified schema, recomputes the receipt,
compares the current target, and returns the retained root and dependency
source text. Rust 1.90.0 locked/offline `cargo test -p umf-core --lib
record_type` passed 23/23 across the adjacent Avro and Parquet Type modules.
The no-default-features core check, core-wire check, rustfmt check and
`git diff --check` also passed. Reviewed source SHA-256 values are classifier
`4a978116caf83226508fb81b9a00e45925692daf4697cbc73eb337b646470fda`
and recovery
`38758cdbe4776e451d88a5f56f8af3784105a43a96ca4c1092d1a4398524efed`.

The frozen TypeScript packet was regenerated after only the generated core
schema source pin changed. Its 10 classified, 24 blocked and 20 recovery
outcomes are byte-for-byte unchanged; `--check` passes. Packet SHA-256 is
`4e3d13bd56d9f9697e4891288e69d3a7508c9f7b714b76ef347959d4b97719bb`.
The Rust candidate deliberately refuses all nonempty author lists and does
not claim full receipt parity, native-oracle parity, raw host semantics,
Node/Bun or Chromium binding, installed route, or default retirement.

## Selected-author and tagged-binding follow-up — 2026-10-25

The later classifier verifies current selected-Field and direct Record-member
author receipts against the retained document before using their assertions.
Sol reviewed the source path that carries selected author conflicts into an
ordered blocked receipt, required metered copies of the residual and mapping
fragments, and required work charging before new ideal/native path allocation.
The corrected classifier retains exact frozen outcomes for valid selected
authors, conflicting and duplicate selected authors, and stale or forged
receipts. Its final source SHA-256 is
`bfcbd20c454a584c8eae05fe5e30dd78c277e17b42ad96541bbea226e60c40f7`.

Sol independently ran the final Rust 1.90.0 locked/offline `record_type`
library filter: 28/28 passed, including the selected-author cases. The
versioned `umf.record-type-binding/1.0.0` core-wire filter passed 4/4 against
the same generated-source cohort; it validates exact envelope members,
rejects duplicate or unknown fields, retains caller controls, and returns
tagged classified receipts or recovered source. The TypeScript predecessor
passed 4/4 focused tests with 176 assertions and its packet `--check` retained
10 classified, 24 blocked and 20 recovered outcomes. The final packet SHA-256
is `335537275bb992cbae9ecc0130a0df9510d6106431a25eeccd2de37b38bdc0bc`.

The independent Apache Avro 1.12.0 and fastavro 1.12.2
[oracle](avro-native-oracle.json) agrees on 15/15 selected strict native
positions. It grounds native type, fullname and member-order facts; the
TypeScript packet supplies request selection and status labels. It does not
prove Rust target or receipt equivalence. The current Rust scope still omits
unrelated current-matching author receipts, generic blocked Record-classifier
mapping composition, unions/containers and raw host boundaries. The tagged
binding is opt-in; no default export or installed release is qualified.

## Final-source Node and browser binding review — 2026-10-25

Sol inspected the [tagged-wire host receipt](wire-binding.md) against the
frozen source and predecessor hashes, then independently checked the fresh
Node addon, release WASM, generated wasm-bindgen module and browser harness
SHA-256 values. A direct Node 26.12.1 public-facade replay passed Avro and
Parquet classify/recover, exact Parquet byte recovery, wrong-profile and
malformed `REQUEST`, and host-control `TEST_BUDGET`. Sol independently ran the
no-listener Playwright harness in real Chromium against the generated WASM:
the public facade returned profile `umf.record-type-binding/1.0.0`, classified
both selected cases, completed both recoveries, and preserved `REQUEST` and
`TEST_BUDGET` refusals. The agent's final Bun native-addon and focused WASM
facade suites passed 4/4 each.

The independent final-source no-default-features checks passed for `umf-core`
and `umf-core-wire`; the Rust boundary gate passed with zero V8 debt and its
negative controls, and Python sdist/artifact-custody tests passed 16/16.
This review finds no open P1/P2 in the stated opt-in tagged-wire subset. It
does not qualify raw JavaScript getter/proxy ordering, the full predecessor
receipt matrix, installed package defaults, or a release.
