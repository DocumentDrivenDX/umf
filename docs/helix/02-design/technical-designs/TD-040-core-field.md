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

## PostgreSQL authored-record down-projection

`projectRecordToPostgresql` now emits a complete flat table from an authored
record and verified explicit member bindings. Columns follow record-member order,
not request order; empty records emit empty tables. Record and member descriptions
become quoted native comments. The Field and Record projectors share builtin
carrier choices and identifier/literal encoding in `postgresql-syntax.ts`.
All types remain pg_catalog-qualified and identifiers retain the same UTF-8 bound.

Missing, duplicated, non-member/non-field or colliding bindings block the whole
candidate under either policy. Strict also blocks unprojected meaning; report
retains residuals and diagnostics with a complete target. Unknown constraints and
facets are not inferred from chosen native types. The caller supplies the pinned
parser backend; target SQL execution and schema creation remain external.
`record-postgresql-projection.schema.json` describes the request/result shape.

`recoverRecordFromPostgresql` recomputes the receipt and checks emitted SQL before
recovering the retained source. Changed native SQL, stale member author receipts
and changed mapping records cannot claim recovery. Native-only recapture still
has classified provenance, never reconstructed author intent.

Evidence: eight PostgreSQL Field/record projection tests pass 172 assertions.
A fresh pinned PostgreSQL 17.4 container executes four complete record targets,
including an empty table; three blocked cases create no table. Native checks verify
column order, builtin type OIDs and table comments under a shadowing search path.
Chromium 148 with the pinned WASM backend matches all seven record cases, eight
JSON/YAML ideal recoveries and three atomic blocks. The fifteen Field cases also
pass. Typecheck/build, optional WASM build, and audits of 186 schemas / 32 packages
pass. See [record projection evidence](../../../../fixtures/validation/record-postgresql-projection-evidence.json).
The main browser build clears dist, so the optional PostgreSQL runtime build must
run afterward before this browser harness.

Raw-DDL/composite classification and shared result conformance remain required,
along with the SQL Server, Avro and Parquet Field bindings and complete admission
evidence. This flat-record path makes no value-domain or native-equivalence claim.

## PostgreSQL raw declaration classification

`classifyPostgresqlDdlRecord` classifies an explicit `CREATE TABLE` declaration
into a new record module and ordered field members. The result always states
`scope: declared-only`: it does not claim the final catalog after execution.
Explicit schema names and enclosing `CREATE SCHEMA` context supply namespaces.
An unresolved search path blocks strict mode; report mode retains an explicit
residual and an empty namespace without asserting `public`.

`LIKE`, inheritance, typed/partition-child expansion, unsupported declaration
kinds, duplicate members and module collisions block both policies. Later
`ALTER TABLE` statements stay in the original native payload and do not change
the selected declaration's membership. Domains and arrays do not acquire an
inferred scalar family. Edited ASTs whose archived source differs must be
reimported from reviewed emitted SQL before classification. Recovery recomputes
the complete receipt and checks the current model before returning the exact
original SQL, including comments and whitespace.

The request/result has a dedicated JSON Schema. Twelve Bun tests pass 277
assertions across raw declarations, catalog Field/record classification and the
new operation. A fresh pinned PostgreSQL 17.4 container verifies seven source
cases, including duplicate-column rejection (42701), actual search-path behavior,
and the different final memberships produced by ALTER, inheritance and LIKE.
Across strict/report policies, seven classifications succeed and seven block.
Chromium 148 with the pinned WASM parser matches all fourteen results and passes
fourteen JSON/YAML receipt recoveries. Typechecking, browser builds and audits of
187 schemas / 32 packages pass. See [declaration evidence](../../../../fixtures/validation/postgresql-ddl-kinds-evidence.json).

This supplies a declared-only raw-DDL path, not composite-type classification,
catalog expansion, execution replay or native equivalence. Those limitations,
shared result conformance and the remaining priority-system bindings keep the
Field work open. Queue validation still passes all 36 beads and 54 dependency
edges; this slice does not change scope or close a bead.

## PostgreSQL composite declarations

The declaration inventory and `classifyPostgresqlDdlRecord` now also recognize
`CREATE TYPE ... AS (...)`. A separate `umf.postgresql.ddl.composite` binding
(version 1.0.0, PostgreSQL 17.4) classifies the declared type as a record and its
ordered attributes as fields. The existing table binding identity remains
unchanged. Both result schemas describe the added declaration/binding variants.

This follows PostgreSQL's [composite-type definition](https://www.postgresql.org/docs/17/rowtypes.html).
Attribute collation, qualified type names, nested composite references, arrays
and later `ALTER TYPE` statements remain native content. Unresolved nested types
are not scalarized or linked by guessing; resolved record-valued references remain
unfinished. Standalone composite classification does not imply table constraints,
a storage table, or a final executed catalog. Empty composites are supported.
Unqualified names follow the existing strict/report namespace policy, and duplicate
attribute names block the entire candidate in both modes.

Five targeted tests pass 218 assertions, including declaration-schema validation,
collation retention, unresolved nested types and exact receipt recovery. The
expanded native oracle executes twelve cases in PostgreSQL 17.4 and independently
checks relation kind (`r` table versus `c` composite) and final catalog membership.
Fourteen classifications succeed and ten block across both policies. Chromium 148
matches all 24 results and verifies 28 JSON/YAML SQL recoveries. Typechecking,
browser/WASM builds and all 187 schemas / 32 package checks pass. The
[declaration evidence](../../../../fixtures/validation/postgresql-ddl-kinds-evidence.json)
now records this expanded scope.

Remaining work includes catalog composite classification, resolved structured
member references, shared result conformance, the other priority-system Field
bindings, and the complete admission record. No bead is closed by this extension.

## PostgreSQL captured standalone composites

`classifyPostgresqlComposite` now selects a standalone composite by exact captured
schema/name and adds a new record module with ordered field members. A separate
versioned binding and JSON Schema describe the operation. Existing modules cannot
be overwritten; collisions, duplicate/empty attribute names, ambiguous type
identities and non-increasing attribute positions block or reject the operation.
Dropped attribute positions may leave gaps without changing retained member order.
Null attribute aggregates classify as empty records under the pinned capture query.

The capture contains formatted attribute type names rather than structured type
identities. This binding therefore asserts only record/member roles. It does not
infer scalar families or nested record references from that text. Collations,
comments, ownership, ACLs, native type spellings and unknown detail remain in the
source and copied native mapping fragments. The captured composite's qualified
identity supplies its namespace; equal names in separate schemas remain distinct.
`recoverPostgresqlCompositeCapture` recomputes the receipt and compares the current
model before returning the exact archived capture text.

Eleven catalog Field/record/composite tests pass 240 assertions. The fresh pinned
PostgreSQL 17.4 oracle independently checks four composite relation kinds and
attribute lists: equal names in sales/support, dropped attribute positions, nested
composite/array members and an empty composite. Native and Chromium 148 checks
both pass eight composite JSON/YAML recoveries; existing twenty Field and four
table-record cases still pass. Typechecking, the browser build and audits of 188
schemas / 32 packages pass. See [composite evidence](../../../../fixtures/validation/postgresql-composite-evidence.json).

Resolved structured references require richer captured type identities and remain
unfinished, as do shared result conformance and the other priority-system Field
bindings. This completes neither Field admission nor native-equivalence graduation;
existing bead scope and dependencies remain applicable.

## TableSpec Field diagnostic conformance

The two initial single-Field TableSpec operations now emit diagnostics on every
result, including an empty list for exact success. Classification conflicts are
errors in both policies. Projection residuals produce path-matched errors when
blocked and warnings when report mode emits a candidate; record/group-to-column
refusal remains an error even in report mode. The native outputs, source retention,
residuals and strict/report decisions are unchanged.

The existing receipt schemas accept an optional diagnostics array so historical
receipts remain readable. Newly emitted TypeScript return types require the array.
Verification recomputes every source/mapping/target claim; only when the original
receipt has no diagnostics member does comparison omit the newly generated array.
Supplied diagnostics are compared exactly. This compatibility rule does not waive
native-text checks or permit altered residuals/mappings. Receipt consistency is
not a cryptographic provenance/authenticity guarantee.

Twenty-one TableSpec Field/record tests pass 253 assertions. Chromium 148 verifies
32 classifications, 64 native recoveries, both conflict modes, 20 Field projections,
40 ideal recoveries and historical receipt verification. Existing record browser
cases still pass. Typechecking, browser build and all 188 schema / 32 package
checks pass; [diagnostic evidence](../../../../fixtures/validation/tablespec-field-diagnostics-evidence.json)
records the commands and fingerprints. Native schema output is unchanged, so this
slice relies on the existing pinned native evidence rather than claiming a fresh
native execution run.

This closes the missing-diagnostics gap in these two operations. Common mapping
basis, residual locations/binding metadata, structured type references and remaining
priority-system Field bindings still require work; the Field bead remains open.

## Projection receipt policy validation

All four authored Field/Record projection schemas (TableSpec and PostgreSQL) now
share generated structural rules for the strict/report contract. Strict success
requires zero residuals and exact mapping outcomes. Any successful non-exact
mapping requires a retained residual. Successful results cannot carry error
diagnostics; blocked results require residuals and, when diagnostics are present,
at least one error. Existing atomicity rules continue to forbid target/native SQL
on blocked results. Historical TableSpec Field receipts may still omit diagnostics.

The shared generator replaces its policy branch when a derived schema changes
from a single mapping to a mapping array. It does not infer semantic correctness
from schema validity: runtime source/receipt recomputation and native recovery
checks remain required. A schema-valid report is not proof of native equivalence.

Twenty-two tests pass 415 assertions across the four projectors and the negative
receipt matrix. Chromium 148 passes twenty TableSpec Field projections/forty ideal
recoveries and six record cases; PostgreSQL WASM passes fifteen Field projections/
thirty recoveries and seven record cases. Both record suites preserve their
existing atomic blocks and report recoveries. Typechecking, browser/WASM builds
and all 188 schemas / 32 packages pass. See
[policy evidence](../../../../fixtures/validation/projection-policy-evidence.json).
Native output generation is unchanged; no new native-engine execution is claimed.

This addresses structural policy consistency. Complete common mapping/residual
metadata, structured references and remaining priority-system bindings are still
required before the Field work can close.

## Classification receipt policy validation

The shared structural policy now also governs all six classification schemas:
TableSpec Field/record and PostgreSQL catalog Field/record/composite plus raw DDL
record/member classification. Strict successful classification requires exact
mapping outcomes and zero residuals. A report-mode non-exact mapping requires an
explicit residual. Classified results cannot carry error diagnostics; blocked
results retain residuals, an error when diagnostics are present, and no target.
Historical TableSpec Field receipts retain their diagnostics compatibility rule.

DDL classification continues to admit warnings describing declared-only scope.
Its unresolved-namespace report result remains valid with a residual and unknown
record mapping; relabeling that receipt as strict fails schema validation. Merely
changing a status cannot erase the conflict or expose a partial candidate.

The six classification suites pass 25 tests / 520 assertions; classification and
projection policy matrices pass another 10 tests / 154 assertions. Chromium 148
passes the TableSpec classification corpus, PostgreSQL catalog corpus and 24 raw
DDL policy cases with exact receipt recovery. Typechecking, browser/WASM builds
and all 188 schema / 32 package checks pass. See
[classification policy evidence](../../../../fixtures/validation/classification-policy-evidence.json).
No native output semantics changed, and no new native-engine run is claimed.

Structural policy conformance is now shared across these ten result schemas.
Common mapping/residual metadata, structured type references, remaining native
bindings and the full admission record remain required; this does not close the
Field bead or the overall goal.

## SQL Server captured Field classification

`classifySqlServerField` now derives Field kind from checked native column
membership for SQL Server build 16.0.4295.3. The operation accepts an explicitly
migrated envelope, selected capture path, exact native capture archive and
strict/report policy, plus optional verified author provenance. Its JSON Schema
uses the shared classification policy. Existing kinds require matching author
provenance; conflicts block both modes without a target. Native/core metadata
mismatches, stale archives and unsupported server builds are rejected.

The mapping retains the complete native column fragment and exact capture path.
Alias, computed, identity, rowversion, collation and native type details remain
extension content. Field classification neither infers a portable key from an
index nor promotes native nullability/enforcement flags. Unknown scalar families
still classify as fields. Capture correspondence is permission-limited and is
not an assertion that arbitrary supplied metadata came from a live server.
`recoverSqlServerFieldCapture` recomputes the receipt and checks the current model
before returning the exact retained capture, including whitespace and unknown
numeric tokens.

Ten tests pass 298 assertions across Field, existing catalog and index behavior.
A fresh isolated container using the existing pinned SQL Server image checks
32 native column memberships against an independent catalog query and passes
64 JSON/YAML capture recoveries. The harness also retains its DDL replay and
identity/computed/rowversion checks. Chromium 148 passes the same 32 classifications
and 64 recoveries, both authored-conflict policies and a stale-receipt refusal.
Typechecking, browser build and all 189 schema / 32 package checks pass. See
[SQL Server Field evidence](../../../../fixtures/validation/field-sqlserver-evidence.json).

SQL Server record classification and authored down-projection remain unfinished,
along with Avro/Parquet Field bindings, common mapping/residual metadata and
structured references. This scoped up-classifier does not close the SQL Server
binding or the overall Field admission gate.

## SQL Server captured records

`classifySqlServerRecord` now selects a table by captured schema/name and publishes
one record with ordered member references into the existing column module. Only
selected members receive Field kind. Its separate versioned binding and JSON
Schema share the classification policy. Equal table names in different schemas
remain distinct, and dropped column IDs may leave gaps while retained IDs must
increase strictly.

The operation validates source/archive correspondence and build 16.0.4295.3 before
using column observations. A module collision, member-kind conflict, stale or
unrelated author receipt, duplicate author receipt, or invalid member order blocks
the whole record. No partial target is published. Recovery recomputes the complete
receipt and rejects edited member references or native archives. Captured index,
constraint and type content remains untouched; a record label asserts neither
portable identity nor constraint equivalence.

The native/browser corpus now contains three records and 34 fields, including
sales.Types and support.Types and a dropped-column ID gap. A fresh pinned SQL
Server instance verifies member order through an independent sys.tables/sys.columns
query and passes six record / 68 Field JSON/YAML recoveries. Chromium 148 matches
those recoveries. This remains permission-limited captured membership, not a claim
of complete database structure or native equivalence.

SQL Server authored Field/Record down-projection, Avro/Parquet Field bindings,
structured references and complete common mapping/residual metadata remain open.

Validation for this slice: seven SQL Server Field/record tests pass 262 assertions;
the full-capture record tests use explicit 30-second limits after exceeding Bun's
default five seconds. Typechecking, browser build and all 190 schema / 32 package
checks pass. [Record evidence](../../../../fixtures/validation/record-sqlserver-evidence.json)
records the source and native/browser fingerprints. No bead is closed by this slice.

## SQL Server authored Field down-projection

`projectFieldToSqlServer` emits a complete SQL artifact for one authored Field and
an explicit builtin carrier. Fourteen carriers cover the nine current scalar
families; their native widths, precision, scale, temporal behavior and collation
remain native choices rather than equivalence claims. The column is explicitly
nullable. Author-stated nullability/facets/constraints outside this binding become
residuals: strict blocks and report retains the source while emitting only the
covered meaning. Records/groups cannot become single columns under either mode.

The target is `{format: "sqlserver-ddl", sql}` rather than a fabricated catalog
capture. The caller must provide an existing target schema and execute SQL outside
the browser library. Bracket-quoted permanent identifiers and Unicode literals
escape native delimiters; NUL, unpaired surrogates, overlong identifiers, edge
whitespace and temporary-object names are rejected. Descriptions use extended
properties within a conservative 3,750 UTF-16-unit limit; larger descriptions are
explicit residuals. No source expression/default is executed or copied as code.

`recoverFieldFromSqlServer` validates and recomputes the receipt, then requires
exact equality with both retained SQL copies before returning the authored source.
Native-only catalog import produces classified provenance and cannot recreate
unencoded author intent. The dedicated result schema uses shared strict/report
policy and exposes no SQL or target when blocked.

Two targeted tests pass 102 assertions. A fresh pinned SQL Server 16.0.4295.3
container executes all fourteen carrier cases and independently checks column
names, system type IDs, nullable/nonidentity/noncomputed status and Unicode
extended descriptions. All 28 authored JSON/YAML recoveries and fourteen native-only
column classifications pass. Chromium 148 matches all fourteen emitted artifacts,
28 recoveries, two loss policies and four unsafe-identifier refusals. Typechecking,
browser build and all 191 schema / 32 package checks pass. See
[Field projection evidence](../../../../fixtures/validation/field-sqlserver-projection-evidence.json).

SQL Server authored records, structured references, Avro/Parquet Field bindings
and complete mapping/residual metadata remain required. These carrier examples
establish scoped behavior, not value-domain exactness or Field admission.

## SQL Server authored records

`projectRecordToSqlServer` now emits a complete flat table from an authored record
and explicitly bound authored members. Columns follow record-member order rather
than request order. Source assertions, names, descriptions and unmatched metadata
follow strict/report loss policy. Missing, duplicate, non-member or non-field
bindings and exact native-name collisions block both modes. Empty records also
block both modes because SQL Server cannot express a zero-column table.

SQL Server identifier equality depends on database collation. This binding requires
an explicit `identifierCollation: Latin1_General_100_BIN2` request and emits a guard
that throws before execution in a database with a different collation. It does not
change database collation. Within this supported context, distinct case-sensitive
column names retain their identities. The target schema must already exist. Other
collations need their own evidenced comparison/binding rules rather than a guessed
case-folding implementation.

Descriptions become bounded Unicode extended properties on the table and columns;
larger values remain residuals. Native column carriers are explicitly nullable.
The output remains a SQL artifact, never a fabricated catalog observation.
Recovery recomputes the report and rejects changed SQL, mappings or member authors
before returning the retained ideal. No native-only import can reconstruct author
intent not encoded in the SQL.

Evidence: four SQL Server Field/record tests pass 146 assertions. A fresh pinned
16.0.4295.3 instance executes four of eight record cases, verifies ordered members
and table descriptions, preserves distinct `id`/`ID` columns under BIN2, and
refuses the wrong database collation. Four blocked cases expose no SQL. Chromium
148 matches all eight cases and eight JSON/YAML ideal recoveries; fourteen Field
cases and 28 Field recoveries also pass. Typechecking, browser build and all
192 schema / 32 package checks pass. See
[record projection evidence](../../../../fixtures/validation/record-sqlserver-projection-evidence.json).
This is a collation-qualified flat-record binding; arbitrary collations, structured
references, common mapping/residual metadata and Avro/Parquet Field bindings remain
unfinished. The Field admission and five-system gates remain open.

## Avro declared Field classification

`classifyAvroField` derives Field kind from declared record/error membership,
including nested records and separately supplied named-schema dependencies. Its
`column` selector is the source-qualified metadata element ID (dependency ID plus
native path), not a bare field name or path. Mapping provenance includes the
native field fragment, path and dependency ID when applicable. Equal paths in
separate dependencies cannot merge.

The request retains exact root text and an ordered dependency archive. Checked
bundle export must match every archive before classification. Missing, reordered
or changed dependencies fail; existing kinds require verified author provenance,
and conflicts block both policies. Arrays, maps, record-valued references and
recursive unions do not become scalar fields merely because they have member
roles. Existing scalar-family metadata remains qualified by the Avro adapter;
logical types, defaults, aliases and unknown annotations stay in native content.

`recoverAvroFieldBundle` recomputes the complete receipt and checks the current
model before returning exact root/dependency texts. Classification does not infer
portable nullability, cardinality, identity, or logical-type execution. The
operation has a dedicated JSON Schema using the shared classification policy.

Two tests pass 196 assertions across nested/recursive records, unions, arrays,
maps, error records, separate namespaces, unknown logical meaning and exact bundle
recovery. Apache Avro 1.12.0 independently parses the three bundles and confirms
all thirteen declared field memberships. Its warning for an invented logical type
is expected; UMF preserves that annotation without assigning a scalar family.
Chromium 148 matches thirteen classifications, 26 JSON/YAML bundle recoveries and
both authored-conflict policies. Typechecking, browser build and all 193 schema /
32 package checks pass. See [Avro Field evidence](../../../../fixtures/validation/field-avro-evidence.json).

Avro record classification and authored down-projection, Parquet bindings,
structured reference resolution and complete common mapping/residual metadata
remain unfinished. This membership evidence does not establish value-domain
semantics, full Avro support, or Field admission.
