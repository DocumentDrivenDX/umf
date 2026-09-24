---
ddx:
  id: CONTRACT-035
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: US-019
      kind: informed_by
---

# CONTRACT-035: Parquet to Avro schema projection

`projectParquetToAvro(source,policy)` lowers the inspected Parquet schema to an Avro
record while retaining the complete source byte capture. Policy declares record
name, namespace, schema-index field-name overrides, maps:entry-arrays and strict or
reported-loss behavior. The result includes source, policy, fidelity issues and
source-index/component-path mappings. Successful results include native Avro JSON
and target UMF. The complete result schema is spec/projections/parquet-avro.schema.json.

Nested unannotated groups become records; optional nodes become null unions;
unannotated repeated nodes become arrays of non-null items. Existing checked legacy
and current LIST layouts normalize to arrays with the inspected element nullability.
Maps explicitly become arrays of key/value records, retaining non-string keys and
ordered duplicate entries. Consumers must separately apply native last-value map
semantics. Key-only maps use null values; PyArrow instead presents that fixture as a
list of keys. This difference is deliberate and documented, not hidden equivalence.
Wrapper names/levels remain in source. Unused overrides and duplicate target names
block; invalid native Avro identifiers require explicit overrides.

Unannotated boolean, int32/int64, float/double and byte arrays use corresponding
Avro primitives; bounded fixed arrays use named fixed types. Signed/unsigned integer
annotations preserve range capacity, widening unsigned32 to long and unsigned64 to
decimal(20,0) with explicit range/encoding issues. Decimal uses bytes with authoritative
precision and scale. Current bounds are decimal precision 1–1000 and fixed size
1–4096 bytes. These are implementation bounds, not format restrictions.

Strings remain strings. ENUM/JSON interpretation and BSON validation remain reported
constraints. Dates use Avro date; millisecond/microsecond times and UTC/local timestamps
retain their units and distinction. Nanosecond timestamps use Avro 1.12 annotations.
Time-nanos retains the long carrier with explicit loss of the target logical annotation;
no rounding occurs. UUID uses fixed(16) with uuid annotation, FLOAT16 requires explicit
half-float decoding to float, and INTERVAL keeps its raw 12-byte carrier with native
meaning reported as unenforced. These are schema bindings, not implemented row codecs.

Unknown schema wire content, including skipped wrappers, blocks lowering. Unknown
logical annotations, INT96, invalid layouts, stale materialized fields and unavailable
mappings also block. Other file metadata and unknown content remain in the source and
are covered by the schema-only fidelity issue, with the additional embedded Arrow
checks below. Strict policy blocks all fidelity issues.
Neither inspection nor projection proves stored page values obey these declarations.

## Embedded Arrow meanings

When ARROW:schema is present, the projection uses CONTRACT-019's separate embedded
schema accessor. Ambiguous, malformed or unsupported embedded declarations block
lowering with EMBEDDED_ARROW_SCHEMA_UNINTERPRETED; a physical schema alone does not
establish their meaning. A decoded declaration produces
EMBEDDED_ARROW_SCHEMA_NOT_PROJECTED, explicitly stating that this operation derives
Avro from Parquet rather than merging the two schemas.

Decoded Arrow Duration, named Timestamp timezone and LargeList/FixedSizeList/list-view
refinements receive separate ARROW_DURATION_NOT_PROJECTED,
ARROW_TIMEZONE_NOT_PROJECTED and ARROW_LIST_REFINEMENT_NOT_PROJECTED issues. Each issue
points to the native file metadata entry; its detail identifies the field pointer in
the decoded Arrow schema. These are not inferred physical-field correspondences.
Complete source bytes retain all annotations and custom metadata. Generic decoded
Arrow meanings outside these refinements remain covered by the declaration-wide issue.

Two native fixtures have the same physical Avro projection but different Arrow-aware
readings: large-list/list, duration/int64 and named-zone/UTC timestamp. Eight independent
Apache Avro 1.12.0/fastavro 1.12.2 comparisons encode two rows from both sources with an
explicit oracle-only duration carrier binding. Target bytes agree; source meanings do
not become equivalent. Native timestamps recover the same instant in UTC, without the
source's named timezone. This is a counterexample to inferring semantics from equal
target schemas or bytes, not a general library row-conversion implementation.

Tests preserve these issues through both UMF formats and the composed TableSpec
projection. Chromium matches four additional source recoveries, blocks eleven malformed
or ambiguous embedded cases, and reproduces the composed loss report. Evidence is in
fixtures/parquet/arrow-schema/avro-losses.json and avro-losses-oracle.json; reproduce with
`bun test tests/parquet/avro-arrow-loss.test.ts`,
`.venv/bin/python scripts/parquet-avro-arrow-loss-oracle.py`, and the existing
`scripts/parquet-avro-browser.ts` command. No new core semantic equivalence is claimed.

## Evidence and limits

PyArrow 21.0.0 writes/reads a 13-field, three-row fixture covering nested records,
nullable nested lists, null/empty distinctions, duplicate integer map keys, exact
uint64/decimal, nanosecond time/timestamp, local timestamp, date and fixed bytes.
An explicitly authored oracle converts selected native carriers to Avro values;
Apache Avro 1.12.0 and fastavro 1.12.2 agree through six row/schema recoveries.
Direct integer temporal access avoids Python datetime's microsecond precision limit.
Both libraries admit negative unsigned64 and out-of-range int8 values, demonstrating
reported target constraint gaps. This oracle is not a general library row converter.

The 26 accepted logical/container corpus schemas parse in both Avro implementations.
Legacy list shapes and element nullability match the captured native views; map entry
bindings are checked separately. Invalid source cases remain blocked. Apache warnings
for fixed UUID and local/nanosecond timestamp annotations remain recorded. Parser
acceptance is not evidence that the runtime enforces every logical annotation.
Chromium compares the full nested projection, both native schema recoveries and exact
source byte recoveries, with no external requests or Node globals.

Rules follow the pinned Parquet baseline in native/parquet/sources and the official
[Parquet logical type specification](https://parquet.apache.org/docs/file-format/types/logicaltypes/)
and [Avro 1.12 specification](https://avro.apache.org/docs/1.12.0/specification/).
Core scalarType remains a value-family classification. Native repetition, nullability,
map semantics, integer widths and timestamp adjustment are not promoted as equivalent
core concepts by this work.
