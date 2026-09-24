---
ddx:
  id: CONTRACT-018
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-018
      kind: informed_by
    - id: SPIKE-005
      kind: informed_by
---

# CONTRACT-018: Delta schema preservation

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose and scope

Expose exact Delta schema JSON, known shape validation, copied access and candidate
edits in Bun/browser TypeScript. Schema JSON is authoritative; native objects normalize
and discard content (SPIKE-005). This profile does not contain table protocol/configuration
and cannot establish read/write compatibility. Those require a separate Delta profile.

## Normative surface

umf.delta 0.1.0 stores `{profile:"delta-schema-json",root:<NativeJson>}` in module schema,
element schema. spec/extensions/delta/schema.json describes the complete payload;
datatype-schema.json describes known recursive source shapes and opaque future types;
package.json declares evidence and scope. Native numbers MUST remain exact tokens.

The root MUST be a struct with fields. Known fields require name/type/nullable/metadata;
metadata is an arbitrary JSON object. Arrays require elementType and containsNull.
Maps require keyType/valueType; valueContainsNull may be absent and MUST NOT be inserted
on round trip. Unknown native properties and type spellings/object forms remain data.
This preservation grammar does not assert native or protocol support for unknown forms.

`importDeltaSchema(text,{id})` parses bounded exact JSON and validates known shapes.
`exportDeltaSchema(document)` renders the authoritative tree without normalization.
Unknown payload/tagged-tree representation fields MUST block native export rather than
being lost; UMF serialization retains them. `getDeltaNode(document,pointer)` returns a
copy. `proposeDeltaNodeEdit(document,pointer,text)` atomically edits a copied candidate
and validates known structure before returning document and validation.

`inspectDelta` always reports DELTA_CONTEXT_UNVERIFIED. It reports unknown properties,
unknown types, case-insensitive duplicate names, decimal range concerns, absent map
nullability defaults, void write-context restrictions and feature-dependent timestamp_ntz/
variant types. Metadata receives interpretation warnings; SQL expressions and opaque
content MUST NOT execute. Name comparison uses JavaScript lowercase as an advisory check,
not a complete cross-runtime Unicode name-equivalence proof. Native validity stays
complete:false; warnings do not discard or reject otherwise preservable source.

## Compatibility and validation

Profile semantics are independent of umf.spark despite shared syntax. Core NativeJson
is a representation mechanism, not evidence of semantic equivalence. Native oracle:
deltalake 1.6.4; protocol snapshot:
3b1b99cd077ec9c84c8a94c250dea3730cc33392. No shared concept is promoted to core here.

Thirty-nine probe sources include the pinned protocol example. Thirty-seven structurally
valid inputs round-trip exactly through both UMF formats; two shape-invalid inputs reject.
Native parsing reproduces all 37 outcomes and accepted re-emissions, including eight
native rejections. A nested integer-to-long candidate reparses as independently expected.
Bun checks exact large integer metadata, copied access, source immutability, shape
failures and representation guards. Chromium repeats all outcomes and the edit without
process/Buffer globals. Evidence: fixtures/delta/{umf-results,umf-oracle-results,
browser-results}.json and tests/delta/schema.test.ts (122 assertions).

## Remaining boundaries

Generic edits do not repair dependent expressions, physical mapping or protocol features.
The retained metadata warning MUST NOT be interpreted as safe table evolution. Table
metadata/protocol, snapshot reconciliation, logs/checkpoints, upstream coverage, robust
metadata-aware transforms and cross-system projections remain required work.

## Table metadata/protocol context profile

The separately identified umf.delta.table 0.1.0 package stores
`{profile:"delta-table-context",root:<NativeJson>}` in module table/element table.
Its complete payload, source context and package schemas are under
spec/extensions/delta-table/. The supplied native context is `{protocol,metaData}`:
it is an explicit pairing, not a transaction-log action or a reconciled snapshot.
Unknown root/action properties and feature names MUST remain exact data.

Protocol requires positive integer minReaderVersion/minWriterVersion and permits string
arrays readerFeatures/writerFeatures. Metadata requires id, format, schemaString,
partitionColumns and configuration; optional names/descriptions/createdTime and future
properties survive. Embedded schemaString remains a string, including its internal
whitespace and escaping. Reading its parsed schema MUST NOT replace this authority.
Configuration/format-option maps retain string/null values; native acceptance remains
separate. IDs are retained strings, not a claim of GUID validation.

`importDeltaTable(text,{id})`, `exportDeltaTable(document)`, `getDeltaTableNode`,
`proposeDeltaTableNodeEdit` and `inspectDeltaTable` follow the exact-tree/copy/atomic-edit
rules of the schema profile. `getDeltaTableSchema(document)` parses an independent
umf.delta schema view and can fail when the embedded string is invalid. Malformed or
unsupported embedded schema strings remain exportable table-context source and receive
DELTA_EMBEDDED_SCHEMA warnings. Unknown representation fields block native export.

Inspection reports known list/version mismatches, duplicate features, reader features
missing from writer declarations, future protocol versions, uninterpreted features and
configuration, unknown provider/properties, unmatched/duplicate partition names and
missing timestampNtz declarations. Embedded schema diagnostics are qualified by their
location within schemaString. These checks are incomplete and MUST NOT imply client
capability, protocol validity, SQL enforcement or safe table evolution. Unknown future
protocol versions use pinned-version diagnostic rules without interpreting future rules.

Evidence: two native table contexts round-trip exactly in both formats and reopen as
metadata-only native tables with matching schemas, configuration, partitions and protocol
versions/features. Chromium repeats both contexts and edits plus future-feature retention.
Tests cover exact int64 creation time, embedded spelling, malformed embedded schemas,
feature/partition warnings, immutable edits and representation guards. Results are in
fixtures/delta/table-{results,oracle-results,browser-results}.json. The development native
oracle is deltalake 1.6.4. Captured contexts do not include data-file sets; these checks do
not establish record-level equivalence or recover a complete original table.

Dependency-aware table changes, full feature consistency, action capture/reconciliation,
checkpoints and projections remain required. No shared Delta/Spark semantic promotion is
made by adding this representation.

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

## Complete JSON-lines source capture (US-018-AC9)

umf.delta.log 0.1.0 defines a separate delta-jsonl-source package in
spec/extensions/delta-log/. Its authoritative text preserves whole source, including
formatting and malformed lines. The browser-safe capture/export/inspection functions
retain unknown actions and exact numeric tokens. Inspection parses action envelopes only;
complete remains false. Limits are 1,000,000 UTF-16 code units for capture and 10,000 lines
for inspection. Offsets use UTF-16, and end excludes the stored LF/CRLF terminator.
Blank/empty source is diagnosed but does not itself make parsedAll false; parse errors,
invalid envelopes and the inspection limit do. Unknown representation fields block native
export while remaining serializable in UMF. No action editing or commit API is supplied.

All 307 pinned upstream files preserve their original SHA-256 through both UMF JSON and
YAML. The 1,725 lines contain 1,724 parsed envelopes and one non-envelope: the checkpoint-v2
_autostats file. This file was selected by the broad upstream corpus predicate; it remains
captured unchanged with DELTA_LOG_ACTION_ENVELOPE. No blank or unknown-action lines occur
in this corpus. Authored tests cover unknown actions, duplicate keys, malformed lines,
multiple action keys, scalar known-action payloads, empty input, CRLF, Unicode, numeric
extremes, unknown representation fields and inspection/capture limits.

Reproduce with scripts/delta-log-upstream.ts and scripts/delta-log-browser.ts; reports
are fixtures/delta/upstream/log-results.json and log-browser-results.json. The Bun script
is wired into conformance. These results establish source capture, not complete action
payload schemas, checkpoint decoding, snapshot reconciliation or native transaction validity.

## Known action field inspection (US-018-AC10)

spec/extensions/delta-log/action-schema.json describes add, remove, cdc, txn, protocol,
metaData, commitInfo, domainMetadata, sidecar and checkpointMetadata. It also describes
known deletion-vector descriptor fields. Unknown actions and properties remain permitted
and uninterpreted. Optional native fields accept observed null encodings where represented
by the preservation grammar. commitInfo accepts arbitrary JSON, as expressly allowed by
the pinned protocol; the earlier envelope inspector's object-only restriction is removed.

inspectDeltaActions returns the copied source and line inspection plus knownShapesValid
and diagnostics. action-inspection.schema.json describes this result. Structural checks
use a temporary JS view; exact integer checks operate separately on original numeric
tokens. Declared Int fields require signed int32 values, Long fields signed int64 values;
exponent/fraction spellings are diagnosed for these native integer fields. int64 is an
additional format obligation; generic JSON Schema validators that ignore formats cannot
establish its bounds. Source tokens are never normalized. Unknown field diagnostics do
not invalidate known shapes. All inspection results remain complete:false.

The 307 upstream files yield 305 accepted known shapes and two diagnostic cases: the
already identified _autostats non-envelope and delta-live-table metadata missing
schemaString. Independent Python jsonschema validation agrees on all 307 files. This is
an independent structural oracle, not a new native Delta runtime test. Chromium compares
all action-inspection diagnostics and repeats exact source hash checks. Authored tests
include signed int64 extremes, adjacent overflows, fractional values hidden by JS rounding,
large exponents, malformed known actions, arbitrary provenance and future content.

Reproduce with scripts/delta-action-upstream.ts, scripts/delta-action-oracle.py and
scripts/delta-log-browser.ts. Evidence is upstream/action-results.json,
action-oracle-results.json and log-browser-results.json. Shape inspection does not enforce
cross-field feature/version obligations, extended-remove dependencies, URI validity,
embedded stats/schema semantics, DV content/offset relationships, checkpoint placement,
action uniqueness, history or transaction validity. These remain necessary downstream
work; this grammar is not a complete Delta protocol validator.

## Ordinary-commit action reconciliation (US-018-AC11)

reconcileDeltaCommits accepts at most 10,000 explicit `{version, source}` entries.
Versions must be canonical decimal strings in ascending contiguous order starting at
zero; each source uses umf.delta.log. No filenames, omitted versions, checkpoints,
compactions or external state are inferred. The JSON result schema is
spec/extensions/delta-log/reconciliation.schema.json. Blocked results contain all copied
sources and diagnostics but no state. Successful results use status:reconciled and retain
complete:false: this means action reconciliation succeeded, not full Delta support.

Version zero must establish metadata and protocol. Known action shapes and exact integer
checks must pass. Blank lines, checkpoint actions, duplicate protocol/metadata actions,
repeated application/domain keys or repeated add/remove paths within one commit block.
An add and remove for the same logical-file identity in one commit also block rather than
selecting an arbitrary line order. Replacing a live path's DV requires removal of its prior
logical identity. Add/remove sets apply independently of their order in a commit.

Latest metadata/protocol actions replace earlier ones. The latest txn occurrence wins even
if its application version decreases. Domain removals suppress prior domain values. Active
files retain latest adds by encoded path and logical DV identity; removals are retained by
(path,DV identity), and re-adding the same logical file removes its tombstone. DV identity
uses storageType, pathOrInlineDv and optional numeric offset as specified by the protocol.
No expiry policy is applied. commitInfo is retained only for the target commit. CDC and
unknown actions remain in deferred entries with version and line provenance; every original
source remains available. No action, field or source is discarded from the result.

Six authored versions are read by deltalake 1.6.4 DataFusion scan, then independently read
again after UMF state is lowered to temporary initial logs. Active file paths/rows, protocol,
metadata name/description and application transaction versions agree at every version.
Cases cover file removal/re-addition, an add metadata update, metadata/protocol replacement,
transaction rollback from 9 to 2 and exact int64 maximum. Both Parquet files retain SHA-256.
Authored tests additionally check gaps, duplicate keys, missing initial context, checkpoint
rejection, DV replacement/set order, domain removal, deferred actions and tombstone suppression.
DV/domain cases currently have authored expected-vector evidence, not native data-read proof.
Chromium reproduces all six states and source JSON/YAML round trips and rejects a gap.

Evidence and physical files reside in fixtures/delta/history/. Reproduce with
scripts/delta-reconcile-probe.py, delta-reconcile.ts, delta-reconcile-oracle.py and
delta-reconcile-browser.ts. These checks do not validate all transaction rules, reader/writer
feature support, encoded URI aliases, DV bytes, tombstone retention, checkpoint recovery or
concurrent writes. General upstream histories and feature interactions still require tests.

## Upstream ordinary-commit histories (US-018-AC12)

The pinned delta-rs corpus contains 303 ordinary commit files directly under 59
_delta_log directories. Selection requires exactly 20 decimal digits plus .json; the
remaining four previously captured JSON blobs are checkpoint/auxiliary sources, outside
this ordinary-commit profile. Every available prefix of each history is exercised,
including error fixtures and histories missing initial/intermediate versions.

UMF reconciles 278 prefixes and blocks 25: 23 have missing/noncontiguous histories and
two contain the delta-live-table metadata action without schemaString. All original
sources are retained and SHA-256 verified. Successful states have stored SHA-256 of the
complete exact-node result, including domains, tombstones, target commit provenance and
deferred actions. Browser execution matches all 278 state hashes and all 25 error results.

Deltalake 1.6.4 accepts 258 original prefixes. Of these, 257 reconcile in UMF; their
reconstructed logs produce equal native schemas, metadata ID/name/description,
configuration, partitions, protocol/features, full get_add_actions records and application
transaction versions. Another 21 UMF-reconciled prefixes are rejected by native loading
both before and after lowering, with equal error classes. This rejection parity does not
establish valid tables. The remaining 24 blocked prefixes are also native-rejected.

One native-accepted prefix remains intentionally blocked: delta-live-table version 1
supersedes malformed metadata from version 0. Native loading tolerates that historical
invalid action; this API requires every supplied ordinary commit to satisfy known shapes.
It retains both sources and reports the earlier missing schemaString instead of silently
loosening the declared profile.

These comparisons use original raw commit files in temporary directories and separately
lowered UMF state. Upstream data files and checkpoints are absent. No original dataset
rows, DV contents, tombstone expiry or native domain state are verified here; the native
API does not expose all of those observations. The earlier authored history covers actual
row reads. Unknown actions/fields remain preserved through the full copied sources.

Reproduce via scripts/delta-history-upstream.ts, delta-history-upstream-oracle.py and
delta-history-upstream-browser.ts. Reports live under fixtures/delta/upstream/ as
history-results.json, history-oracle-results.json and history-browser-results.json;
history-exports/ stores lowered log states. tests/delta/history-upstream.test.ts verifies
source hashes and all state/error outcomes. Conformance runs the Bun and native stages.
Checkpoint recovery, feature-dependent validity and broader transformations remain open.

## Embedded V2 JSON checkpoint recovery (US-018-AC13)

reconcileDeltaCheckpoint(checkpoint, commits) accepts an explicit `{version, source}`
checkpoint followed by contiguous ordinary commits. The source uses umf.delta.log exact
text capture. The result reuses reconciliation.schema.json with an optional checkpoint
field; sources contains only later commits. Checkpoint diagnostics use /checkpoint;
later-commit diagnostics retain /sources indexes. Source inputs are copied unchanged.
The total checkpoint-plus-commit count is bounded by 10,000.

The checkpoint version must be a canonical nonnegative signed-int64 string. Exactly one
checkpointMetadata action must match it. Protocol 3/7 and v2Checkpoint in both feature
lists are required. Metadata and protocol must be present. Ordinary duplicate-identity
checks apply, except checkpoint remove tombstones may share a path when their DV identities
differ. Checkpoints cannot contain commitInfo, CDC or removed domain actions. Unknown
content is retained. A referenced sidecar blocks with DELTA_CHECKPOINT_SIDECAR_UNRESOLVED;
no partial file set is returned. Later commits must begin at checkpoint version plus one.
State version numbers remain original versions rather than fabricated zero-based indexes.

Native evidence uses a V2 JSON checkpoint at version 10 with embedded file actions and
no earlier JSON commits present. Deltalake 1.6.4 DataFusion scan recovers two rows, then
reads versions 11 and 12 after removal and transaction updates. UMF-recovered states,
independently lowered to temporary initial logs, reproduce active paths, rows and application
transaction versions, including signed-int64 maximum. Both physical Parquet files retain
SHA-256. Chromium matches all three recovered states, source JSON/YAML round trips and a
missing-successor rejection. Tests also check required checkpoint metadata, version and
feature mismatch, forbidden actions, overflow and unresolved sidecars. Both pinned upstream
JSON checkpoints reference Parquet sidecars and are explicitly blocked with intact sources.

Evidence is in fixtures/delta/checkpoint/. Reproduce via scripts/delta-checkpoint-probe.py,
delta-checkpoint.ts, delta-checkpoint-oracle.py and delta-checkpoint-browser.ts. Physical
files are reused from fixtures/delta/history/ with recorded hashes. This profile does not
auto-discover checkpoints, parse _last_checkpoint, decode Parquet sidecars/checkpoints,
assemble multipart checkpoints or validate all feature-dependent semantics. These remain
required follow-on work; complete remains false and no write authorization is implied.

AC14 provides decoder-selection evidence only: 35 pinned Parquet checkpoint/sidecar files
and four decimal boundary fixtures match PyArrow typed values with an exact-decimal JS
experiment. Default decimal conversion fails two upstream files and remains recorded.
The experiment is not public API and does not remove DELTA_CHECKPOINT_SIDECAR_UNRESOLVED.
See SPIKE-005 for versions, commands, boundaries and outstanding binary/sidecar integration.

AC15 adds projectDeltaParquetActions over the public bounded Parquet decoder. Its report
schema is spec/extensions/delta-log/parquet-actions.schema.json. Reports always retain
source, diagnostics and complete:false. Success includes a derived Delta JSONL envelope,
exact-node actions with one-based source rows, and omittedNullFields with row numbers and
escaped JSON Pointer paths. Failure exposes no partial actions or derived log.

Each row requires exactly one non-null action column. Basic booleans, exact integers,
strings, arrays, structs and maps with unique string keys project. JSON-annotated strings
remain strings. Known optional struct fields containing null become absent, with each
omission recorded; unknown null fields remain present. Duplicate field names/map keys,
malformed known actions, and unsupported scalar meanings block. Decimal, temporal, float,
INT96 and opaque values require future Delta-specific policies. Source capture and all
Parquet decoder bounds still apply; derived JSONL is limited to one million UTF-16 units.

The pinned corpus yields 896 actions from 23 of 35 files, independently matched against
PyArrow 21.0.0 reads and omission paths. Ten files need scalar conversion policies and two
fail the decoder's declared dictionary-offset checks. Native readability does not remove
these explicit bounds. Seven authored files cover exact int64, prototype-like names,
unknown null content, optional-null omission, duplicate maps, required null fields,
multiple populated actions and float rejection. Evidence lives in
fixtures/delta/parquet-actions/. This conversion does not validate checkpoint protocol,
assemble multipart state, resolve sidecar references or authorize writes. Existing unresolved
sidecar reconciliation behavior remains in force.

AC16 adds reconcileDeltaCheckpointSidecars(checkpoint, commits, sidecars), where sidecars
are ordered {path, source} Parquet captures. This explicitly supplied V2 JSON profile extends
AC13; the two-argument API continues to block unresolved sidecars. Its JSON report schema is
spec/extensions/delta-log/sidecar-reconciliation.schema.json. Every report copies original
checkpoint, commits and sidecars. Success requires a complete derived checkpoint and state;
failed binding/conversion exposes no partial state. A fully derived checkpoint may remain
available when the subsequent protocol/state validation fails.

Paths match the exact URI-encoded reference strings. No filesystem lookup, fetching, URI
normalization, alias equivalence or proof of physical _sidecars placement occurs. Declared
sizeInBytes must equal supplied byte length. Missing, repeated, unused or duplicate supplied
paths block. Sidecars must contain only add/remove actions; their presence forbids any
embedded file actions in the original checkpoint, as required by the pinned V2 protocol.
At most 1000 sidecars, 16 MB of decoded input files, 10000 derived actions and one million
UTF-16 units of derived JSONL are allowed, in addition to individual Parquet decoder limits.
Modification times and feature-dependent data-reader semantics remain unverified.

Original sidecar actions, including their tags and unknown content, remain in the original
checkpoint. The separate derivedCheckpoint substitutes file actions and records each derived
line's checkpointLine and optional zero-based sidecar index/one-based row. Null omissions
retain sidecar index, row and pointer. Replay diagnostics point into derivedCheckpoint when
appropriate; origins connect those positions to native inputs. Existing reconciliation checks
validate protocol, matching checkpoint version, duplicate/conflicting file identities and
contiguous later commits. Source authority never transfers to the derived JSON view.

Evidence in fixtures/delta/sidecars/ uses two authored native sidecars, two live files and a
retired-file tombstone. Deltalake 1.6.4 recovers versions 10–12 with earlier JSON commits absent;
UMF states lowered independently into native logs reproduce scanned rows, active paths and
transaction versions, including signed-int64 maximum. Chromium agrees and recovers source
JSON/YAML plus binary bytes. Both pinned upstream JSON checkpoints now receive their supplied
sidecars but remain blocked on INT96 typed statistics; neither gains a false support claim.
Classic/multipart checkpoints and additional statistics conversions remain pending.

AC17 extends AC15 only within add.stats_parsed and add.partitionValues_parsed descendants.
Decimals become exact JSON number tokens, preserving fractional trailing zeros. Finite floats
use the decoded IEEE value's shortest JavaScript decimal spelling, including -0; original bits
remain available. Dates become YYYY-MM-DD; timestamps retain all 3/6/9 fractional digits for
MILLIS/MICROS/NANOS. Adjusted-to-UTC timestamps end in Z; local timestamps have no zone suffix.
Calendar output is bounded to proleptic Gregorian years 0001–9999. Negative timestamps use
floor division, preserving fractions before the epoch. Nonfinite floats, time-only values,
INT96 and other unsupported kinds still block. These rules do not apply to unrelated action
fields, validate statistics against the table schema, or assert equivalence of stats and
stats_parsed when both exist.

Every successful projection now includes scalarConversions, each containing row, escaped
pointer, full typed input (including physical carrier) and exact-node output. Sidecar recovery
retains those records with their supplied sidecar index. Conversion records distinguish native
typed content from its JSON view; the original Parquet source remains authoritative for schema,
precision/scale and unsupported content. A bare derived log cannot replace this evidence.

The new native corpus result supersedes AC15's initial 23-file limit: 30 of 35 upstream files
project 944 actions. Three files retain INT96 blockers and two retain dictionary-offset blocks.
Nine authored inputs bring the independently checked corpus to 44 files, 34 projected inputs
and 948 actions. PyArrow 21.0.0 reads timestamps as exact scalar counts, avoiding Python datetime
microsecond truncation. Chromium matches actions, conversion records, omissions and diagnostics.
Boundary tests include -1 nanosecond, local -1 microsecond, a 30-digit decimal, negative zero,
nonfinite rejection and explicit calendar limits. This still does not establish full checkpoint
statistics interpretation, classic/multipart recovery or general Delta reader support.

AC18 adds reconcileDeltaParquetCheckpoint(checkpoint, commits, spec, sidecars=[]), with spec
explicitly v1 or v2. The report schema is spec/extensions/delta-log/parquet-checkpoint.schema.json.
The copied original Parquet checkpoint, later source commits, supplied sidecars, spec,
diagnostics and complete:false are always present. An available projection retains the AC15–17
source, derived JSON, omissions and scalar-conversion evidence. Recovery, when available,
contains the existing reconciliation result over that derived action view. The top-level
status becomes reconciled only when nested recovery succeeds; the state is recovery.state.
A failed projection or recovery never exposes a partial state as successful recovery.

reconcileDeltaCheckpoint also accepts an optional third spec argument, defaulting to v2 for
compatibility. Its v1 branch interprets a checkpoint action view (not a new native V1 JSON
file format). V1 rejects checkpointMetadata and sidecar actions and requires protocol/metadata
context without imposing V2's 3/7 feature declarations. Shared checkpoint duplicate, tombstone,
forbidden-action and successor checks still apply. Parquet V2 recovery routes through explicit
sidecar binding even when the list is empty. V1 rejects supplied sidecars. Unknown fields and
actions retain their existing preservation/deferred treatment. Neither API discovers files,
interprets _last_checkpoint, assembles multipart files or establishes data-reader support.

Nine native-backed snapshots cover V1, V2 with embedded files, and V2 with two sidecars at
versions 10–12. Deltalake 1.6.4 scans without earlier JSON history agree with independently
lowered UMF states on rows, paths and exact transaction versions. Of 32 pinned single-file
checkpoints, UMF recovers 29; one INT96 and two dictionary-offset cases remain blocked. Native
metadata/file observations agree for 24 recovered cases. The other five recovered cases are
rejected by deltalake because catalogOwned is unsupported; action recovery must not be described
as native reading support. All three UMF-blocked files remain native-readable, preserving the
explicit implementation-limit distinction. Upstream observations cover metadata, protocol,
schema, active paths and observed application transactions, not data scans. Evidence lives in
fixtures/delta/parquet-checkpoint/ and includes source hashes for authored native fixtures.

AC19 adds reconcileDeltaMultipartCheckpoint(version, partCount, parts, commits). Each part
is {name, source}, with canonical n.checkpoint.o.p.parquet naming (20/10/10 decimal digits).
Version is a nonnegative signed-int64 token. Exactly 2..1000 parts must supply every ordinal
once with matching version/count. Input order may differ from ordinal order; originals retain
input order and origin.part indexes that order. Assembly follows numeric part order. Total
input is limited to 16 MB and combined actions to 10000/one million UTF-16 units, in addition
to per-file decoder limits. Neither names nor supplied bytes establish storage placement.

The multipart report schema is spec/extensions/delta-log/multipart.schema.json. Reports retain
version, partCount, copied parts and source commits, diagnostics and complete:false. Completed
per-part projections retain native/typed evidence even when assembly later fails. Once derived,
origins map one-based combined lines to zero-based input parts and one-based rows; recovery
contains V1 checkpoint replay over the derived action view. Only successful recovery exposes
a recovered state. Missing/mismatched/duplicate parts, unknown or forbidden action kinds,
clustering failures, repeated actions and v2Checkpoint feature declarations block.

File-key clustering uses Spark 4.0.1's legacy Murmur3 UTF-8 hash with seed 42, signed tail bytes,
sequential field seeds, null-as-unchanged-seed and positive modulo. Without deletion vectors,
keys are path; with the declared deletionVectors feature, keys are path plus DV uniqueId
(storage type + path/inline value + optional canonical @offset). Non-file actions use null
keys. Deletion-vector declarations must be present in both feature lists with protocol 3/7.
Hashing matches 26 native Spark vectors including null, empty text, UTF-8 tails and custom
seeds. This does not validate DV contents or provide native data-read evidence for DV-bearing
multipart fixtures; those remain separate coverage. Concurrent overwrite/common-writer
provenance and transaction safety remain unverified even when clustering succeeds.

Native evidence uses two Spark-clustered Parquet parts and scans versions 10–12 with earlier
JSON history absent. Deltalake 1.6.4 scans agree with independently lowered UMF states on rows,
paths and exact transaction versions. Chromium matches these snapshots, all hash vectors,
source JSON/YAML binary recovery and missing-part rejection. Tests also reverse caller part
order and reject swapped payloads, duplicate actions and V2-feature misuse. Evidence lives in
fixtures/delta/multipart/. The hash oracle runs with Spark 4.0.1 and OpenJDK 21.0.2; Java 27 failed
Spark UTF8String initialization. JAVA_HOME selects the oracle JDK; browser code uses neither JVM
nor Spark. This supports explicit bounded assembly, not automatic checkpoint discovery or a
complete Delta reader.
