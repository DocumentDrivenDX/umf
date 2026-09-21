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

## Whole-table record classification

`classifyTableSpecRecord` now classifies every captured column and creates a core
record in a caller-selected, previously absent module. The record uses ordered
`member` references to the original column identities in the native table module.
The native table/column module and extension archive remain intact. Equal display
names never merge identities. Context/provider metadata does not imply core groups;
it stays attached to the native source. An empty table has an empty member list.

The operation is atomic across all members. Existing kinds require verified author
receipts for the current complete source. Stale, duplicate, unrelated or conflicting
receipts and record-module collisions block the whole candidate in strict and report
modes. The result retains per-member and record mappings, native fragments, binding
version, residuals and path-qualified diagnostics. `verifyTableSpecRecordClassification`
recomputes the operation and rejects any changed current model or receipt, including
changed member references. The schema is
`spec/core/tablespec-record-classification.schema.json`.

The binding `umf.tablespec.record` 1.0.0 uses the same pinned native source as column
classification. Bun tests cover split-file/sidecar preservation, unknown native
column types, empty records and multiple compatible author receipts. All 14
TableSpec ideal tests pass 187 assertions. Chromium 148 checks 32 whole-record
classifications and member-reference closure alongside 64 native recoveries. The
pinned Python model accepts all 64 source/recovered comparisons and confirms the
table name and complete ordered column membership. Typecheck/build and audits of
181 schemas / 32 packages pass. See
[record evidence](../../../../fixtures/validation/tablespec-record-evidence.json).

This completes the initial table-to-record up-classification path, not the full
TableSpec binding. Full authored-record down-projection and general shared result
conformance remain unfinished, as do the other four native Field bindings and
admission gate. Historical evidence sections above retain their earlier scope.

## Authored-record TableSpec down-projection

`projectRecordToTableSpec` now accepts an authored record and explicit native
bindings for its `member` references. Every member author receipt must match the
same full source model. Native columns follow record-member order, independently
of request order. Record/field descriptions carry into the table/columns. Native
names and types are explicit; source identity and namespaces remain in the receipt.
This is the flat member layout, not nested-record flattening or implicit grouping.

Missing, duplicate, non-member, non-field or native-name-colliding bindings block
the whole candidate under either policy. Record/group member roles cannot become
columns by choosing report mode. Renames, incompatible scalar families and
unprojected field/reference/module/document metadata produce path-qualified
residuals and diagnostics. Strict refuses any such loss; report may return the
complete table while retaining the original assertions. A matching scalar family
still proves no native value-domain or execution equivalence.

`record-tablespec-projection.schema.json` describes request/result shape.
`recoverRecordFromTableSpec` recomputes the receipt and requires the unchanged
emitted native text before returning the complete retained source. Native-only
reimport establishes classified table membership; it does not reconstruct authored
provenance. Stale member receipts, changed reports and changed native text fail.

Evidence: 19 TableSpec ideal tests / 232 assertions pass; typecheck/build and audits
of 182 schemas / 32 packages pass. Chromium 148 checks six record cases: three
complete targets with six JSON/YAML ideal recoveries, and three atomic blocks.
The pinned native TableSpec model accepts all three emitted multi-column tables
and confirms ordered names/types. Existing single-Field cases also pass. See
[record projection evidence](../../../../fixtures/validation/record-tablespec-projection-evidence.json).

Field remains experimental. Shared operation-result conformance, explicit group
refusal coverage, complete five-system bindings and the separate admission gate
remain required. This result does not graduate any native meaning into equivalence.

## PostgreSQL catalog Field binding foundation

`classifyPostgresqlField` now classifies a captured catalog column by its exact
capture path, preserving qualified relation/type metadata and unknown refinements.
It requires an explicit 0.2.0 model, checked derived column metadata, PostgreSQL
17.4 and the original native capture text. The supplied text must match the exact
captured tree before it can serve as the recovery archive. Native paths are JSON
pointers into that text, not pointers into UMF's tagged representation.

The binding `umf.postgresql.catalog.field` 1.0.0 establishes member role only.
Arrays and domains remain fields without being relabeled as scalars. Existing
kinds require verified author provenance; conflicts block under strict and report
policies with source/residuals/diagnostics retained and no partial target. Unknown
representation encodings and stale derived metadata refuse classification. The
result schema is `spec/core/postgresql-field-classification.schema.json`.

`recoverPostgresqlFieldCapture` recomputes the receipt, checks the current target,
and returns the retained capture text exactly, including whitespace and unknown
native numeric tokens. The legacy catalog exporter canonicalizes JSON formatting;
this new receipt explicitly preserves the original text instead of claiming that
canonical export restores bytes. It does not restore database state or establish
that edited captures describe a live server. Raw DDL declarations remain separate.

Evidence: 4 targeted Bun tests / 113 assertions pass, covering 20 representative
scalar/domain/array columns, unknown metadata, source collisions and version/error
boundaries. A fresh pinned, network-isolated PostgreSQL 17.4 container confirms
20 column identities independently through pg_attribute and 40 JSON/YAML receipt
recoveries. The harness removes its owned container. Chromium 148 repeats 20
classifications, 40 exact recoveries, two conflict blocks and stale-receipt refusal
without external requests or host globals. Typecheck/build and audits of 183
schemas / 32 packages pass. See
[PostgreSQL Field evidence](../../../../fixtures/validation/field-postgresql-evidence.json).

This adds a second up-classification foundation, not a second complete binding.
PostgreSQL record/DDL/down-projection and ideal recovery remain required, as do
SQL Server, Avro and Parquet ideal bindings and the full Field conformance gate.

## PostgreSQL catalog record classification

`classifyPostgresqlRecord` classifies one captured ordinary or partitioned table
by qualified schema/name and creates a record in a caller-selected absent module.
The record retains the native schema as its namespace and references the original
column identities in captured order. Only that table's columns gain Field kinds;
equal relation names in other schemas remain distinct. Empty tables have empty
member lists. Views and other relation kinds are explicitly blocked in this binding;
composite types and raw DDL require separate handling.

The `umf.postgresql.catalog.record` 1.0.0 binding is pinned to PostgreSQL 17.4.
It checks capture text, derived metadata, unique nonempty column names and positive,
strictly increasing captured positions. Gaps for dropped columns are permitted.
Duplicate/ambiguous relation identity, existing record-module identity, stale or
unrelated author receipts and any conflicting member block atomic publication.
Strict and report both retain diagnostics/residuals without a partial target.
The schema is `spec/core/postgresql-record-classification.schema.json`.

`recoverPostgresqlRecordCapture` verifies the whole receipt by recomputation and
checks the current target before returning the original capture text. It refuses
changed references/native content or tampered receipts. This does not reconstruct
a database or infer native key, nullability, type-domain or execution equivalence.

Evidence: initial combined PostgreSQL Field/record regression passed seven tests
and 135 assertions. Additional member-integrity guards pass four record tests and
34 assertions. A fresh pinned PostgreSQL 17.4 run and Chromium 148 both confirm four
records (same-named tables in separate schemas, empty table, partitioned table),
eight record capture recoveries and explicit view refusal. Existing 20-column / 40
recovery evidence also passes. Typecheck/build and audits of 184 schemas / 32
packages pass. See [record evidence](../../../../fixtures/validation/record-postgresql-evidence.json).

PostgreSQL down-projection, raw DDL/composite mappings, shared conformance and the
remaining three native bindings remain unfinished. Neither this record classifier
nor the earlier TableSpec work completes the Field admission gate.

## PostgreSQL single-Field down-projection

`projectFieldToPostgresql` now emits reviewable CREATE TABLE and optional column
COMMENT DDL for one verified authored Field, with an explicit namespace/table/
column binding and one of fourteen native built-in type choices. Every type is
qualified through pg_catalog; user search-path domains cannot replace it. Native
identifiers are quoted, bounded to 63 UTF-8 bytes, and reject NUL/unpaired surrogates
before parsing. Comments use escaped literals. Namespace creation, permissions,
existing-object policy and SQL execution remain outside the browser library.

The caller supplies the pinned `@libpg-query/parser@17.6.10` backend. Generated SQL
is parsed into the existing PostgreSQL extension, while exact emitted text appears
as nativeSql. Target AST syntax does not imply catalog resolution or value-domain
equivalence. Mapping paths address the generated raw AST. The request/result schema
is `spec/core/field-postgresql-projection.schema.json`.

Strict blocks renamed fields, mismatched scalar families and unprojected source
metadata. Report retains source assertions, residuals and diagnostics with the
complete candidate. Neither mode lowers a record/group into one column. Unknown
facets or constraints are not silently honored. `recoverFieldFromPostgresql`
recomputes the retained receipt with the explicit backend and checks emitted text
before recovering author meaning; native-only recapture has classified provenance.

Evidence: four Bun tests / 134 assertions pass, including identifier boundaries,
quoted Unicode names/comments and loss policies. A fresh pinned PostgreSQL 17.4
container executes fifteen emitted schemas under a shadowing search path and
verifies requested type OIDs, builtin namespaces, names and comments. Native-only
recapture classifies fifteen fields. Chromium 148 with the pinned WASM backend
matches all fifteen projection results and thirty JSON/YAML ideal recoveries,
plus strict/report and invalid-identifier checks, without external requests or
host globals. Typecheck/build, optional WASM build, and audits of 185 schemas / 32
packages pass. See [down-projection evidence](../../../../fixtures/validation/field-postgresql-projection-evidence.json).

The full PostgreSQL binding still needs authored-record down-projection and
raw-DDL/composite classification. Shared conformance and SQL Server/Avro/Parquet
Field bindings remain unfinished. No native concept is removed or graduated to
core equivalence by this operation.
