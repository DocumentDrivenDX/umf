---
ddx:
  id: TD-040
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: US-040
      kind: informed_by
---

# TD-040: Implement core field ideal

## Scope

Implement US-040 under CONTRACT-040. Architecture is the direct parent; no
separate solution design exists for this core slice. The current envelope only
implements scalar-family metadata. This design is planned, not executed evidence.

## Technical Approach

Implement adapter-derived field, record and group classification. Use checked immutable TypeScript models and trusted local
bindings. A shared projection result retains copied input, provenance, residuals
and complete candidate or block; native codecs retain authority over native data.
Trade-off: consumer access improves while loss reports and native payloads remain
necessary; a core label cannot reduce the native fidelity obligation.

### Field classification decisions

Build a declaration walker distinct from scalar-family lookup. TableSpec columns,
PostgreSQL catalog columns/raw ColumnDef declarations, SQL Server captured columns,
Avro record members and Parquet checked schema nodes supply member roles. Assign
field kind from a supported native declaration even when its scalar type is unknown;
never infer record versus group from the presence of children alone. Use module/element
identity and native source paths, so equal names in two tables cannot merge.

Introduce a classifier result at the adapter boundary, then a shared reconciler
that compares it with authored kind and retained provenance before publishing the
new immutable document. A record-valued member references a separate record
identity. Unsupported union/group roles retain native data and an unknown outcome.
Reject stale paths, incompatible authored kind and scalarType on structured nodes;
leave unclassified legacy elements untouched. Test extraction from both raw DDL
and catalogs because an unresolved declaration is not a resolved storage column.

## Component Changes

- `spec/core/`: add this concept and complete result/provenance/residual schema
  branches after the semantic contract; choose and document the version/profile
  transition before reserving open members (US-040-AC1/10).
- `src/model/`, `src/validation/`: typed authoring, exact facet/reference checks,
  copied access and conflict detection (AC1/2/10); do not rewrite unrelated content.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/`: source-qualified
  classifications retaining native payloads; no derived-authority guessing (AC2/6).
- `src/projections/`: explicit strict/report native bindings, candidate atomicity
  and recoverable residuals (AC3–5).
- `tests/core/field-ideals.test.ts` and five native fixture directories: acceptance and boundary matrix
  (AC1–10). Use Bun host tooling in `scripts/`; portable `src/` cannot import it.

## API/Interface Design

CONTRACT-040 owns the exact ideal semantics and operation/result obligations;
CONTRACT-001 owns existing envelope/copy limits. Implement complete machine-readable
operation/report schemas before exporting new APIs. Every binding declares its
version/subset and exactness obligations; unsupported native syntax blocks safely.
Consumer selection must preserve source identity and source paths, not merge names.

## Data Model Changes

The initial implementation selects a separate experimental envelope `umf: "0.2.0"`
with schema ID `urn:umf:core:0.2.0`. Version `0.1.0` retains its current schema
and interpretation, including opaque `kind` members of any JSON shape. Only
`0.2.0` interprets field/record/group. No automatic upgrade is permitted.
Unknown kind strings are preserved without interpretation; record/group cannot
carry scalarType. Validation reports this envelope as experimental and incomplete
until provenance, explicit migration/rollback and admission evidence are present.
The version choice precedes schema publication; it is not a release or admission.

Add this concept incrementally, retaining author/classification provenance and
native extension data. An absent member on an old model asserts nothing. No
schema file changes are made in this documentation evolution. No database migration
is implicit; native DDL is reviewable output, executed only by isolated test harnesses.

## Integration Points

| Binding | Integration obligation |
| --- | --- |
| TableSpec | Pin model and checked-in schema separately; contextual/runtime discrepancies remain explicit |
| PostgreSQL | Distinguish raw declared DDL from catalog-resolved observations; use pinned native engine |
| SQL Server | Retain alias, enabled/trust/filter and comparator details; use pinned catalog capture/native oracle |
| Avro | Preserve union/default/name-resolution meaning and verify with both existing independent codecs |
| Parquet | Preserve original bytes and embedded Arrow refinements; verify with existing PyArrow/native wire oracles |

The CONTRACT-040 five-system row for field defines required mapping behavior.
Missing or unavailable native engines are evidence gaps, never inferred passes.

## Security and Performance

Treat all model inputs as untrusted; use existing copy limits, exact token checks,
cycle-safe reference traversal and no getters/artifact code/network execution.
A resource limit blocks atomically. Existing limits (depth 128, 100,000 nodes,
4M text) remain in force; this slice makes no throughput promise. Native services
are isolated test dependencies, never browser library dependencies.

## Testing

Implement tests/core/field-ideals.test.ts for authoring, conflicts, unknowns and both recovery directions.
Run the five binding matrices with native acceptance/value counterexamples and
Chromium parity, both JSON/YAML recoveries, no external browser requests and no
Node/Bun globals. AC7 retains fixtures/sqlserver/indexes-oracle.json,
fixtures/sqlserver/index-projection-oracle.json and
fixtures/avro/tablespec-oracle.json as permanent shared regression anchors;
regenerate with their existing scripts when affected, do not equate old artifacts
with evidence that the new ideal works. Field selection must distinguish a scalar member from a record definition and preserve unknown native types without inventing scalar families.

AC8 requires all five qualified bindings. AC9 has separate records for >=2 ideal
admission, five-system delivery and (only if pursued) native-equivalence graduation.

## Migration & Rollback

Additive does not mean collision-free: check old unknown members before reserving
names, record a version/profile transition, preserve originals and test inverse
migration. Disable new classification/projection without dropping author data.
Rollback restores the old envelope/archive plus explicit retained new assertions;
it must not fabricate those assertions in an older interpreter. Native removal
is not part of this slice and requires its own FR-28 migration/rollback decision.

## Implementation Sequence

1. Confirm CONTRACT-040 surface and document version transition; implement core
   schema/types/validators and AC1/10 before adapter changes.
2. Add five independently scoped up/down bindings with AC2–7 and retained archives.
3. Verify >=2-system admission evidence, then complete all-five AC8/9 gate before
   starting the next concept. Publish failures and residuals, not inferred support.
4. Run Bun tests/typecheck, browser build/Chromium and relevant native oracles;
   update evidence fingerprints and compatibility claims.

## Risks

Field selection must distinguish a scalar member from a record definition and preserve unknown native types without inventing scalar families.
The mitigation is explicit bindings, exactness/refusal and native counterexamples,
not withholding the ideal. Unsupported mappings stay in scope as qualified refusals
and follow-up bindings; report mode must never imply execution enforcement.

## Review Checklist

- [x] All story ACs have implementation/test responsibilities.
- [x] Governing meaning stays in CONTRACT-040; native refinements are retained.
- [ ] Schema/version transition, five bindings and regression evidence implemented.

## Initial envelope execution evidence

The first implementation slice adds `spec/core/field-document.schema.json` and
version-aware validation. `0.1.0` is unchanged. The initial evidence below predates
the explicit transition API described in the next section.
`0.2.0` accepts explicit field/record/group, preserves unknown kind strings,
rejects structured scalar assertions, and always reports experimental/incomplete
validation. No native adapter emits this version yet.

Bun core regression: 32 tests, 415 assertions, zero failures. Chromium 148 checks
40 version/kind/scalar combinations and 56 JSON/YAML recoveries, with no external
requests or runtime host globals. Typecheck and browser build pass; 176 schemas
and 32 packages pass their audits. Source fingerprints and exact commands are in
[the envelope evidence](../../../../fixtures/validation/core-field-envelope.json);
[browser evidence](../../../../fixtures/validation/core-field-browser.json) records
its scoped results.

At that initial checkpoint the core Field bead remained in progress. Migration/rollback (including
retained new assertions), provenance, operation/result schemas and typed consumer
access were still required before core task completion. Five-system native binding
and admission evidence remain separate queued work.

## Explicit envelope transition

`upgradeFieldEnvelope` now copies a valid 0.1.0 model, archives every element
`kind` member in a path-qualified residual, and emits 0.2.0 without inferred
kinds. Known-looking legacy strings receive the same treatment as arbitrary JSON.
The receipt keeps the full original envelope, including unknown native content.
`field-transition.schema.json` describes upgrade and rollback receipts.

`rollbackFieldEnvelope` checks the receipt against recomputation from its retained
source. It restores the original 0.1.0 model and retains the complete current 0.2.0
model in the rollback receipt's source. Later assertions and native edits therefore
survive separately; rollback does not apply them to an older interpreter. Receipts
are consistency records, not cryptographic authentication. Recovery concerns model
content, not original outer JSON/YAML formatting. Native archives stay unchanged.

Core regression passed 36 tests and 466 assertions. After assertion typing repairs,
the nine Field tests passed 191 assertions; typechecking and browser build pass.
The schema audit passes 177 schemas and 32 packages. Chromium 148 checks 40
validation decisions, 56 serialization recoveries and 40 transition cycles with
edited assertions/native content and inconsistent receipt rejection. No external
requests or host runtime globals occur. See the current
[transition evidence](../../../../fixtures/validation/core-field-transition.json).

Field remains in progress: authored/classified provenance, typed consumer access,
and native projection result schemas are required next, followed by five-system
binding and separate admission evidence. These transition operations do not
establish native equivalence or native projection completeness.

## Typed access and explicit author provenance

`inspectCoreElementKind` now selects by module/element identity and returns known,
unknown, unspecified or legacy meaning with a copied source and ideal path. A
known kind alone does not prove where it came from: lookup reports provenance as
unverified. Native classification cannot be inferred from a label or scalar type.
`kind-operation.schema.json` describes lookup and declaration results.

`declareCoreElementKind` requires 0.2.0, refuses unknown kind replacement and
structured/scalar conflicts, and records explicit author provenance with the
versioned authoring binding. It retains both source and target; nativePath is null
because this operation makes no claim about a native binding. It does not classify
or edit native content. `verifyCoreKindDeclaration` recomputes the declaration and
requires the entire current model to match its target. Any model change, including
native edits or unrelated changes, requires a fresh declaration; stale provenance
never wins by overwrite. These are consistency receipts, not authentication.

Current evidence: 40 core tests / 587 assertions; typecheck, build and audits of
178 schemas / 32 packages pass. Chromium 148 adds 28 typed lookups and 40 authored
receipt verification/rollback cases to the existing envelope matrix. Edited native
content invalidates author receipts in that matrix. See
[kind evidence](../../../../fixtures/validation/core-field-kind.json).

The Field bead remains in progress. Native classification provenance and authored
conflict reconciliation, strict/report projection result/residual schemas and the
five native bindings remain required. No ideal admission or equivalence claim is
made by the authoring API.

## First native classifier and conflict checks

`classifyTableSpecField` supplies the first checked native up-classification for a
single TableSpec column in an explicitly migrated 0.2.0 envelope. The binding is
`umf.tablespec.field` 1.0.0 against pinned source commit
647e8e566ad78b864282ec65c0b0b2237aa63084, table version 1.0. It checks native export
and derived column consistency before classifying membership, independently of
scalar family. Unknown native types remain native; column membership alone does
not prove that the native model accepts that type or determine container semantics.
The native path identifies the captured tree, not a physical split-file location.

Results have a copied source, request/policy, versioned binding, native fragment,
classified provenance, ideal/native paths and exact/unknown outcome. A complete
candidate appears only when reconciliation succeeds. Existing kinds require a
verified author receipt; an incompatible authored kind, stale receipt or unknown
kind produces a blocked result with retained source and residual in both strict
and report modes. Report mode cannot override conflicting meaning. The result
schema is `spec/core/tablespec-field-classification.schema.json`.

`verifyTableSpecFieldClassification` recomputes the classification from its
archived source and rejects edited receipts or any changed current target. This
is a conservative consistency check; native changes require recomputation and
are never reconciled by overwriting authored intent. Existing classified labels
without verified author provenance also block this initial operation; incremental
multi-assertion reconciliation remains follow-up work.

Evidence: core plus initial classifier regression passed 44 tests/644 assertions;
the subsequent classifier verification tests passed 5 tests/60 assertions.
Chromium 148 passes 32 classification cases, 64 exact native-text recoveries,
receipt/staleness checks and two authored conflict blocks. The pinned Python
TableSpec model accepts all 64 original/recovered comparisons and confirms their
column identities. Bun separately tests split sidecar/shadowed-content recovery.
Typecheck/build and audits of 179 schemas/32 packages pass. Commands and source
fingerprints are in [the classifier evidence](../../../../fixtures/validation/field-tablespec-evidence.json).

This is partial up-classification evidence, not TableSpec binding completion.
Table-to-record/group handling, down-projection and ideal-to-native-to-ideal
recovery remain required, along with general reconciliation and the other four
systems. The core Field task and its binding/admission tasks remain unfinished.

## Single-Field TableSpec down-projection

`projectFieldToTableSpec` consumes a verified author declaration plus explicit
native table name, column name, type and strict/report policy. It emits a complete
one-column TableSpec 1.0 schema. The declared kind must be field; record/group
cannot be coerced into a column under either policy. Description is carried into
the native column. A matching scalar family is only a family claim, not proof of
native range, precision, absence or execution equivalence. The caller selects the
native representation; this operation does not infer it from a missing facet.

The projection enumerates unprojected field/document/module metadata, other
modules/elements, native vocabularies, renamed fields and mismatched scalar
families as path-qualified residuals. Strict blocks on any residual. Report may
emit the complete candidate with retained source assertions. Source identities
and namespace remain in the report, while the explicit target names establish
new native identity; no cross-context equivalence is inferred. The result schema
is `spec/core/field-tablespec-projection.schema.json`.

`recoverFieldFromTableSpec` verifies the retained receipt by recomputation and
checks the supplied native text against the exact emitted target. It then recovers
the complete authored source from the report. Edited native text blocks this
recovery; native-only import recovers classified column membership, not author
intent. This is report-assisted ideal recovery, not reconstruction of metadata
from native syntax alone. Native value conversion is outside this operation.

Evidence: 49 core/Field tests, 743 assertions, zero failures; typecheck/build pass;
180 schemas and 32 packages pass audits. Chromium 148 passes 20 projections,
40 JSON/YAML report-assisted recoveries, native-only classification, stale-target
refusal and strict/report loss-policy checks. The pinned TableSpec model accepts
all 20 generated schemas across ten explicitly selected native types and confirms
column identity. See [projection evidence](../../../../fixtures/validation/field-tablespec-projection-evidence.json).

TableSpec table-to-record/group mappings and multi-field reconciliation remain
required. PostgreSQL, SQL Server, Avro and Parquet Field bindings remain queued;
this one-system subset is not ideal admission or completion of US-040.
