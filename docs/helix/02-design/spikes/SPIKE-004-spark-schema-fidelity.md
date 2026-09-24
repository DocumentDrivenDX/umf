---
ddx:
  id: SPIKE-004
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-002
      kind: informed_by
---

# SPIKE-004: Spark schema JSON fidelity

## Objective

Determine whether Spark's native Python or JVM DataType object can be UMF's authoritative
schema representation, and identify preservation/validation boundaries before defining
umf.spark. This is a bounded native feasibility probe, not completion of the Spark
extension, its JSON Schema, or execution support.

## Hypothesis and approach

The hypothesis was that Python and JVM parsing/re-emission could be interchangeable
native oracles for schema JSON. Compare both implementations at Spark/PySpark 4.0.1 using
49 authored inputs: all 16 Python-mapped atomic names, parameterized decimals/characters,
intervals, collations, arrays/maps/structs, duplicate names, nested fields, exact integer
metadata, unknown properties and malformed/native-disputed cases.

The JVM oracle calls DataType.fromJson/json through an isolated local Py4J gateway;
it does not create a SparkSession, execute DataFrames or evaluate UDT code. It uses
unmodified default SQL configuration. Python input objects are deep-copied, compared
for mutation, and—when mutated—parsed again to test repeatability. Source/model equality
is structural JSON equality, not source spelling identity. UDT/custom-class execution,
DDL, data coercion, Spark Connect, table catalogs and upstream corpora are outside this
initial experiment.

## Findings

| Measurement | PySpark 4.0.1 | JVM Spark 4.0.1 |
| --- | --- | --- |
| Accepted authored inputs | 45/49 | 37/49 |
| Accepted inputs changed on re-emission | 4 | 2 |
| Inputs mutated during parsing | 2 | Not applicable to JSON-string interface |
| Mutated inputs rejected on a second parse | 2/2 | Not applicable |

Python accepts eight cases the JVM rejects: negative decimal scale under default
configuration, precision above 38, scale above precision, unknown collation name,
reversed year-month interval range, unknown struct property, unknown field property,
and mixed-type metadata arrays. These are implementation/configuration boundaries;
Python parse success alone cannot be advertised as Spark engine validity.

Both normalize bare decimal to decimal(10,0) and fill absent field nullable/metadata
defaults. Python additionally drops unknown struct/field properties. UMF must retain
the source rather than replacing it with either re-emitted native object.

Parsing collated fields and arrays mutates the supplied __COLLATIONS map, stripping
provider prefixes. Reusing that same input subsequently raises AssertionError. Parsing
a fresh copy works and native re-emission restores equivalent collation metadata.
This is direct evidence for copying inputs before calling the Python native oracle.

Both implementations retain the authored max-int64 metadata integer. A JavaScript
implementation must preserve that numeric token without rounding. Duplicate field
names are retained; names alone cannot identify fields unambiguously. Array/map value
nullability and field nullability remain separate semantics.

## Analysis and recommendation

The interchangeability hypothesis is rejected for this corpus. Represent Spark schema
JSON with core NativeJson, preserving exact numbers, unknown properties, collation maps,
order and explicit versus absent defaults. Native validation must declare Python/JVM
version and configuration separately. Do not promote Spark decimal, timestamp, interval,
nullability or collation concepts to core merely because another adapter uses similar
names.

Define the Spark extension package/JSON Schemas and typed navigation/candidate edits
next, with independent native expected outcomes and guarded conversions. Validate known
shape separately from configuration-dependent native semantics. Keep UDT declarations
as data unless a future explicit execution contract supplies trusted implementations.
Cross-system projections must account for Spark coercion, timezone/configuration,
collation and metadata restrictions; no equivalence has been established by this probe.

## Evidence and reproduction

Run `.venv/bin/python scripts/spark-capabilities.py`. Dependencies are pinned in
scripts/oracle-requirements.txt: pyspark 4.0.1 and py4j 0.10.9.9. This environment used
Java 27; no claim of Spark application-runtime compatibility with that JDK follows from
schema-only calls. The script closes the gateway and process and asserts the current
acceptance/mutation baseline. Cases and per-runtime outputs/errors are under
fixtures/spark/. The report includes the installed Python types.py SHA-256.

Pinned primary sources, LICENSE and NOTICE are under native/spark/sources/ with hashes.
They come from Apache Spark v4.0.1 commit 29434ea766b0fc3c3bf6eaadb43a8f931133649e:
[Python types](https://github.com/apache/spark/blob/29434ea766b0fc3c3bf6eaadb43a8f931133649e/python/pyspark/sql/types.py),
[JVM DataType](https://github.com/apache/spark/blob/29434ea766b0fc3c3bf6eaadb43a8f931133649e/sql/api/src/main/scala/org/apache/spark/sql/types/DataType.scala),
and [Metadata](https://github.com/apache/spark/blob/29434ea766b0fc3c3bf6eaadb43a8f931133649e/sql/api/src/main/scala/org/apache/spark/sql/types/Metadata.scala).

## Limits and next deliverables

The 49 cases are authored probes, not upstream conformance. No public Spark package,
browser implementation, JSON Schema, native round-trip adapter, transform or consumer
integration is delivered by this spike. Required follow-up remains the full extension
cycle in the implementation plan; existing Arrow and other ecosystem gaps remain open.

## Rename evidence

PySpark 4.0.1 stores collation keys relative to the owning field name, traversing arrays
and maps but not child structs. Renaming JSON name alone leaves stale keys and native
parsing loses the collation. Independently generated empty-name array annotations
(`.element`) are also lost on Python reparse. The dedicated UMF rename repairs known
paths and conservatively blocks empty collated names. Seventeen authored candidates
match independent native constructions in both runtimes; three empty collated names
are guarded. See fixtures/spark/rename-oracle-results.json. Provider completeness and
data-level effects remain unverified.

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

## Spark-to-Arrow native projection matrix

The next cross-system transform is grounded in PySpark 4.0.1's pinned pandas/types.py
conversion functions and PyArrow 21.0.0. `scripts/spark-arrow-probe.py` constructs 29
representative schemas across all eight combinations of timestamp_utc,
prefers_large_types and error_on_duplicated_field_names_in_struct. Each target is
recovered under both prefer_timestamp_ntz settings. This executes native schema
conversion only; it does not implement the TypeScript projection or run data pipelines.

Of 232 attempts, 188 produce independently readable serialized Arrow schemas and 44
reject. Unsupported year/month and calendar intervals, char/varchar, a non-nullable
null field, and strict nested-duplicate checks account for all rejections. Nullable
null succeeds. Strict duplicate checking does not reject duplicate top-level fields.

Target-only recovery drops ordinary metadata and collations, widens a day-only
interval to a day-to-second interval, and can change timestamp/NTZ meaning depending
on options. Variant's tagged physical struct recovers in this pinned implementation;
that encoding must remain Spark-specific, not be promoted as a universal variant.
Large-string/binary selection and UTC handling must be explicit projection options.
Per-case recovery JSON and changed paths are recorded; these structural differences
are evidence inputs, not a complete semantic-equivalence proof.

`scripts/spark-arrow-capture.ts` verifies exact JSON/YAML retention for all 29 Spark
sources and 188 Arrow targets, checks target SHA-256, and decodes each schema message
through UMF's Arrow FlatBuffer model. `spark-arrow-browser.ts` repeats preservation and
decoding in Chromium without process/Buffer globals. Typechecking passes. Evidence is
under fixtures/projections/spark-arrow/. Native conversion and capture stages are wired
into conformance; the browser script uses UMF_CHROMIUM_PATH where required.

Next implementation requirements: explicit option contract; preserved source plus
target and per-concept loss report; browser-native forward mapping compared against
these targets; target-only recovery distinguished from retained-source recovery;
unknown source properties and UDT contracts guarded rather than silently discarded.
No shared concept is promoted to core by this experiment. Data-level fidelity and
additional Arrow types remain separate required work.

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
