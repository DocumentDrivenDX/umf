---
ddx:
  id: SPIKE-005
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
    - id: CONTRACT-017
      kind: informed_by
---

# SPIKE-005: Delta schema and protocol preservation

## Objective

Determine whether Delta can reuse Spark's source representation unchanged, and whether
a native Delta schema object preserves enough meaning to be the interchange authority.
This is a native discovery experiment for the next physical-data extension, not an
implemented Delta package or a complete protocol-conformance claim.

## Hypothesis and method

Delta shares much of Spark's recursive JSON type syntax, but requires independent
schema and table-context contracts. Test deltalake 1.6.4 (delta-rs Python bindings) and
arro3-core 0.8.3 with 38 authored schema cases plus the pinned protocol's schema example.
Create two temporary local tables, add a check constraint, inspect emitted log actions,
and attempt violating writes. No user tables or remote storage are modified.

The protocol is pinned at delta-io/delta commit
3b1b99cd077ec9c84c8a94c250dea3730cc33392; PROTOCOL.md, LICENSE.txt and SHA-256 manifest
are in native/delta/sources. Runtime versions are pinned in scripts/oracle-requirements.txt.
The protocol snapshot and native runtime are independently versioned; acceptance by this
runtime is not proof of support for every feature in the protocol snapshot.

## Findings

| Probe | Evidence | Consequence |
| --- | --- | --- |
| Native schema parsing | 29/39 accepted, 10 rejected | Source grammar and native validity must remain separate |
| Unknown schema properties | Root/field properties disappear on native re-emission | Native objects cannot be source authority |
| Missing map valueContainsNull | Native parser inserts true | Exact source must retain absence |
| Missing field defaults/array nullability | Native rejection | Spark and Delta shape acceptance differ |
| Duplicate/case-only duplicate names | Native rejection | Names require Delta-specific validation |
| Unknown nested metadata and integer above int64 max | Native schema JSON retains them | Do not coerce metadata through JavaScript numbers |
| Column mapping, identity, generated/default metadata | Retained by schema parser | Retention does not establish feature/configuration validity |
| delta.invariants | Native binding extracts expression | Expression text must remain authoritative; no browser evaluation inferred |
| Day-to-second interval | Native schema accepts and lowers to Arrow int64 | Do not infer equivalence with Spark's Arrow duration mapping |
| Variant | Native Arrow struct order is metadata,value | Do not reuse the Spark value,metadata lowering without an explicit convention |

The two local native tables each contain two rows, and both reject an append with
id=-1 after adding the positive_id constraint. The partitioned table's resulting
protocol uses reader 1/writer 3. The timestamp_ntz table uses reader 3/writer 7 with
reader feature timestampNtz and writer features checkConstraints, appendOnly and
timestampNtz. Constraint SQL is in metaData.configuration; schemaString alone does not
encode its enforcement or the required protocol features. Partition columns and
append-only configuration likewise remain table context.

## Decision and implementation requirements

The native-object-as-authority hypothesis is rejected. Reuse core NativeJson as an exact
representation mechanism, not the Spark extension identity or semantic contract.

1. Define umf.delta with separately identifiable schema JSON and table metadata/protocol
   profiles. Preserve embedded schemaString exactly as supplied, alongside all unknown
   native keys and future table features. Package and profile JSON Schemas must be complete.
2. Separate known structural checks, Delta name/type checks, protocol/feature consistency,
   and actual read/write support. Report unknown features rather than silently lowering.
3. Preserve column mapping IDs/physical names, invariants, defaults, generated columns,
   identity/type-change metadata and table configuration. Edits must identify dependent
   metadata and protocol requirements before claiming safety.
4. Distinguish captured transaction-log actions from a reconciled snapshot. These fixture
   logs are examples, not self-contained tables: referenced data files are not included.
5. Test exact JSON/YAML round trips, immutable browser edits, native export/reparse,
   real log examples, and metadata/protocol-aware transforms. Add source-backed upstream
   corpora before claiming broad support. Never execute opaque SQL while parsing metadata.

No semantic concept is promoted into core from syntax similarity. Delta adapter schemas,
implementation, browser execution and projection tests remain next work.

## Reproduction and limitations

Run `.venv/bin/python scripts/delta-capabilities.py` and
`.venv/bin/python scripts/delta-table-probe.py`. Evidence is under fixtures/delta/:
capability-results.json, original per-case JSON, and tables/results.json plus raw native
commit logs. Native log IDs/timestamps/file paths change on regeneration; the checks
assert schema, configuration, protocol and write outcomes rather than random identifiers.

This does not test all Delta features, Spark's Delta connector, checkpoints, deletion
vectors, catalog protocols, snapshot reconciliation or cross-system projections.
Python/Rust dependencies are development oracles only. The intended public implementation
remains TypeScript usable in Bun and browsers under ADR-002.

## Column-mapping consistency diagnostics

For columnMapping.mode name/id, inspectDeltaTable now checks the pinned reader/writer
version and feature requirements, exact signed-int32 field IDs, current-schema ID and
physical-path uniqueness, physical names, and the declared maximum ID. Both mode families
require field IDs and physical names even though their data-resolution rules differ.
Mode none remains separate; future modes are reported uninterpreted.

Physical paths are arrays of names, with element/key/value components only for array/map
traversal. Literal dots in names never become separators. Every struct field is checked,
including parents and nested fields. A physical path whose parent mapping is missing is
not guessed. Duplicate IDs are global within the current schema; repeated leaf physical
names under distinct parent paths are not automatically collisions. Maximum-ID comparison
uses exact tokens/BigInt and accepts leading zeroes in its configuration string.

All findings are preservation-compatible warnings. DELTA_MAPPING_HISTORY_UNVERIFIED
explicitly excludes historical path uniqueness, monotonic maximum-ID evolution, data-file
field IDs, partition-file resolution and safe rename/write claims. A supplied pair cannot
prove those properties. No IDs or physical names are generated or repaired automatically.

Eight native fixtures derive their nested mapped schema from the pinned protocol example:
name/id modes under legacy and feature protocols, duplicate ID, missing physical name,
maximum below assigned IDs, and insufficient protocol. deltalake 1.6.4 rejects duplicate
ID and missing-name cases but loads the latter two inconsistent cases. UMF reports all
four classes independently of native load success. All eight source contexts round-trip
through JSON/YAML, native outcomes remain unchanged after export, and Chromium reproduces
the diagnostics. Evidence: fixtures/delta/mapping/{native-results,results,oracle-results}.json
and fixtures/delta/table-browser-results.json. Conformance includes fixture generation,
Bun preservation checks and native reparse. Actual mapped data files remain future work.

## Mapped logical-field rename candidate

`renameDeltaMappedField(source,{fieldPointer,name,uninterpretedReferences:'preserve-and-report'})`
selects an actual StructField by positional JSON Pointer inside the embedded schema.
Name must be nonempty. Mapping mode must be name/id and its known context diagnostics
must pass. The function returns copied source, candidate document, complete:false,
partitionUpdates, validation and external-state diagnostics. The complete result schema
is spec/extensions/delta-table/rename-result.schema.json.

Only the logical field name changes. Existing physical names/IDs, maximum-ID property,
protocol and other metadata MUST remain unchanged. For a top-level field, exact matching
partitionColumns references are updated. Nested fields are traversed through known
struct/array/map shapes; metadata lookalikes are not eligible. Changed schemaString is
reserialized with exact tokens; unchanged original text remains in result.source.

Candidate collisions and invalid mapping/partition context block. Constraint/clustering
configuration and column invariant/generated/default expressions block rather than being
rewritten heuristically. Feature-era candidates currently allow only columnMapping and
appendOnly declarations; other feature contracts need explicit work. Unknown storage
providers block. Other uninterpreted references require the caller's preserve-and-report
policy and remain explicitly unverified. No transaction commit, data migration, historical
mapping proof or concurrency check is performed; this API returns a reviewable candidate.

Two authored mapped tables contain physical Parquet columns with field IDs and a partition
resolved through its physical name. Native deltalake 1.6.4 DataFusion scan() verifies two
rows per table before/after three renames (top-level data, partition and nested data),
for both name/id modes. The UMF candidates produce the same records as independently
constructed native expected metadata. Parquet SHA-256 remains unchanged. Chromium
reproduces all six candidates, including retained-source immutability.

A material oracle distinction: deltalake 1.6.4 to_pyarrow_table() returned nulls for mapped
data columns in these fixtures, while scan() resolved them correctly. Therefore the
native data claim is explicitly for DataFusion scan(), not every library reader path.
Both observations remain in fixtures/delta/mapped-data/native-results.json. Candidate
verification is in rename-oracle-results.json; raw Parquet/context/add fixtures are kept
for reproduction. Conformance runs mapped-data-probe, mapped-rename and the native oracle.
Broader mapped schemas, expression rewriting, feature combinations and upstream mapped
corpora remain required work before broader safe-evolution claims.

## Nested mapped-data rename coverage

US-018-AC7 now includes four additional real-data fixtures: name/id mapping crossed
with legacy reader 2/writer 5 and feature-based reader 3/writer 7. Each table has an
array of structs and a map with struct values, with field IDs stored in physical Parquet
metadata. Three logical renames per table change the array parent, a field inside array
elements and a field inside map values. Physical names, IDs, maximum ID and protocol
remain unchanged; these tables have no partition references to update.

Each fixture has four rows spanning null and empty containers, null array elements,
null map values, null nested scalar values, multiple map entries and both int64 extremes.
The independently constructed native expected rename and the public UMF candidate each
produce the expected values through deltalake 1.6.4 DataFusion scan(). Python comparisons
retain the exact int64 values; JavaScript fixture loading is not used as data authority.
All four Parquet SHA-256 values remain unchanged after applying candidate metadata.

The twelve candidates preserve their source and survive UMF JSON/YAML serialization.
Chromium reproduces each candidate without host globals. These cases supplement the
six earlier top-level/partition/struct renames; they do not establish concurrent commit
safety, history-wide ID uniqueness or arbitrary expression rewriting.

Evidence and physical fixtures are in fixtures/delta/mapped-nested/. Reproduce with
scripts/delta-mapped-nested-probe.py, scripts/delta-mapped-nested.ts and
scripts/delta-mapped-nested-oracle.py. Conformance includes these stages; the existing
delta-table-browser.ts covers both rename corpora. Tests reside in
 tests/delta/mapped-nested.test.ts. Further upstream mapped tables, map-key structs,
feature interactions and data evolution beyond renaming remain required work.

## Upstream Delta log metadata corpus

All 307 JSON blobs under delta-rs _delta_log directories at commit
90b904ede68627c2450007034d9724c043f1a66b are pinned with LICENSE.txt under
fixtures/delta/upstream/. The manifest records Git blob IDs, byte lengths, SHA-256 and
repository paths. The fetcher verifies the complete recursive Git tree is not truncated.
Error fixtures are included; data and checkpoint files are excluded. Re-fetch is explicit
via scripts/delta-upstream-fetch.py, not part of ordinary conformance.

The checked corpus yields 77 schema strings and 64 contexts with exactly one metadata
and one protocol action in the same JSON commit file. Extraction does not reconcile state
across commits or infer omitted actions. All 307 files parse; 140 extracted cases survive
UMF JSON/YAML. The delta-live-table initial context lacks schemaString and fails the known
required shape. Its raw source remains archived. Native JSON output preserves exact tokens
and unknown fields; outer formatting is canonicalized, while embedded schemaString content
and original raw log bytes remain preserved in their respective representations.

Deltalake 1.6.4 accepts all 77 extracted schemas and 57 of 64 metadata-only contexts.
The seven rejected contexts are native error/feature fixtures and the missing-schema
context. All 140 exported cases reproduce original native observations, including six
native-rejected but structurally preservable contexts. Temporary metadata-only tables
compare schema, configuration, partition columns and protocol/features; these are not
reads of the original full upstream datasets. Chromium repeats all 140 round trips and
the required-shape rejection. The focused test passes 286 assertions; typechecking passes.

Evidence: upstream/results.json, oracle-results.json and browser-results.json. The
conformance stages delta-upstream.ts and delta-upstream-oracle.py verify hashes and
pinned outcome counts; delta-upstream-browser.ts provides browser evidence. Raw files
are explicitly independent of an implemented general log-action adapter. Log capture,
checkpoint parsing and snapshot reconciliation remain required work, as do broader
cross-system transforms and data-evolution guarantees.

Whole-source capture now uses umf.delta.log (US-018-AC9). All 307 pinned upstream files
round-trip with identical SHA-256 in JSON/YAML. Of 1,725 lines, one _autostats source is
not an action envelope and is preserved with an explicit diagnostic. Native action
payload interpretation and snapshot reconciliation remain open; source capture does not
justify promoting Delta execution concepts to core. See CONTRACT-018 for exact bounds.

The pinned protocol's Actions section now grounds schemas for all ten named actions and
known deletion-vector fields. It expressly allows arbitrary JSON in commitInfo, correcting
an initial object-only assumption in envelope inspection. Known field checks accept 305 of
307 upstream source files; the other two expose the _autostats envelope and missing-schema
fixtures. Python jsonschema independently agrees. These checks do not establish native
commit acceptance or feature-dependent validity. See US-018-AC10 and CONTRACT-018.

Ordinary-commit replay now has native evidence across six authored versions (AC11).
Deltalake 1.6.4 confirms latest transaction occurrence wins when an application's version
decreases from 9 to 2. Reopening UMF-reconciled action state yields matching active paths,
physical rows, protocol, metadata and exact application versions, including int64 maximum.
This is action-state evidence; feature completeness, DV data decoding, checkpoints and
full transaction validation remain open. See CONTRACT-018 and fixtures/delta/history/.

AC12 expands reconciliation evidence to all 303 ordinary-commit prefixes from 59 upstream
histories. UMF returns 278 action states and 25 explicit blocks. Native observations agree
for 257 successfully loaded original/lowered pairs; 21 more pairs agree only on rejection.
A native-accepted later delta-live-table version still fails the stricter UMF history
profile because initial metadata lacks schemaString. This is a documented profile limit,
not grounds to discard invalid historical source. Chromium matches every state/error.
See CONTRACT-018 for observation scope; upstream data and checkpoint files are absent.

AC13 verifies a native V2 JSON checkpoint with embedded file actions at version 10 and no
earlier JSON commits. Native recovery and two later commits match UMF-lowered action state
on actual rows, paths and exact transaction versions. Both existing upstream JSON checkpoints
use Parquet sidecars; the current reader preserves them and blocks unresolved dependencies.
This establishes embedded-JSON recovery only. Full Parquet/sidecar/multipart checkpoint
coverage remains open. See CONTRACT-018 and fixtures/delta/checkpoint/.

## Parquet checkpoint decoder experiment (AC14)

fixtures/delta/checkpoint-upstream pins every Parquet blob and _last_checkpoint file under
_delta_log at delta-rs 90b904ede68627c2450007034d9724c043f1a66b, plus LICENSE.txt: 60 files,
752,194 bytes. The 35 Parquet files contain 991 rows; 24 files contain last-checkpoint
metadata. The fetcher checks an untruncated recursive tree, Git blob identity, lengths and
SHA-256. Network fetch is explicit, not ordinary conformance.

[Hyparquet](https://github.com/hyparam/hyparquet) provides a JavaScript Parquet reader with
browser use and custom type parsers. Version 1.31.1 is pinned as a development dependency,
with Bun lock integrity. Its installed src/convert.js converts DECIMAL using Number and
10 ** -scale; default timestamp parsers use millisecond Date values. Neither is acceptable
as an unqualified exact-value decoder. The experiment supplies timestamp-unit/integer
callbacks and disables heuristic unannotated BYTE_ARRAY UTF-8 decoding.

PyArrow 21.0.0 independently decodes all 35 files into typed expected values. The initial
JS experiment matches 33; two files differ in 22 decimal cells, e.g. native -5.67800 becomes
JS -5.678000000000001. Results remain recorded in hyparquet-results.json and typed/*.hyparquet.json.
The exact-decimal experiment removes decimal conversion annotations only from a transient
reader metadata view, decodes physical integer/byte storage, reconstructs signed unscaled
BigInt values and reapplies scale as text. Original binary sources remain untouched.
All 35 files then match native values. Snappy and uncompressed codecs occur in this corpus.

Four authored Parquet fixtures add positive/negative maxima, zero, null values and null
structs for INT32, INT64, fixed128 and fixed256 decimal storage, up to 70 digits. Expected
values use native Decimal fixed-point formatting; zero exponent spelling is normalized
without rounding. All 20 rows match. Chromium repeats all 39 files/1,011 rows and verifies
binary hashes with no Node globals. The focused Bun test passes 80 assertions.

The implementation remains under scripts/experiments/checkpoint-parquet-decoder.ts and is
not exported by the UMF library. Decimal paths within repeated/list/map structures are
explicitly rejected pending assembly evidence. Native map conversion checks unique string
keys for this corpus; this does not establish arbitrary map preservation. Tagged trial
values are an evidence format, not a general Parquet/UMF schema or serialization contract.
Binary source envelopes, bounded decoding, complete logical types, sidecar binding,
checkpoint assembly and public integration remain required work.

Reproduce with delta-checkpoint-upstream-fetch.py (explicit fetch),
delta-checkpoint-parquet-probe.py, delta-checkpoint-parquet-probe.ts (default and --exact),
and delta-checkpoint-parquet-browser.ts. Reports, native schemas and typed vectors are in
fixtures/delta/checkpoint-upstream/. The three local native/Bun probe stages run in conformance.
