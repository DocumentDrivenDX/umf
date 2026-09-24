---
ddx:
  id: CONTRACT-017
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-017
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
    - id: SPIKE-004
      kind: informed_by
---

# CONTRACT-017: Spark DataType schema JSON

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose and scope

Provide exact source retention, known shape validation, pointer access and candidate
edits for Spark DataType/StructType JSON in Bun and browsers. Native objects cannot be
source authority: SPIKE-004 demonstrates normalization, property loss, parser mutation
and differing Python/JVM acceptance. Engine validity and runtime execution are separate.

## Representation and normative surface

The `umf.spark` 0.1.0 payload is `{profile:"spark-datatype-json",root:<NativeJson>}` at
module schema / element schema. spec/extensions/spark/schema.json describes the complete
envelope; datatype-schema.json describes recursive known source shapes and future forms;
package.json declares scope and evidence. Core NativeJson retains exact numbers and
unknown source content. Native field order and duplicate names MUST remain intact.

Known arrays require elementType/containsNull; maps require keyType/valueType/
valueContainsNull; structs require fields, whose name/type are required while nullable/
metadata may be absent. Metadata is a JSON object. Atomic/parameterized names are retained
as strings. Unknown spellings/object-form types remain uninterpreted instead of being
collapsed into a known type. The UDT form records class, pyClass, serializedClass and
sqlType when present; no classes or serialized code are executed. This grammar does not
claim full native semantic or class-resolution validation.

`importSparkSchema(text,{id})` parses bounded exact JSON and validates known shapes.
`exportSparkSchema(document)` renders current source JSON without inserting defaults or
normalizing type names/parameters. Unknown native properties survive; unknown envelope
or tagged-tree representation fields block export because they have no native JSON
location. UMF serialization retains those fields.

`getSparkNode(document,pointer)` returns a copied native node.
`proposeSparkNodeEdit(document,pointer,text)` replaces an existing node in a copied
candidate, validates it and returns document plus validation. Source MUST remain
unchanged. `inspectSpark` always includes native-unverified diagnostics, and identifies
unknown types/properties, metadata interpretation limits and opaque UDT declarations.
The registry's semantic hook checks the native tree's known structure and preservation
boundaries beyond the envelope; it does not assert engine semantics are fully checked.

## Interpretation and edit limits

Metadata values remain exact even outside JavaScript's safe-number domain. A temporary
host view checks container/property shape only; source export never uses it. Metadata
value types, collation providers/paths, parameter ranges, default SQL configuration,
coercion and UDT meaning require separate native verification. A renamed field can leave
uninterpreted collation/name references stale; edits preserve and report that uncertainty
rather than claiming safe automatic reference repair. Date/timestamp/interval/decimal
similarity to another extension is not evidence for core promotion.

## Validation evidence

The 49-case authored probe produces 47 accepted UMF imports and two known shape failures
(missing containsNull/valueContainsNull). All 47 exact sources survive both UMF formats.
Independent Python/JVM parsing of the exports reproduces all 94 baseline outcomes and
accepted re-emissions, including engine rejections. An authored nested decimal change
is confirmed by both runtimes. Native oracle input is copied before Python parsing to
avoid the collation mutation observed in SPIKE-004.

Bun tests cover exact max-int64/fractional metadata, unknown fields, UDT nonexecution,
source immutability, shape failures and representation guards. Chromium repeats all
49 outcomes and an edit without process/Buffer globals. Evidence is under fixtures/spark/;
versions are PySpark/JVM Spark 4.0.1. These are authored probes, not full conformance.

## Compatibility and remaining work

Native support claims MUST distinguish exact preservation, known profile shape and
engine/configuration validity. The API retains forms rejected by native parsers when
those forms fit the preservation grammar; retention is not engine support. Changes to
package/profile semantics require versioned compatibility review.

Upstream examples, UDT host contracts, DDL and Spark Connect, complete metadata/collation
and type-parameter validation, data coercion, cross-system projections and metadata
consumer demonstrations remain open. No domain concept is promoted to core here.

## Collation-aware field rename

`renameSparkField(document,{fieldPointer,name,uninterpretedMetadata:'preserve-and-report'})`
MUST select an actual StructField through known struct/array/map shapes. It returns
source, candidate document, validation, complete:false, renamedCollationPaths and
reference diagnostics, described by rename-result.schema.json. Positional selection
supports duplicate field names. Source and exact metadata remain unchanged.

The operation rewrites the selected field's `__COLLATIONS` keys only where they resolve
to string leaves through `.element`, `.key` and `.value`. Literal dots in the field name
are retained. Child structs own independent maps; parent rename MUST NOT rewrite them.
Unresolved keys/nonstring annotations MUST block. Empty new names with nonempty
collation maps also block conservatively: PySpark 4.0.1 drops nested collation paths
for empty names. Unknown providers and other metadata/external references remain
unverified and explicitly reported. Generic pointer edits still lack these repairs.

Twenty independently constructed native fixtures yield 17 renames confirmed by both
PySpark and JVM Spark 4.0.1 (34 comparisons), and three guarded empty-name cases.
Chromium reproduces 17 outputs and three guards. The oracle separately demonstrates
stale generic rename loss and empty-array-field collation loss. Fixtures include nested
struct/array/map fields, duplicate names, dotted/Unicode/prototype-like names and exact
int64 metadata. These authored schema checks do not establish data migration safety.

## Selected upstream Spark schema corpus

Spark v4.0.1 commit `29434ea766b0fc3c3bf6eaadb43a8f931133649e`
[`test_types.py`](https://github.com/apache/spark/blob/29434ea766b0fc3c3bf6eaadb43a8f931133649e/python/pyspark/sql/tests/test_types.py)
is pinned with its SHA-256 and Apache license/notice under native/spark/sources.
`scripts/spark-upstream.py` extracts 42 cases from four named schema JSON tests using
a restricted AST interpreter; it does not execute the test module or UDT classes.
Each fixture records its source function, line and file hash. The selected cases cover
12 collation constructions, 25 atomic/parameterized types and five negative examples.
This is a selected source corpus, not all Spark tests or all schema formats.

Forty-one cases retain exact JSON through UMF JSON/YAML in Bun and Chromium. The bad
provider example also contains a string-valued nullable property, which UMF rejects
as a shape error. Both native parsers accept 37 source cases and reject the remaining
five. All 82 native before/after comparisons for the 41 retained cases match, including
four negative collation cases. Python/JVM Spark 4.0.1 run with default configuration;
no SparkSession, dataset execution or UDT execution is involved. Evidence:
fixtures/spark/upstream-oracle-results.json and browser-results.json.

Run `.venv/bin/python scripts/spark-upstream.py --generate`,
`bun scripts/spark-upstream.ts`, then `.venv/bin/python scripts/spark-upstream.py`.
The conformance runner includes these stages. `tests/spark/upstream.test.ts` verifies
source preservation and the known shape failure (85 assertions). These checks extend
US-017-AC4; full metadata/configuration validation and cross-system transforms remain open.

## JVM metadata interpretation diagnostics

`inspectSpark` now checks exact native tokens at ordinary field metadata paths for
Spark JVM 4.0.1 interpretation boundaries. Out-of-int64 integer values receive
SPARK_METADATA_INT64_OVERFLOW; fractional/exponent values receive SPARK_METADATA_DOUBLE
or SPARK_METADATA_NONFINITE. Arrays receive specific warnings for mixed native
categories, unsupported null/nested-array element types, and empty-array int64 inference.
SPARK_FIELD_METADATA_WITHOUT_NULLABLE identifies the JVM field-shape rejection when
metadata is supplied but nullable is absent. Paths use JSON Pointer escaping.

These warnings MUST NOT normalize or reject retained source. Binary64 warnings indicate
potential precision/spelling changes, not proof that every flagged value loses numeric
precision. The field-local __COLLATIONS map is excluded from ordinary metadata checks
because the native parser extracts it separately. UDT contracts and unknown type shapes
remain uninterpreted. Native validity remains incomplete.

Twelve authored full-schema cases have exact UMF JSON/YAML round trips in Bun and
Chromium. The pinned JVM oracle accepts eight and rejects four, with unchanged outcomes
before/after UMF export. Native outputs prove positive/negative int64 overflow wraps,
9007199254740993.25 becomes 9007199254740994, and 1e400 becomes the string Infinity.
The rejected cases are mixed integer/double arrays, null arrays, nested arrays and
metadata without nullable. Source: pinned Metadata.scala and DataType.scala;
evidence: fixtures/spark/metadata-oracle-results.json and metadata-umf-results.json.

Run scripts/spark-metadata-oracle.py --generate, scripts/spark-metadata.ts under Bun,
and scripts/spark-metadata-oracle.py under the pinned Python environment. These stages
are included in conformance. This evidence strengthens US-017-AC2; it does not establish
complete metadata validation or data-execution semantics.

## Field-local collation interpretation checks

`inspectSpark` reports malformed maps/values, provider qualification, unresolved paths
and non-string targets with SPARK_COLLATION_MAP, VALUE, PROVIDER, UNRESOLVED and TARGET
warnings. Paths resolve only through the owning field's array/map structure; child
structs own separate maps. Empty field-name path construction follows the native parser
rule (no leading dot), exposing the known mismatch with generated `.element` keys.
Warnings MUST preserve source content and MUST NOT imply full provider catalog or
native validation. In particular, syntactically qualified but unknown collation names
remain covered by the broader SPARK_NATIVE_UNVERIFIED warning.

Fourteen authored cases retain exact source in UMF JSON/YAML, with 28 unchanged native
Python/JVM Spark 4.0.1 outcomes and Chromium parity. Both parsers accept then discard
stale paths, generated empty-name paths, and parent annotations targeting child fields.
JVM accepts and drops non-string values/null or array maps that Python rejects. Python
accepts an unknown collation name that JVM rejects. Both reject invalid providers and
annotations targeting non-string types. The native oracle asserts the exact acceptance
matrix and observed drops independently of UMF diagnostics.

Evidence: fixtures/spark/collation-oracle-results.json, collation-umf-results.json and
browser-results.json; implementation: src/adapters/spark/collations.ts. Conformance runs
spark-collations-oracle.py --generate, spark-collations.ts, then the native oracle.
These cases strengthen US-017-AC2 without changing import acceptance or source authority.

## Parameterized-type interpretation diagnostics

Known JSON type strings now receive warnings for decimal precision above 38, scale
above precision, negative scale requiring configuration, JVM int32 parameter overflow,
and non-increasing or cross-family interval ranges. Diagnostics retain the exact source
and leave validation incomplete. Whitespace accepted by the native decimal/character
JSON patterns is recognized without normalization. Zero precision/length is not rejected
by these checks: the pinned native schema parsers accept those authored examples.

Eighteen cases preserve exact source in both UMF formats and Chromium. PySpark 4.0.1
accepts all 18; JVM Spark 4.0.1 with default configuration accepts seven. All 36 native
before/after outcomes agree. A separate native configuration probe enables
spark.sql.legacy.allowNegativeScaleOfDecimal and confirms decimal(10,-2) then parses;
the setting is restored afterward. These are schema parsing observations, not data
execution or character-length enforcement claims. Python acceptance cannot establish
JVM compatibility or SQL execution validity.

Sources are pinned DataType.scala and DecimalType.scala (hashes in the native source
manifest). Implementation: src/adapters/spark/parameters.ts. Evidence:
fixtures/spark/parameter-oracle-results.json, parameter-umf-results.json and
browser-results.json. The conformance stages generate fixtures, run the Bun transform,
and compare native outputs. US-017-AC2 tests cover 74 assertions including nested paths.

## Directed Spark-to-Arrow projection

`projectSparkToArrow(source,policy)` takes id, timestampUtc, largeTypes,
rejectNestedDuplicates and lossPolicy (`strict` or `allow-reported-loss`). All options
are required; unknown options reject. The result has status, complete:false, copied
source/policy and issues, plus target only on projected status. The complete result
JSON Schema is spec/projections/spark-arrow.schema.json. Target is an umf.arrow.flatbuffer
Message/V5/Schema model under CONTRACT-016. Encoding is a separate explicit-backend step;
no dataset conversion or execution validity is implied.

The implemented schema lowering covers booleans, signed integers, floats, decimal128
with precision 1–38 and nonnegative scale no greater than precision, strings/binary
with explicit offset-size choice, date32, microsecond timestamps/durations, nullable
null, recursive arrays/maps/structs and Spark's tagged variant physical convention.
Unsupported spellings/types, UDTs, unknown native properties, extra source modules or
elements, non-nullable null, invalid interval ranges and selected nested duplicate-name
failures MUST block without a target. Negative decimal scale remains unsupported here
even though separate configured native parsing evidence exists. Native field defaults
are reported when made explicit.

Metadata/collation omission, restricted interval widening, timezone-free timestamp
ambiguity, timestamp_ntz recovery options and Spark-specific variant encoding MUST be
reported. Unknown UMF document/module/element/vocabulary context remains in source and
is reported; opaque native properties cannot be waived by allow-reported-loss. Strict
policy MUST block whenever any issue is reported. Retained-source recovery is distinct
from target-only recovery, which requires native options and may lose source semantics.
Result source is copied and never replaced by normalized native output. No semantic
concept is promoted into core by this mapping.

The full authored native matrix has 232 attempts: all 188 projected logical models
match independent PySpark 4.0.1/PyArrow 21.0.0 targets; all 44 native failures block.
Optional FlatBuffers encoding produces 188 schemas read and compared by PyArrow,
including metadata; 376 native recovery comparisons pass. Chromium independently
matches all projection outcomes/models and retained sources without Node globals.
Tests also cover strict loss rejection, unknown-property/UDT guards and context loss.
Evidence: fixtures/projections/spark-arrow/projection-results.json,
projection-oracle-results.json and browser-results.json. These fixtures are authored;
upstream projection corpora, further type/configuration coverage, general reverse
projection and data-level transforms remain required work.

## Directed Arrow-to-Spark projection

`projectArrowToSpark(source,{id,preferTimestampNtz,variant,lossPolicy})` accepts an Arrow
logical Schema or body-free Schema Message. Variant is explicitly spark-tagged-struct
or preserve-struct; lossPolicy is strict or allow-reported-loss. Unknown/missing policy
options reject. Result status, complete:false, copied source/policy, issues and optional
target conform to spec/projections/arrow-spark.schema.json. Target exists only when
projected; strict mode blocks every reported loss or representation change.

Known scalar and recursive shapes map to Spark JSON with explicit defaults. Arrow
metadata, dictionary encoding, offset/fixed-size layout, sorted-map indication,
endianness/features, timezone labels and nested child names cannot be assumed to survive;
applicable losses MUST be reported. Array element/map value nullability widens under the
pinned native recovery convention and MUST be reported. Timestamp recovery is controlled
by preferTimestampNtz; duration becomes a day-to-second interval. Exact source remains
available separately; target recovery is not a claim of semantic equivalence.

Spark variant recognition requires both an explicit policy and the canonical two-binary
field layout. A marker on a noncanonical struct blocks that interpretation, even where
the native heuristic might accept it. preserve-struct keeps the physical fields and
reports metadata omission. Unknown table properties, unsupported types/ranges, malformed
map/list layouts and opaque wire omissions block; waiver cannot silently erase them.
Native record conversion, full Arrow validity and general runtime compatibility remain
unverified. No core promotion follows from these mappings.

The matrix covers 376 reverse projections (188 source schemas × two timestamp choices).
All outputs match independent PySpark reference recoveries, and all 752 Python/JVM
reparse comparisons match those expected JSON schemas. Chromium executes the same
reverse matrix. Unit checks cover strict-mode losses, retained-source immutability,
unknown fields, malformed maps, unsigned types and explicit variant interpretation.
Evidence: fixtures/projections/spark-arrow/reverse-results.json,
reverse-oracle-results.json and browser-results.json. Broader reverse-only Arrow types,
upstream corpora and data transformation remain required coverage beyond this matrix;
implemented handling of additional physical layouts does not imply native verification.

## Arrow-origin reverse projection evidence

US-017-AC7 now includes 33 independently constructed PyArrow 21.0.0 schemas across both
timestamp recovery policies. Unlike the forward-generated matrix, these exercise fixed
and zero-length binary/list layouts, large lists, ordered dictionaries (including list
values), sorted maps, all four timestamp/duration units, named timezones, decimal32/64/
256, and explicitly unsupported types. Each schema carries field and schema metadata.
Raw schema bytes are hashed, captured, decoded and preserved through UMF JSON/YAML.

Of 66 attempts, 46 project and match native Python recovery plus JVM Spark 4.0.1 parsing;
20 block. Python rejects unsigned integer, half float, date64, time32/time64, list view,
run-end encoding and union examples. Python accepts oversized decimal256 and negative
scale but default JVM parsing rejects them, so this projection blocks those cases.
Zero-length fixed binary and fixed lists are valid; omitted FlatBuffer width/list-size
fields use zero defaults. Decimal32/64/256 with precision at most 38 and supported scale
now lower to Spark decimal with explicit ARROW_DECIMAL_WIDTH_LOSS. Physical-width
preservation is not implied. Existing dictionary/layout/nullability/timezone/metadata
losses are exercised by this native corpus.

All 46 emitted targets match expected native recovery and reparse through the JVM.
Chromium produces the same 46 projections/20 blocks without host globals. The focused
Bun test passes 166 assertions; typechecking passes. Evidence is in
fixtures/projections/arrow-spark/{native-results,results,oracle-results,browser-results}.json.
Conformance runs arrow-spark-extra.py, arrow-spark-extra.ts, then the Python --verify
phase. Browser execution uses arrow-spark-extra-browser.ts. This extends authored
schema coverage; upstream Arrow projection corpora, general data conversion and full
Arrow validity remain separate required work.

## Complete pinned upstream IPC reverse-projection corpus

US-017-AC7 now exercises schema recovery from all 182 binary inputs in the pinned
apache/arrow-testing integration subtree at commit
9ff285c88565f0f6abc855918c6a342e70e4909c. Source hashes are checked, first schema messages
are decoded, and each is projected under both timestamp policies. Full IPC source
preservation remains separately covered by the Arrow adapter corpus. Projection here
uses schema metadata; it does not convert records or change historical footer policy.

Of 364 attempts, native Python/JVM Spark 4.0.1 accepts 236. UMF projects 216 with matching
native expected schemas and JVM reparse evidence, and blocks 148. Twenty native-accepted
attempts are deliberately blocked because the schema contains reserved Arrow extension
annotations whose semantics are not mapped. These occur in generated_extension and
generated_custom_metadata cases. All other blocked attempts are native-incompatible.
Chromium matches the 216/148 outcome matrix and every emitted target.

The upstream run exposed a semantic defect: field metadata named ARROW:extension:name
or ARROW:extension:metadata was treated as ordinary metadata loss, allowing lowering of
the physical storage type. The arrow.uuid fixture made native behavior disagree. The
projection now MUST block either reserved annotation with ARROW_EXTENSION_UNINTERPRETED,
even under allow-reported-loss. It MUST NOT equate an extension with storage semantics.
Exact source remains retained; explicit extension-specific mappings are future work.
Dedicated tests cover both keys and retained-source recovery. Stale generated targets
for newly blocked cases are removed by the corpus runner.

Evidence: fixtures/projections/arrow-spark-upstream/native-results.json, results.json,
oracle-results.json and browser-results.json. Reproduce with arrow-spark-upstream.py,
arrow-spark-upstream.ts, then Python --verify; conformance includes these stages. Browser
checks use arrow-spark-upstream-browser.ts. Native version context is PyArrow 21.0.0 and
Spark 4.0.1 default JVM configuration. This proves the declared schema recovery behavior,
not full Arrow validity, general extension support or data-level interchange.
