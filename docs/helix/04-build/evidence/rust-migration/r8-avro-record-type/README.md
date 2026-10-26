---
ddx:
  id: umf.evidence.rust-migration.r8-avro-record-type
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-ideals-next-wave
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-document-core
      kind: references
    - id: umf.evidence.rust-migration.r5-avro-full-predecessor
      kind: references
---

# R8 Avro Record Type TypeScript predecessor packet

This packet freezes the current TypeScript outcomes for `classifyAvroRecordType`
and `recoverAvroRecordTypeBundle`. It is a bounded predecessor for a possible
opt-in Rust candidate. It does not implement or map the operation, select a host
route, or change the R8 gap inventory.

The full JSON results are in
[`typescript-predecessor.json`](typescript-predecessor.json). The runner pins
the operation, Avro record/field helpers, serialization and copy helpers, schemas,
case builder and existing predecessor test. The fixture cases are inline in the
pinned case-builder files; no separate fixture file is consumed by this packet.
The packet records the Bun runtime, per-source SHA-256 values, every matrix result,
full success and blocked receipts, exact thrown name/message/code, and recovery
values after both JSON and YAML receipt round trips.

The existing authored corpus supplies direct record and error definitions,
qualified named references, recursive links, nested/container and union shapes,
and distinct qualified dependencies. Both `strict` and `report` outcomes are
captured for every field. The additional same-name dependency case uses an
unqualified `Customer` reference with `sales.Customer` and `support.Customer`
dependencies; both modes retain the source and block classification. Counts are
10 classified, 24 blocked and 20 successful bundle recoveries.

Controls retain the complete outputs for valid and conflicting author receipts,
duplicate and unrelated author receipts, forged provenance, existing scalar and
record-type assertions, missing dependency refusal, changed source/receipt/target
recovery attempts, and a 100,001-value input that crosses the core copy limit.
The source Proxy trace and an options accessor control retain the observed host
trap/error order and show whether a getter ran. These observations describe this
TypeScript reference call only; no Node or browser public wrapper is exercised.

Reproduce from the repository root:

```sh
bun scripts/rust-migration/avro-record-type-predecessor.ts
bun scripts/rust-migration/avro-record-type-predecessor.ts --check
bun test tests/core-ideals/avro-record-type.test.ts
```

The capture command writes only `typescript-predecessor.json`. `--check` compares
the complete newly computed object, including source pins and outputs, against
that packet and exits nonzero on drift. The frozen check passed. The focused
predecessor tests passed 2/2 with 105 assertions under Bun 1.4.3.

This evidence is not an independent Avro native-oracle comparison. It does not
qualify Apache Avro behavior, a Rust implementation, wire semantics, Node/WASM
bindings, real-browser execution, full resource/deadline/cancellation parity,
default root selection, installed SDK behavior or release readiness. The resource
control covers the existing 100,000-value copy limit only. The R5 Avro document
and full-adapter records remain separate evidence for their explicitly scoped
operations.

Runner SHA-256: `91069b204293a7cd7a8c1282a8aafc33a085315c314561ccf05178c5180bbce8`.
Initial packet SHA-256: `8727ca247e210d15789b3eed34dd9bda05193253a4d084d3b03a17f202e99038`.
The refreshed packet SHA-256 is
`4e3d13bd56d9f9697e4891288e69d3a7508c9f7b714b76ef347959d4b97719bb`;
only the generated core-schema source pin changed, with all outcomes unchanged.

## Rust candidate foundation (2026-10-25)

The opt-in Rust slice adds `umf_core::avro_record_type_candidate::resolve_candidate`
and the tagged differential-test operation
`avro.recordType.resolveCandidate` in `umf-core-wire`. The core accepts an
already imported `NativeJsonTree`, caller-ordered dependencies, field identity,
and caller-owned `Context`; it uses existing Avro field derivation and performs
no host-resource access. It resolves direct `record`/`error` definitions and
qualified named references, preserves dependency identity, and returns explicit
ambiguous/unresolved results. For unqualified names it inherits the enclosing
record namespace and resolves only the resulting exact fullname. Direct
resolutions now include their fullname. Declaration discovery follows Avro schema
positions only: top-level schemas, record field types, union branches, array
items and map values. Annotation and extension objects are not searched.
Unions and containers are reported as unsupported.
The wire operation is a test adapter over tagged trees; it says nothing about
raw JavaScript getter/proxy ordering.

This is a reusable resolution foundation, not an implementation of either
`classifyAvroRecordType` or `recoverAvroRecordTypeBundle`. In particular, it
does not validate author receipts, reconcile Field/Record ideals, construct a
UMF target, recompute classification during recovery, compare the current target,
or emit the predecessor's classification receipts. It therefore establishes no
predecessor outcome parity. Author conflicts, existing-ideal conflicts and
recovery remain open.

Verification on Rust 1.90.0, offline, with
`CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target`:

```sh
cargo check --locked --offline -p umf-core-wire
cargo test --locked --offline -p umf-core avro_record_type_candidate
cargo test --locked --offline -p umf-core-wire --test r5_avro_candidate_wire tagged_record_type_resolution_preserves_namespace_and_dependency_identity
```

The focused core test passes direct definition and qualified/unqualified
dependency resolution, reports a union and a nameless direct record as
unsupported, identifies duplicate qualified dependencies as ambiguous,
inherits namespace from a dotted parent record name, and confirms that a
record-shaped annotation does not resolve a named reference. The tagged wire
test verifies inherited `sales` namespace resolution and `customer-schema`
identity. The full core suite and predecessor packet replay were not run.
Source pins for this follow-up are deliberately omitted while shared Rust files
are changing in parallel.

### Selected-record field discovery foundation

The opt-in core module `avro_record_fields::discover_selected_record_fields`
builds on that resolver to return the resolved record fullname, native JSON
Pointer, dependency artifact ID, and only its direct fields. Each returned field
is matched to the `avro.fields` metadata entry by exact native path and
dependency ID, retaining the derived UMF element identity and complete copied
native field. Nested record fields are excluded from the parent result.
Ambiguous, unresolved, unsupported, malformed, or metadata-inconsistent shapes
return explicit operation errors. Traversal, metadata indexing, paths, and
result allocation are charged to the caller-owned `Context`.

Rust 1.90.0 offline focused verification passed all five module tests:
direct discovery with nested-field exclusion, error declaration discovery,
qualified named dependency discovery with dependency identity retention,
ambiguous/unresolved/union refusals, and malformed record refusal. Command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target \
cargo test --locked --offline -p umf-core avro_record_fields::tests
```

This is field-discovery infrastructure only. It does not construct a
classification receipt, reconcile ideals, recover bundles, or establish
TypeScript predecessor parity.

### Rust declaration-inventory foundation (2026-10-25)

`umf_core::avro_record_declarations::inventory_record_declarations` is an
opt-in, bounded equivalent of the TypeScript `avroRecords` declaration walk.
It visits Avro schema positions in caller-ordered dependencies and then the
root, preserving each declaration's source path, dependency ID, effective
namespace, local name, fullname and copied native subtree. It follows nested
record/error declarations, union branches, array items, map values and
object-valued `type` schemas. It does not follow named references or search
arbitrary annotations. Traversal is charged to caller-owned `Context` and
retained native representation extras stay attached to the selected subtree.

This is one required dependency of the R8 classifier, not the classifier itself.
The TypeScript predecessor also classifies direct Field membership, validates
author receipts, reconciles existing scalar/record-type claims, constructs and
validates a UMF target, applies strict/report residual policy, and emits a
classification receipt. Rust does not yet implement those steps or bundle
recovery. No predecessor parity or classification support is claimed. The next
step is to compose this inventory with `avro_field_classifier`, generic
`core_kind` author verification, and safe target construction; if record-type
author receipts are accepted, verify them through `core_record_type`.

Focused tests on Rust 1.90.0 offline:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target \
cargo test --locked --offline -p umf-core avro_record_declarations::tests
```

The tests cover ordered root/dependency inventories, nested declarations,
union/array traversal, dependency identity, namespace/name derivation,
native subtree retention, named-reference non-traversal and missing-name
handling. All three focused tests pass on Rust 1.90.0 offline. They do not
qualify classification behavior.

### Opt-in record/error classifier

`umf_core::avro_record_classifier::classify_avro_record(source, request, ctx)`
now composes the declaration inventory, `avro.fields` derivation, the existing
field-membership classifier, core-kind author verification and current-document
validation. Its request and result are checked against
`spec/core/avro-record-classification.schema.json`. The result retains a copied
source, field and record mappings, residuals/diagnostics, and emits a complete
target only when every selected field can be classified. Root and ordered
dependency archives are compared before selection. A module collision is
reported while field mappings and author checks still run, matching the
predecessor's accumulate-then-report behavior. Field collection follows the
predecessor's exact `(dependencyId, record fullname)` predicate, including its
behavior for duplicate fullnames.

Focused verification on Rust 1.90.0, locked/offline:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-avro-record-classifier-target \
cargo test --locked --offline -p umf-core avro_record_classifier::tests
```

The three passing unit tests cover ordered direct and nested field membership,
invalid selection and collision receipt shape, and a valid authored `record`
claim that conflicts with native field membership. This is focused Rust unit
evidence only. The frozen TypeScript predecessor packet has not been replayed
against this implementation; strict/report matrix parity, full predecessor
controls, recovery, host/wire bindings, Bun/Node/browser execution and an
independent Avro parser comparison remain unqualified. Scalar/logical-type,
presence and value-domain equivalence remain outside this binding's claim.

### Opt-in Rust record-bundle recovery (2026-10-25)

`umf_core::avro_record_recovery::recover_avro_record_bundle` accepts a
classification receipt and current document with caller-owned `Context`. It
validates the exact `classify-avro-record` receipt schema, requires classified
status, reruns `avro_record_classifier::classify_avro_record` from the retained
source and request, compares the complete receipt and current document using
object-order-insensitive structural equality, and emits the exact root and
dependency source strings from the request. Copy, validation, recomputation,
comparison and output work remain subject to the supplied context limits and
controls. The module is gated by `embedded-adapters`.

Focused recovery tests pass on Rust 1.90.0 offline:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target \
cargo test --locked --offline -p umf-core avro_record_recovery::tests
```

The three tests cover exact root/dependency text preservation, tampered receipt
and stale current-model rejection, blocked-receipt refusal, and caller limit
enforcement. This is focused core evidence composed with the opt-in classifier;
it does not establish TypeScript predecessor parity, wrapper behavior, browser
execution, native Avro oracle equivalence, a default route, or completion of
the record-type port. Broader recovery controls and the full predecessor matrix
remain open.

### Opt-in Rust direct record-type bundle recovery

`umf_core::avro_record_type_recovery::recover_avro_record_type_bundle` accepts
a direct record-type classification receipt and the current UMF document with
caller-owned `Context`. It validates the complete
`avro-record-type-classification` schema, recomputes classification from the
retained source and request, compares the full receipt and current target using
object-order-insensitive structural equality, and returns the exact root and
ordered dependency source strings retained in the request. Receipt/current
copies, schema validation, recomputation, comparison, and output allocation are
charged to the supplied context. The module is gated by `embedded-adapters`.

Focused Rust unit evidence covers exact source recovery, forged receipt and
stale target rejection, blocked receipt refusal, and context limits. It does not
establish predecessor matrix parity, host or wire binding behavior, browser
execution, native Avro oracle equivalence, default routing, or completion of
the record-type port. Verification on Rust 1.90.0, locked/offline:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-avro-record-type-recovery-target \
cargo test --locked --offline -p umf-core --features embedded-adapters \
  avro_record_type_recovery::tests --lib
```

Both focused recovery tests pass against the current opt-in classifier.

### Opt-in Rust `classifyAvroRecordType` composition (2026-10-25)

`umf_core::avro_record_type_classifier::classify_avro_record_type(source,
request, ctx)` adds a direct record/error subset over the existing retained
Avro Record classifier and schema-position resolver. It verifies the root and
ordered dependency captures against retained archives, classifies the selected
record and its members, appends the selected Field's `record-type` reference,
and checks the exact Avro Record Type result and request schemas. The complete
source, request, native field fragment, and classification mappings remain in
the receipt. Ambiguous/unresolved references, unions/containers, existing
kind/scalar/record-type assertions remain refused with a blocked receipt so
their evidence stays inspectable. A verified selected-Field author receipt and
verified direct Record-member Field receipts are admitted. The selected Field
mapping precedes the composed Record mappings and final Record Type mapping;
dependency identity is retained on native type references. The copied target
is revalidated through the core Engine and Avro package Registry after its
record-type reference is added. Frozen conflicting and duplicate selected
author controls match ordered mapping kinds, paths and outcomes, residuals, and
diagnostics; stale and forged receipts preserve the predecessor's
`CORE_KIND_STALE` and `CORE_KIND_RECEIPT` errors. This is scoped author evidence,
not full matrix parity: unrelated current-matching authors, blocked Record
classifier results, unions/containers, and other packet cases remain outside
the exact author-receipt comparison.

Focused Rust 1.90.0 offline unit evidence covers a direct nested record, a
qualified named dependency, a blocked union, valid selected-Field and direct
Record-member authors, exact recovery for the selected author, frozen
conflicting/duplicate result details, stale/forged author errors, refusal to
replace an existing Field assertion, and caller resource-limit enforcement.
All nine focused tests pass with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target \
cargo test --locked --offline -p umf-core \
  avro_record_type_classifier::tests --lib
```

The opt-in tagged wire route is qualified separately; this does not establish
raw Node/Bun/WASM/browser wrapper parity or default routing. The evidence also
does not establish the full frozen TypeScript predecessor matrix, broader
author reconciliation, or exact parity for blocked Record
classifier results and unsupported unions/containers. Recovery is a separate
composition and does not expand this classifier's support claims.

The separate [native oracle](avro-native-oracle.json) parses 15 selected strict
cases with Apache Avro 1.12.0 and fastavro 1.12.2. Its native type and
member-order observations agree with the predecessor's selected-case status;
the TypeScript packet supplies the requests and labels. This does not prove
Rust target or receipt parity, raw host behavior, or general Avro support.

### R8 unresolved-type receipt and recovery follow-up

The bounded Rust classifier now follows the TypeScript predecessor's generic
unresolved-type branch for ambiguous, unresolved and unsupported selected
native types. It keeps selected Field mappings and residuals, the native type
fragment (including a missing type as `null`), existing scalar or record-type
assertions, and duplicate or unrelated author receipts in the blocked result.
The result remains schema-validated and recoverable only when classified.

The recaptured [TypeScript predecessor packet](typescript-predecessor.json) is
SHA-256
`c032bb1886460c45659ec9e73ab2e3ca73c1a2ab5681c17d96a9e37644737fa9`.
The Rust classifier source is SHA-256
`ac8408c0ec5ba9c922ab3d866b5551a1a996c01f555609ec47c382baec8ef667`.
Its selected full-result comparison passes three strict cases: a nested
scalar/union member, a dependency-backed named record, and a recursive direct
record. The two classified cases also match frozen exact JSON recovery from
the original receipts. The separate 30-case strict/report matrix passes exact
ordered mapping arrays; that test took 319.20 seconds in the established
temporary Cargo target. The packet's own `--check` passes with 10 classified,
24 blocked and 20 recovered predecessor outcomes. Complete result-body parity
for all 30 matrix cases, the broader author/control matrix, Node/Bun/WASM
hosts, and default routing remain open.
