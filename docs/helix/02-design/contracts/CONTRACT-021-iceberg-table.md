---
ddx:
  id: CONTRACT-021
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-020
      kind: informed_by
    - id: US-021
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-021: Iceberg table metadata JSON

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose and Scope

Preserve table metadata JSON and expose known shapes and copied edits. Authority is Iceberg
1.11.0 specification commit 6976e020b894f6a6777704df2b8c4458cb291ae9. Native evidence uses Java
Iceberg 1.11.0 and PyIceberg 0.11.0. Native files remain authoritative; successful shape checks
do not establish table readability, reference consistency or commit validity.

## Normative Surface

umf.iceberg.table 0.1.0 stores {profile:"iceberg-table-json",root:<NativeJson>} in module table,
element table. spec/extensions/iceberg-table/schema.json defines the complete payload;
datatype-schema.json defines known source fields and nested record shapes; package.json
registers scope and evidence. All unknown native fields and exact number tokens remain data.

Known v1–v3 roots require format-version, location, last-updated-ms and last-column-id. V1
requires legacy schema and partition-spec. V2/v3 require table UUID, sequence number, schemas,
current schema ID, partition specs/default ID/last partition ID and sort orders/default ID.
V3 requires next-row-id. The schema describes snapshots, refs, both logs, statistics/blob
metadata, partition statistics and encryption-key descriptors. It retains nullable refs and
current-snapshot-id without inserting defaults. Schema-level context rules follow CONTRACT-020.

Known integer fields are checked against exact signed 32/64-bit token domains, never by a
rounded JavaScript value. Exponent/fraction spellings are rejected for these integer fields.
Defaults inside embedded schemas remain unexecuted source values. Unknown table versions
retain their object content without imposing known-version field meanings; only the exact
format-version field is interpreted. No data-reading capability is implied for unknown versions.

| API | Behavior |
| --- | --- |
| importIcebergTable(text,{id}) | Parse exact JSON and validate known source shapes/embedded schemas into a Document |
| exportIcebergTable(document) | Render authoritative tree, refusing to discard unknown representation fields |
| inspectIcebergTable(document) | Registry validation with context/unknown diagnostics |
| inspectIcebergTableContext(document) | Separate bounded current-reference report; preserves input, never a commit approval |
| icebergTableRegistry(), icebergTablePackage | Pinned extension registration and package |
| getIcebergTableNode(document,pointer) | Copy of an existing exact-node value |
| proposeIcebergTableNodeEdit(document,pointer,text) | Copied candidate plus validation; existing target only; no source mutation |

Candidates do not update linked IDs, histories or physical files automatically. Moving a
location string in a candidate does not relocate files or commit metadata. Missing resources
are never fetched. Nested version-dependent snapshot rules, URI/UUID encoding, reference
history beyond the bounded inspection below, transform compatibility, counter history and encryption semantics remain unchecked.

## Precedence, Compatibility and Errors

CONTRACT-001 governs the envelope; CONTRACT-020 governs embedded schema checks. The pinned
specification governs meanings; one native parser's normalization does not override it.
ICEBERG_TABLE_STRUCTURE, ICEBERG_TABLE_INTEGER and ICEBERG_TABLE_SCHEMA are validation errors.
ICEBERG_TABLE_CONTEXT, ICEBERG_TABLE_VERSION and ICEBERG_TABLE_UNKNOWN qualify interpretation.
Representation warnings cause ICEBERG_TABLE_EXPORT when native export would drop content.
Invalid/missing documents produce ICEBERG_TABLE_DOCUMENT/ICEBERG_TABLE_PAYLOAD. Exact-JSON and
pointer errors propagate. Failed edits leave their input untouched.

## Examples and Evidence

Thirteen pinned TableMetadata resources provide seven preserved documents and six known-shape
rejections. Fourteen UMF-format exports retain source exactly at the JSON-value/token level;
seven location candidates change only their target. Java independently compares native
re-emission and edits for six accepted sources; both runtimes reject the archived future format.
PyIceberg rejects the upstream ndv statistics type accepted by Java, and parses v3 metadata but
refuses to serialize it. Its report separates parsing from export. PyIceberg also defaults some
fields whose absence UMF/Java reject. No native-read support is inferred from these differences.

fixtures/iceberg/table/*results.json records native/browser outcomes. Tests additionally cover
max int64, overflow, future content, copied access and unknown representation guards. No data
files, encryption keys or external locations are accessed. Root source JSON is retained rather
than native-library re-emission. Full table semantics, dependent evolution and cross-system
transforms remain incomplete, so this contract stays draft.


## Current-reference inspection (US-021-AC4)

`inspectIcebergTableContext` returns the object described by
`spec/extensions/iceberg-table/context-schema.json`: status checked/blocked, complete:false,
scope iceberg-v1-v3-current-references, resolved source-to-target JSON pointers and diagnostics.
Checked means only this bounded inspection passed. It does not assert native table validity.
The validated source tree is copied for inspection; the caller's document remains authoritative.
Import/export and candidate preservation do not depend on the report's status.

For known v1–v3 metadata, retained schema/spec/order/snapshot identities must be explicit and
unique; current selections and explicit snapshot refs must resolve unambiguously. Snapshot IDs
are compared as exact integers, including beyond 2^53. An explicit main ref must be a branch
and equal the current snapshot. Missing/null/-1 current snapshots represent no current selection
(the -1 convention is retained by the pinned Java parser). A missing main ref is not inserted.
V1 with no modern collection/selection resolves legacy schema/partition-spec pointers and
reports an absent sort-order default as implicit. Other ambiguous missing selections block
this bounded inspection; it does not emulate every native default.

Expired parent snapshots are deliberately not required to remain present. Historical schema
references, snapshot logs, transforms and physical resources remain outside this report.
Unknown formats block interpretation while remaining exportable. Duplicate identities never
produce a resolved pointer to an arbitrarily chosen entry. Diagnostics use
ICEBERG_TABLE_REFERENCE (error), ICEBERG_TABLE_IMPLICIT and
ICEBERG_TABLE_CONTEXT_INCOMPLETE (warnings). Malformed documents still fail existing validation.

Evidence: six preserved known-version upstream tables pass; the archived future-version table
blocks interpretation. Bun tests cover dangling/duplicate selections, main mismatches, expired
parents, exact snapshot IDs, both UMF formats and source immutability. These additional negative
vectors assert specification-derived context rules, not new native parser acceptance claims.
Chromium compares all seven reports and exercises three dangling selection edits.


## Transform type inspection (US-021-AC5)

`inspectIcebergTransformType(sourceType, transform)` returns the complete object shape in
`spec/extensions/iceberg/transform-type-schema.json`. It retains input strings, reports
compatible/incompatible/uninterpreted, supplies `resultType` only when compatible, and always
returns `complete:false` with a reason. This API assesses the pinned specification's type
matrix only; callers must separately establish field binding, table version availability,
primitive/non-collection field context and execution behavior.

The interpreted profile includes boolean, int/long, float/double, decimal, date/time, microsecond
and nanosecond timestamps with/without timezone, string, uuid, fixed, binary and variant.
Identity, void, bucket, truncate, year/month/day/hour follow the pinned transform table.
Decimal and fixed domains and bucket/truncate positive int32 parameters are bounded.
Unknown types/transforms, malformed unrecognized parameter syntax, geospatial types and inputs
above 4096 characters remain uninterpreted rather than acquiring guessed semantics. No parsing
or replacement changes the source model. `unknown` is not treated as a proven primitive type.

The pinned specification gives day an int result; Java 1.11.0 exposes date. UMF reports int,
and native result evidence retains date. This is an explicit representation distinction, not
proof that date and integer semantics are interchangeable. The void result uses source type,
one of the specification's permitted representations. No promotion into core follows.

Fixtures in `fixtures/iceberg/transforms` contain 136 combinations (17 source types × eight
transforms), evaluated independently using Java's Transform.canTransform/getResultType and
repeated in Chromium. Variant uses Java's VariantType directly because its primitive-string
parser does not accept variant. Unknown/malformed inputs and parameter limits have separate
Bun tests. This is type compatibility evidence, not value-transform or full partition/sort
support. Integration with current fields, sort direction/null ordering, multi-source transforms
and history remains unfinished.


## Current partition/sort field binding (US-021-AC6)

`inspectIcebergTableTransforms(document)` returns status checked/blocked, complete:false,
bindings and diagnostics, described completely in
`spec/extensions/iceberg-table/transform-binding-schema.json`. It uses the current-reference
report to select the current schema, default partition spec and default sort order. Each
binding retains the partition/sort field pointer, source schema field pointer and AC5 type
assessment. It never modifies metadata, inserts defaults or executes a transform.

Struct traversal binds by ID, including names containing dots. Collection descendants and
non-scalar sources block this interpretation. Missing current source fields, incompatible or
uninterpreted transforms, invalid sort direction/null order, nonempty sort order zero and
duplicate partition field IDs/names produce ICEBERG_TABLE_TRANSFORM errors. Historical specs
remain source and are not checked against current-only fields. Reports always warn that table
version feature availability, historical semantics, value execution and safe evolution remain
unchecked. A checked result is not a write authorization or full native validity assertion.

The source grammar now models source-id versus source-ids exclusively. Nonempty source-ids
arrays are preserved for v3; v1/v2 require source-id. V2/v3 partition fields require field-id.
This corrects missing v3 representation coverage against the pinned Appendix C. Multi-source
transform binding remains unavailable and produces an explicit error without blocking source
preservation. Unknown multi-source transform names never acquire guessed semantics.

The authored nested-table fixture passes Java 1.11.0 round-trip/re-emission and location-edit
comparison. The v3 multi-source fixture survives UMF JSON/YAML, while that Java parser rejects
it for a missing source-id. The newer specification shape is preserved independently of this
parser limitation; no native multi-source support is claimed. Evidence is recorded in
fixtures/iceberg/table-binding and tests/iceberg/table-transforms.test.ts. Chromium compares
seven upstream binding reports and both multi-source formats. Broader evolution and transform
execution remain unfinished.


## Versioned rename candidate (US-021-AC7)

`proposeIcebergTableRename(document, {fieldId, newName, nextSchemaId})` returns a new core
Document plus a report defined by `spec/extensions/iceberg-table/rename-report-schema.json`.
The report includes previous/next schema IDs, field ID, old/new names, appended schema pointer,
AC6 binding inspection, limitations and complete:false. The returned Document uses the same
complete envelope/payload schemas as ordinary table preservation.

This operation requires v2/v3 metadata with resolved current references. Requested field and
next schema IDs must be nonnegative int32; the new ID must be unused in retained schemas.
Names contain 1–4096 characters. The target is a named field selected by ID, including nested
structs within collections. Missing fields, unchanged names, sibling-name conflicts, reused
schema IDs and invalid options raise ICEBERG_TABLE_RENAME without mutating input. Legacy v1
migration and allocation beyond the caller-supplied schema ID are not implemented. Existing
unknown representation guards apply before tree rendering.

The current schema is copied and appended. Only the selected field name and appended schema
ID change within that copy; current-schema-id selects the new schema. Historical schemas,
identifier IDs, field IDs, snapshots, partition/sort metadata, counters, unknown native content
and last-updated-ms remain source values. The resulting bindings are reported, including blocked
interpretation. They are not a commit authorization. Name-dependent properties and unknown
extensions are retained without rewriting and require review. No timestamp advancement,
optimistic concurrency operation, physical file rewrite or external fetch occurs.

Four candidate fixtures cover v2 full/minimal, v3 and nested names containing dots. Native Java
1.11.0 independently applies SchemaUpdate.renameColumn and TableMetadata.updateSchema, then
compares the normalized complete metadata for both UMF formats. Only last-updated-ms is excluded
because Java advances update time while UMF produces an uncommitted candidate. Native-generated
defaults are compared on both sides; authoritative source content is separately tested unchanged.
Chromium repeats all four candidates and both formats. Bun verifies atomic failures and retained
unknown metadata/identifier IDs. This does not prove all evolution behavior, schema-history
deduplication, name-mapping updates or safe commits; these remain open.


## Primitive promotion candidates (US-021-AC8)

`proposeIcebergTablePromotion(document, {fieldId, targetType, nextSchemaId})` returns a new
Document plus the report defined by
`spec/extensions/iceberg-table/promotion-report-schema.json`. It records previous/next schema
IDs, source/target type, named field ID, appended schema pointer, checked partition field
pointers, resulting AC6 bindings, limitations and complete:false. The candidate uses the
existing core/table schemas. No table mutation, file conversion or commit occurs.

The implemented candidates are int→long, float→double and decimal(P,S)→decimal(P',S) with
P<P'≤38, in v2/v3 table metadata. The next schema ID must be an unused nonnegative int32 and
field ID a nonnegative int32. Target type text is bounded to 4096 characters. The field must
be a named primitive in the current schema; nested map-key changes and unnamed collection
components are outside this profile. Current references must resolve. Unknown representation
content continues to block lossy rendering.

The operation checks all retained partition specs, plus legacy partition-spec when present,
for source IDs referencing the promoted field. Known transforms must accept both types;
these three widening families preserve partition values according to the pinned evolution
rules. Dependent unknown or multi-source transforms block the candidate. V3 date→timestamp
and unknown→other promotions remain unimplemented, rather than being classified as invalid
Iceberg operations. Invalid requests and unsupported interpretation raise
ICEBERG_TABLE_PROMOTION without changing the input. Resulting sort/current bindings are
reported separately and do not authorize writing data.

Only the promoted type and ID in the appended schema, plus current-schema-id, change.
Historical schema types, IDs, defaults, unknown metadata, partition/sort fields, snapshots and
counters remain unchanged. Existing file bounds retain their original byte encoding; correct
reader decoding requires historical type information and is not proven by these candidates.
Unknown type-dependent metadata/default behavior, history deduplication and safe commits remain
unverified and are listed in the report.

Six authored cases cover identity/bucket/truncate over int→long, identity over float→double,
and bucket/truncate over decimal precision widening. Java 1.11.0 independently executes
SchemaUpdate.updateColumn and TableMetadata.updateSchema and compares full normalized metadata
for twelve format exports, excluding only last-updated-ms as for AC7. Chromium repeats all
six candidates. Bun tests prove history/source preservation and atomic rejection of invalid
promotions and unknown historical partition dependencies. Fixtures and native results are in
fixtures/iceberg/table-promotion. This evidence concerns schema transformations, not data-value
execution or complete Iceberg evolution support.


## Physical promotion evidence (US-021-AC9)

The six AC8 candidates now have local Parquet data evidence, separate from the public API's
bounded interpretation report. PyArrow 21.0.0 writes six uncompressed, non-dictionary files
with Iceberg field IDs and physical names different from logical schema names. Java Iceberg
1.11.0 reads each file using its original schema and both UMF promotion candidates via
[GenericParquetReaders](https://iceberg.apache.org/javadoc/1.11.0/org/apache/iceberg/data/parquet/GenericParquetReaders.html)
and the schema projection on
[Parquet.ReadBuilder](https://iceberg.apache.org/javadoc/1.11.0/org/apache/iceberg/parquet/Parquet.ReadBuilder.html).

Forty-five authored source rows produce 45 original-schema and 90 promoted-schema row checks.
Integer limits, decimal precision boundaries, float32 rounding, signed zero, infinities and NaN
are compared without JS numeric conversion. Float results use expected widened IEEE754 double
bits computed from source float32 bytes; integers/decimals use exact text. Promoted Java value
classes and both untouched columns are checked. Every file contains multiple row groups.
Required source fields contain no nulls; optional promoted-field/null semantics and other
encodings remain outside this corpus.

The data manifest and native report bind file SHA-256 and source/candidate metadata SHA-256.
Bun re-derives current public candidates and checks their exact exports against those metadata
hashes, avoiding claims based solely on stale native reports. The native test adds development
only Iceberg data/parquet 1.11.0, Parquet column 1.17.1 and shaded Hadoop client API/runtime 3.3.0
(the provided Hadoop baseline of pinned Parquet). The public package adds no JVM dependencies.

This evidence demonstrates local file projection for the six promotion cases. It does not
exercise manifest pruning, historical bound decoding, deletes, transactions, concurrent commits,
all data encodings or every valid type promotion. Candidate reports remain complete:false.
