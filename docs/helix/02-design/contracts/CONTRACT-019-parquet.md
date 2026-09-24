---
ddx:
  id: CONTRACT-019
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-019
      kind: informed_by
    - id: SPIKE-005
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# CONTRACT-019: Parquet source preservation

## Embedded Arrow schema observation (US-019-AC22)

`getParquetArrowSchema(document)` observes file-level `ARROW:schema` metadata without
changing the Parquet capture. Its complete result schema is
spec/extensions/parquet/arrow-schema.schema.json. Results retain the full source,
complete:false and diagnostics, with status absent, decoded or blocked. Decoded
results include metadataIndex, original encapsulated IPC bytes as lowercase ipcHex,
and separate Message and Schema UMF documents using CONTRACT-016's FlatBuffers model.

The accessor requires one unambiguous metadata entry, canonical padded base64 and
exactly one body-free encapsulated Schema message. Both modern continuation and legacy
four-byte prefixes are accepted. Missing values, duplicate entries, bad base64, truncated
or extra framing, non-schema/body-bearing messages and unsupported Arrow wire content
block extraction; the original Parquet bytes remain recoverable. Unknown schema/field
custom metadata remains in the Arrow model. Absence of this key does not imply absence
of a physical Parquet schema, and decoded does not certify correspondence with that schema
or its rows. No embedded metadata is rewritten and no new core scalar inference is made.

Arrow documents describe this key as a base64-encoded IPC schema message used to restore
Arrow-specific types ([Arrow Parquet documentation](https://arrow.apache.org/docs/cpp/parquet.html)).
PyArrow 21.0.0 fixtures demonstrate large-list, duration and named-timezone restoration;
without the stored schema the same authored table reads as list, int64 and UTC timestamp.
This counterexample keeps physical and embedded declarations separate instead of treating
their similar field structures as semantic identity.

Both UMF formats recover the extracted models. Four detached re-encodings, including a
field rename through the existing Arrow model API, pass native schema equality with
metadata. These are standalone schema transformations; the Parquet file and row data
remain unchanged. Coordinated edits require the separate operation below; general
schema correspondence checks remain unfinished.

Reproduce with `.venv/bin/python scripts/parquet-arrow-schema-fixtures.py`,
`bun test tests/parquet/arrow-schema.test.ts`,
`.venv/bin/python scripts/parquet-arrow-schema-oracle.py`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/parquet-arrow-schema-browser.ts`.
Evidence under fixtures/parquet/arrow-schema records native differences, malformed inputs,
model recovery, native re-encoding comparisons and browser results. General IPC reading,
all writer variants and cross-schema semantic equivalence are not established by this corpus.

## Coordinated embedded-schema rename (US-019-AC23)

`renameParquetFieldWithArrowSchema(source,policy,backend)` updates a physical field
and its explicitly selected embedded Arrow field together. Policy supplies parquetIndex,
arrowFieldPath (positional child indexes), name, optional parquetName and uninterpretedMetadata set to
`preserve-and-report`. The explicit encoder backend is FlatBuffers 25.9.23, as in
CONTRACT-016. The complete result schema is spec/extensions/parquet/arrow-rename.schema.json.
Results retain original source and policy, complete:false and diagnostics; transformed
results include output, unchangedPrefixBytes and from/to name-component paths. A blocked
operation exposes no intermediate output.

Selected fields must correspond structurally. Ordinary record children require matching
names, positions and child counts. Inspected LIST reading rules map the Arrow element
to the physical element index, skipping a three-level wrapper when present; MAP maps
through its entry struct and ordered key/value roles. Arrow List/LargeList/FixedSizeList
and Map declarations must match the corresponding container kind. Different wrapper
labels are not treated as unrelated domain fields. Explicit indexes must resolve to
the same selected field. Ambiguous Arrow siblings and target collisions block.

Results continue to report Arrow from/to paths and additionally report parquetFrom/
parquetTo when the native paths or selected names differ. parquetName defaults to name;
it can differ only for a structural element/role label, allowing inverse edits to restore
Arrow `item` and Parquet `element` separately. Ordinary record-field targets require a
shared name. Synthetic MAP entry wrappers and MAP key/value role-label renames remain
blocked; descendants inside their values can be renamed. The established physical rename still validates UTF-8 names,
indexes, sibling uniqueness and unchanged LIST/MAP interpretation. Missing or malformed
embedded metadata, unknown wire fields, crypto/trailing content and external column
files remain blocked. Column-level schema-bearing key/value metadata remains blocked.

The implementation temporarily withholds file metadata internally while applying the
existing physical rename, then restores every original entry with only ARROW:schema's
value replaced by the encoded renamed message. No intermediate file is returned.
Schema/field custom metadata, unrelated file metadata and caller-owned UMF extensions
remain intact. Uninterpreted name references can therefore still use the old name;
the policy and diagnostic make that limitation explicit. The operation does not certify
original Arrow/Parquet type correspondence or migrate external consumers.

The final embedded message must reproduce the intended model, and every byte before
the footer remains unchanged. Derived Parquet core fields refresh using their existing
schema-index identities while retaining attached metadata. Reverse rename restores
native schema and values; canonical footer/FlatBuffers re-encoding need not reproduce
original bytes. Instant timezone, duration and large-list refinements remain in Arrow,
not newly promoted into core.

Eighteen native examples cover six selected fields, including nested struct children,
in uncompressed, Snappy and Gzip files with two row groups and page checksums. PyArrow
21.0.0 verifies renamed embedded and reconstructed schemas with metadata, unchanged
values after accounting for keys, and exact schema/value recovery after inverse rename.
Apache Thrift 0.22.0 independently verifies that only the selected schema name,
descendant column paths and embedded Arrow bytes changed (struct field order is ignored).
Uninterpreted metadata containing old field names is intentionally retained and tested.

Reproduce with `.venv/bin/python scripts/parquet-arrow-rename-fixtures.py`,
`bun test tests/parquet/arrow-rename.test.ts`,
`.venv/bin/python scripts/parquet-arrow-rename-oracle.py`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/parquet-arrow-rename-browser.ts`.
Inputs, renamed/restored files, input-fingerprinted native results and browser evidence
are under fixtures/parquet/arrow-rename.

Five further cases under fixtures/parquet/arrow-nested exercise fields inside large
lists and map values, null/empty containers, null list elements, duplicate ordered map
keys and separate element-label restoration. Native checks compare every schema field
name, type, nullability and metadata recursively, avoiding construction of a replacement
Map type that would itself normalize entry names. Native row comparison retains tuple
ordering and duplicate keys while accounting for renamed record keys. Both native
schemas and complete values recover after inverse edits; page checksums remain enabled.

Separate raw IPC probes show PyArrow 21.0.0 normalizing renamed MAP key/value roles back
to `key`/`value`. The encoded FlatBuffers models retain the proposed labels, but native
reading does not. map-label-oracle.json records these two counterexamples; they are not
counted as successful native renames. The earlier map-key-counterexample.parquet is
retained as additional evidence of the rejected support claim.

Reproduce nested cases with parquet-arrow-nested-fixtures.py, arrow-nested.test.ts and
the rename oracle/browser commands above with `fixtures/parquet/arrow-nested` as their
argument. Run parquet-arrow-map-label-probe.ts then parquet-arrow-map-label-oracle.py
for the role-label counterexamples. Unverified legacy-layout combinations, Map role
renaming, metadata-reference rewriting and arbitrary type/value migrations remain open.

## Core field metadata ingestion

`importParquetSchema(bytes,{id})` captures the file and materializes `parquet.fields`
core elements after schema/logical inspection succeeds. `captureParquet` remains the
separate preservation path for uninterpreted or malformed input. No pages are decoded
to create this schema view. `getParquetFieldMetadata` returns status, complete:false,
diagnostics and ordered field entries with native schema index, component path,
definition/repetition levels, core element and complete mapped native SchemaElement.
The result JSON Schema is spec/extensions/parquet/field-metadata.schema.json.

Field IDs are schema indexes, not durable identities across schema reordering.
Groups receive no scalar family. For primitive fields, checked logical STRING/ENUM,
INTEGER, DECIMAL, DATE, TIME, TIMESTAMP and FLOAT16 map to the corresponding core
families. Native parameters, signedness, UTC adjustment, units and legacy annotations
remain in nativeField. Unknown/uninterpreted annotations or unknown wire content
prevent classification; UUID, INTERVAL, JSON/BSON and other unmapped meanings remain
unclassified. Invalid logical/physical combinations block the view. Without an
annotation, BOOLEAN, INT32/INT64, FLOAT/DOUBLE and byte arrays map respectively to
boolean, integer, float and binary; INT96 remains unclassified. These rules derive
from the pinned native/parquet/sources/LogicalTypes.md and parquet.thrift baseline.

A scalar family describes one field value, not a flattened row column. Repeated
fields retain their levels; no nullability, cardinality or list/map container semantics
are promoted to core. Schema interpretation does not establish validity of stored
values, statistics, sorting, encryption or cross-system conversion.

Native export checks materialized fields against file metadata. Native footer
rewrites refresh the view and preserve attached metadata by schema index; field
removal with attachments rejects. Explicit rename operations retain annotations and
references on the renamed field. Original byte captures and older documents without
materialized fields remain supported. Browser library code performs no filesystem IO.

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose and scope

Provide authoritative Parquet bytes for browser metadata consumers and checkpoint
recovery. This initial profile supports exact bounded capture and footer-region location.
It does not yet implement complete Parquet metadata/type schemas, decoding, edits,
re-encoding, encryption or cross-system transforms. Those remain in US-019-AC4.

## Normative surface

umf.parquet 0.1.0 uses module parquet, element source and payload
`{profile:"parquet-file-source",encoding:"hex",bytes:<lowercase hex>}`. schema.json and
package.json under spec/extensions/parquet describe the complete capture representation.
The bytes field MUST contain even-length lowercase hexadecimal, at most 2,000,000
characters (1,000,000 source bytes). Empty or invalid native input MUST remain capturable.

captureParquet(bytes,{id}) MUST copy source. exportParquetCapture(document) MUST return a
fresh byte array from the authoritative payload. The envelope and pinned version MUST
validate. Unknown payload properties MUST survive UMF serialization and MUST block native
export. Changes to caller input or returned arrays MUST NOT mutate the stored source.
Native export MUST NOT substitute any interpreted or regenerated representation.

inspectParquetFraming returns copied source, byteLength, status, complete:false and
diagnostics, with footerRegion only when located. framing.schema.json defines the result.
The source must contain at least 12 bytes; both four-byte magic strings MUST match PAR1
or PARE. The unsigned little-endian length immediately before the final magic MUST be
nonzero and locate a region wholly after the initial four-byte magic. A located footer
region reports offset, length and mode plaintext-or-signed or encrypted. These are byte
units, not a decoded FileMetaData claim. All remaining source content stays uninterpreted.

## Compatibility and errors

The 0.1.0 package version is explicit. Future representation fields remain serializable
but cannot be discarded by older native exporters. Native malformed files produce framing
diagnostics without preventing source export. Invalid envelopes raise PARQUET_CAPTURE;
unknown payload fields raise PARQUET_REPRESENTATION; oversized/wrong input raises
PARQUET_LIMIT. Native framing reports PARQUET_TRUNCATED, PARQUET_MAGIC or
PARQUET_FOOTER_BOUNDS. Located framing always reports PARQUET_UNINTERPRETED.

## Sources and evidence

[Apache file layout](https://parquet.apache.org/docs/file-format/) defines magic bytes and
the footer length. [Modular encryption](https://github.com/apache/parquet-format/blob/master/Encryption.md)
sections 5.4–5.5 define PARE encrypted footers and PAR1 plaintext/signed footers. A PAR1
file may contain encrypted columns. The located region may include a signature or crypto
metadata; callers MUST NOT infer a bare Thrift metadata span from framing alone.

The initial corpus reuses 35 delta-rs Parquet checkpoint/sidecar files pinned at
90b904ede68627c2450007034d9724c043f1a66b plus four PyArrow decimal boundary fixtures.
All 39 files preserve SHA-256 through both UMF JSON and YAML. PyArrow 21.0.0 independently
compares schemas and all 1,011 rows before/after export and confirms footer sizes/offsets
for these unencrypted files. Chromium repeats all hashes and framing. Authored tests cover
invalid/empty sources, copy isolation, representation additions, bounds, magic mismatch
and synthetic PARE framing; they do not prove encryption support.

Reproduce with scripts/parquet-schema.ts, parquet-capture.ts, parquet-capture-oracle.py and
parquet-capture-browser.ts. Reports and exported files are in fixtures/parquet/; source
hashes/provenance remain in fixtures/delta/checkpoint-upstream/. tests/parquet/capture.test.ts
passes 144 assertions. No general Parquet support claim follows from this capture profile.

## Exact Compact Protocol footer view (US-019-AC5)

decodeParquetFooter(document) returns copied source, status decoded/blocked, complete:false,
diagnostics and, on success, value, consumedBytes and trailingBytes. The full recursive
result shape is in footer-decode.schema.json. This is a read-only wire view, not a mutable
Parquet schema model or an encoder. Source bytes remain authoritative.

The supported Compact Protocol kinds are bool, i8, i16, i32, i64, double, binary, list,
set, map, struct and uuid. Integers retain their width and exact signed decimal text;
doubles retain eight little-endian IEEE-754 bytes as hexadecimal, including nonfinite
values and negative zero. Binary and UUID values retain hex without assuming UTF-8.
Struct fields remain ordered arrays of signed-int16 ID/value entries, including duplicate
IDs. Maps retain ordered key/value entries, including duplicate keys. Empty maps omit
unencoded key/value types. Lists/sets retain their element kind and original item order;
no set deduplication occurs. Both Compact Protocol boolean element-type spellings are
accepted and normalized to bool in the view; original encoding remains in source bytes.

The parser MUST enforce input-region bounds before reads, integer/varint widths, collection
counts against its remaining value budget, nesting depth at most 64 and at most 50,000
value nodes. It MUST require a terminating struct STOP. Errors return PARQUET_FOOTER_DECODE
with no partial value. Encrypted regions return PARQUET_FOOTER_ENCRYPTED; decryption is not
attempted. Trailing region bytes produce PARQUET_FOOTER_TRAILING and remain in source;
they are not assumed to be valid signatures. consumedBytes/trailingBytes are relative to
the located footer region. Invalid capture envelopes still raise capture errors.

The [Apache Compact Protocol specification](https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md)
grounds field IDs, ZigZag/varints, container encoding, binary values and numeric bits.
The parser is local TypeScript; Apache thrift Python 0.22.0 is an independent development
oracle. Every decoded node in all 39 Parquet fixtures matches that oracle. A native-written
40th fixture covers signed integer extremes, negative/descending/repeated field IDs, bool
lists, sets and maps with duplicates, arbitrary binary, nested structs, -0, infinity and
NaN. This fixture is valid wire data, not a valid Parquet FileMetaData assertion. UUID
handling has authored-vector evidence; the Python oracle lacks that wire extension.
Chromium repeats all 40 trees and byte exports without host globals.

Tests additionally block truncation, excessive varints/counts/depth, invalid bools and
unknown wire types. The combined capture/footer suite passes 383 assertions. Reproduce
via scripts/parquet-footer-oracle.py, parquet-footer.ts and parquet-footer-browser.ts.
Evidence is in fixtures/parquet/footer/. No interpreted field is discarded, but normalized
wire views are not byte-identical encodings; original captures provide exact round trips.
Parquet IDL fields, logical types, schema projections, row decoding and editing remain
US-019-AC4 work. This step does not integrate Delta sidecar recovery.

## Pinned IDL and named metadata (US-019-AC6)

Apache parquet-format commit 219e3f12a62f9476e830c21e26d030d231f7c017 is pinned under
native/parquet/sources/ with parquet.thrift, LogicalTypes.md, Encryption.md, LICENSE and
NOTICE. The manifest records source paths and SHA-256. parquet-sources-fetch.py re-fetches
that exact revision; it does not advance the pin. The [upstream IDL](https://github.com/apache/parquet-format/blob/219e3f12a62f9476e830c21e26d030d231f7c017/src/main/thrift/parquet.thrift)
is the governing field/type definition for this view.

parquet-idl.py verifies hashes and compiles the entire IDL with thriftpy2 0.5.3. The
resulting idl.json describes all 69 declarations and 176 fields, with IDs, requiredness,
nested types, enum codes and declared defaults. It is exported as parquetIdl. Union/struct
identity is taken from the comment-stripped declarations; field descriptors come from the
compiler. parquet-metadata-schema.ts generates metadata.schema.json for FileMetaData and
all referenced/unreferenced IDL definitions, plus metadata-inspection.schema.json for the
public result. This covers the pinned IDL's field shapes; prose rules in LogicalTypes.md
and cross-field constraints are not automatically implemented.

inspectParquetMetadata(document) returns source, status mapped/blocked, complete:false,
diagnostics, wire when decoded, and metadata when known-field mapping succeeds. The
metadata object uses IDL names. Integer/enum values use exact decimal strings; enums retain
unknown codes with PARQUET_ENUM_UNKNOWN. Strings require valid UTF-8, preserving a leading
BOM as content. Binary fields use {hex}; doubles use {bits} with little-endian IEEE-754
bytes. Lists/sets retain order. Unknown numeric field IDs are retained in each struct's
$unknown array as original ordered wire entries, including repeated unknown IDs.

Known-field types and collection element kinds MUST match the IDL even for empty lists.
Required fields MUST be present; defaults MUST NOT be inserted. Repeated known IDs MUST
block rather than overwrite. A union may have at most one encoded field. Invalid UTF-8 or
shape ambiguity produces PARQUET_METADATA_SHAPE and no partial named metadata, while the
wire tree and authoritative source remain available. Unknown fields/codes produce warnings
without inventing semantics. Every result remains incomplete; row decoding, physical/logical
schema consistency, safe edits, encryption and projection validity remain unverified.

All 39 captured Parquet files match an independent thriftpy2-generated FileMetaData reader,
field-for-field with exact values. Chromium repeats the named views and byte preservation.
Authored tests cover future enum codes, repeated unknown fields, required/duplicate known
fields, invalid UTF-8 and empty-list element-type mismatch. The native reader may insert
IDL defaults in other contexts; this view preserves absence. Corpus equality does not
establish all logical-type semantics or native coverage of every generated declaration.

Reproduce with parquet-idl.py, parquet-metadata-schema.ts, parquet-metadata-oracle.py,
parquet-metadata.ts and parquet-metadata-browser.ts. Native expected views and reports live
in fixtures/parquet/metadata/. The decoder uses generated static descriptors in the browser;
Python is a development compiler/oracle only. No arbitrary IDL is loaded at runtime.

## Physical schema topology and column links (US-019-AC7)

inspectParquetSchema(document) extends named metadata inspection with status checked/blocked,
complete:false and optional tree/leaves. schema-inspection.schema.json describes the full
result. Tree nodes carry their original SchemaElement index, name, component path, levels
and children. Leaves additionally carry column ordinal and known physical type. The
original named metadata, wire tree and source remain available; element properties are not
flattened into a different schema vocabulary. Literal dots stay within their name component.

The flat schema MUST form one complete preorder tree. Root must be a group; groups require
feasible nonnegative num_children and primitive nodes must omit num_children. Non-root
repetition must be REQUIRED, OPTIONAL or REPEATED. Known physical types are BOOLEAN, INT32,
INT64, INT96, FLOAT, DOUBLE, BYTE_ARRAY and FIXED_LEN_BYTE_ARRAY. Fixed byte arrays require
positive type_length. Schema nesting is bounded at 64. OPTIONAL increments definition level;
REPEATED increments both definition and repetition level. Root contributes neither.

The pinned IDL says root repetition is absent, but the four authored PyArrow fixtures encode
REQUIRED. This known legacy shape is retained with PARQUET_ROOT_REPETITION; OPTIONAL/REPEATED
root encodings block this profile. Duplicate sibling names warn and retain index/ordinal
identity rather than collapsing fields. Unknown physical/repetition codes block derivation.

Every row group must have one column per physical leaf in schema order. Available column
metadata must match exact path components and physical type. Missing/encrypted metadata
produces PARQUET_COLUMN_METADATA_UNAVAILABLE without claiming that link was verified.
External file paths produce PARQUET_EXTERNAL_COLUMN; no files are fetched. Row counts must
be nonnegative per group and total exactly to FileMetaData.num_rows using BigInt. When
column_orders is present its count must match leaf count. Errors produce
PARQUET_SCHEMA_STRUCTURE and return neither partial tree nor partial leaf list.

PyArrow 21.0.0 independently confirms physical types and max definition/repetition levels
for all 1,813 columns in 39 files. Native dotted path strings are compared without treating
them as unambiguous component encodings; the named metadata retains path arrays. An authored
literal-dot fixture verifies that ['stats','value.with.dot'] remains two components.
Twelve malformed fixtures exercise extra/missing nodes, negative child counts, primitive
children, absent/root repetition, unknown/fixed physical types, wrong paths/types, missing
columns and row-count disagreement. Eight are accepted by PyArrow metadata loading but
blocked by these stricter structural checks. Native metadata acceptance is not evidence
that such files have consistent readable columns. Native observations are recorded.

Chromium repeats 39 valid corpus cases plus 13 authored cases (40 checked, 12 blocked),
including complete trees/leaves, source preservation and absence of partial blocked trees.
Reproduce with parquet-tree-oracle.py, parquet-tree-negative.py, parquet-tree.ts and
parquet-tree-browser.ts. Evidence is under fixtures/parquet/schema/. Logical annotation
rules, offsets, page contents, value decoding, native schema edits and projections remain
unfinished; checked does not mean complete Parquet validity.

## Scalar logical annotation inspection (US-019-AC8)

inspectParquetLogicalTypes(document) extends physical schema inspection with annotations
indexed to SchemaElements. logical-inspection.schema.json defines the result. Each entry
records logical/converted origin, name, parameter view and validation checked/invalid/
uninterpreted. Status blocked means an implemented rule found a conflict; otherwise checked
means those rules passed. Neither checked status means complete logical support. A physical
tree may remain available when only logical checks fail. All sources, wire and named metadata
remain authoritative and unchanged, and complete is always false.

Implemented rules cover BYTE_ARRAY carriers for STRING/ENUM/JSON/BSON, DATE on INT32,
INTEGER widths 8/16/32 on INT32 and 64 on INT64, UUID/FLOAT16/INTERVAL fixed lengths 16/2/12,
and TIME/TIMESTAMP carriers according to units. UTC/local flags remain distinct. DECIMAL
requires positive precision and scale between zero and precision, with INT32 capacity 9,
INT64 capacity 18 and exact fixed-byte capacity. Fixed decimal widths up to 4,096 bytes use
BigInt and decimal digit count, avoiding logarithm-rounding boundaries. Larger widths are
explicitly uninterpreted for capacity checks. BYTE_ARRAY decimal precision remains required
but is not constrained by a fixed carrier size. INT64 precision below 10 produces a warning.

Modern LogicalType is authoritative when present. Legacy ConvertedType is interpreted only
when modern annotations are absent. Legacy decimal scale defaults to zero in the annotation
view; no field is inserted in metadata. Modern/legacy discrepancies and missing compatible
legacy tags produce explicit warnings without overwriting either representation. Legacy
time annotations cannot distinguish local from UTC; modern isAdjustedToUTC=false is retained
independently. Unknown codes, future parameters and unimplemented rule sets remain visible.

LIST/MAP/MAP_KEY_VALUE/VARIANT/FILE group carriers are checked, but nested layout/value rules
remain uninterpreted. GEOMETRY/GEOGRAPHY byte carriers are checked, while CRS/interpolation/WKB
semantics remain uninterpreted. UNKNOWN retains its always-null intent without claiming
stored-null verification. Stored values, statistics and sort-order validity are not tested.
This layer does not silently fall back to a competing semantic interpretation.

Thirty authored scalar metadata fixtures agree with PyArrow 21.0.0 logical-to-Arrow schema
observations: 15 accepted and 15 rejected. They cover decimal precision/scale/carriers,
integer widths, string/date/temporal carriers, UUID, FLOAT16 and INTERVAL, including absent
legacy scale and conflicting legacy decimal parameters. The 39 prior files pass implemented
rules while reporting incomplete nested validation. Chromium matches all 69 cases (54
checked, 15 blocked), annotation parameter views, diagnostics and preserved bytes.

Commands: parquet-logical-oracle.py, parquet-logical.ts and parquet-logical-browser.ts.
Evidence is under fixtures/parquet/logical/; tests/parquet/logical.test.ts adds 317 assertions.
The source of rules is the pinned LogicalTypes.md in native/parquet/sources/. Logical field
schemas already cover the IDL, but nested semantic rules, value decoding and safe transforms
remain incomplete and must not be inferred from this acceptance matrix.

## LIST/MAP reading interpretation (US-019-AC9)

`inspectParquetContainers` extends scalar inspection with a `containers` array governed by
`container-inspection.schema.json`. List entries identify the repeated and element schema
indexes, outer/element nullability and two-/three-level layout. Map entries identify the
repeated entry, required key and optional value indexes, value nullability and the native
last-value duplicate-key rule. Native field names and the entire source remain unchanged.
A missing map value is retained as absent, rather than silently converting the map to a list.

The pinned LogicalTypes.md reading rules permit repeated primitive elements, multi-field
struct elements, single-field repeated elements, `array` and `<outer>_tuple` wrappers, and
renamed canonical wrappers. Repeated LIST outer groups require an enclosing two-level LIST
that uses them as elements. MAP_KEY_VALUE on a map's entry group is an entry marker; otherwise
it is interpreted as a legacy MAP. Map keys must be required; values cannot be repeated.
Unknown annotations/parameters and stored-value rules retain the prior unverified diagnostics.
Scalar annotation validation remains a separate view: container inspection does not change
its generic nested-value warning into a claim of complete logical validation.

Eighteen authored metadata-only files cover 11 valid and 7 invalid layouts. PyArrow 21.0.0
agrees on 17 acceptance outcomes, but accepts repeated map values as lists where the pinned
specification disallows repeated values. UMF blocks that layout explicitly. PyArrow projects
a key-only map to a list; UMF preserves its map intent. On the 11 accepted fixtures, tests
compare recursive element/key/value types and nullability, accounting explicitly for that
key-only projection. The prior 39 files pass these structural checks. Chromium repeats all
57 files (50 checked, 7 blocked), complete container views, diagnostics and original bytes.
`complete` remains false; blocked sources may retain partial independently interpreted
containers, source bytes, wire tree, metadata and physical tree for diagnosis.

## Metadata transforms and wire encoding (US-019-AC10)

`encodeParquetWire` accepts the value tree described by footer-decode.schema.json and emits
canonical Compact Protocol bytes. It checks integer widths, field IDs, collection member
kinds and exact double/UUID/binary byte widths. Unknown representation properties must not
be discarded. Limits are 64 nested levels, 50,000 values and 1,000,000 encoded bytes.
Ordered fields, repeated IDs, duplicate map/set entries and double bits survive encoding;
original non-minimal varints and field-header spelling may normalize. The authoritative
source capture remains the byte-exact representation. UUID encoding has authored round-trip
coverage; Apache Thrift Python 0.22.0 does not provide the independent UUID oracle.

`appendParquetKeyValueMetadata(document, entries)` appends 1..1000 new file-level KeyValue
entries. Keys and optional values are lossless UTF-8 strings; absent and empty values remain
distinct. Entries must be JSON-compatible, with no unknown properties. Existing or duplicate
keys block the append. The result is governed by metadata-transform.schema.json and includes
copied `source`, `status`, `complete:false` and diagnostics. Success additionally supplies
`output`, `added` and `unchangedPrefixBytes`; blocked results never publish output.

This operation requires understood named metadata without unknown fields/enum codes or
crypto metadata, a decoded footer without trailing bytes, and output within the capture
limit. Encrypted/signed files require a separate implementation. The output clones the full
UMF document, updates only its authoritative Parquet bytes, and copies the original prefix
through the footer offset exactly. The canonicalized footer includes unchanged existing
wire values plus additions; the trailer length is updated. This operation does not validate
pages or promise that arbitrary metadata consumers ignore newly added keys. Generic metadata
replacement, schema edits, row transforms and cross-system lowering remain open.

Evidence: fixtures/parquet/transforms contains 40 independent wire comparisons and 39
transformed corpus files containing 1,011 rows. Apache Thrift confirms every re-encoded wire
value, including unknown/repeated IDs and exact numeric extremes in the authored boundary
fixture. PyArrow 21.0.0 confirms unchanged native schemas and table values for all 39 edited
files. Independent wire comparison verifies metadata outside field 5, including all column
statistics and offsets (some statistic types cannot be materialized by PyArrow's to_dict).
PyArrow exposes a missing KeyValue.value as empty bytes; UMF tests separately assert the
original absence. JSON/YAML preserve edited bytes. Chromium matches all 40 encodings and
39 output hashes and rejects all 39 duplicate-key retries without Node globals.

## Field rename (US-019-AC11)

`renameParquetField(document, index, name)` renames one non-root SchemaElement selected by
its preorder native index. The name must be nonempty lossless UTF-8, at most 100,000 UTF-16
units, different from the current name, and distinct from sibling names. Literal dots and
Unicode remain components of a name, not path delimiters. The result follows
rename.schema.json: copied source, status, complete:false and diagnostics; success adds
output, unchangedPrefixBytes and rename `{index,from,to}` with component-array paths.
Blocked results expose no output.

The operation requires successful physical/scalar/container inspection. Unknown native
fields/enums, crypto metadata, footer trailers, ambiguous sibling names and uninterpreted
logical types (outside the implemented LIST/MAP reading rules) block editing. Any nonempty
file/column key_value_metadata blocks the rename pending an explicit rewrite policy, since
ARROW:schema, pandas or application-specific metadata may retain old names. External column
file references also block it. Nothing is deleted to make the operation succeed.

The output updates SchemaElement.name and the corresponding component of every descendant
leaf's ColumnMetaData.path_in_schema across all row groups. It preserves field IDs, native
annotations and all other footer values. The unchanged prefix includes pages, page indexes
and checksums. Post-edit physical/logical validation must succeed, and derived container
interpretations must equal the original. This blocks changes such as renaming a legacy
`array` wrapper to an ordinary name or breaking a `<parent>_tuple` wrapper relationship.
Consumers outside the file that refer to old names still require explicit migration.

Native fixtures exercise all 16 non-root indexes in a nested order schema, repeated for
uncompressed, Snappy and Gzip files: 48 transforms, each with 8 rows in 3 row groups. Fields
include structs, maps, nullable lists/elements, decimals, timestamps, explicit field IDs,
literal dots and Unicode. PyArrow 21.0.0 reads identical values after accounting for renamed
keys, with page checksum verification enabled. Apache Thrift 0.22.0 independently derives
expected paths from the edited preorder tree and verifies that no other wire values changed.
Embedded Arrow schema metadata is a separate blocked fixture. JSON/YAML preserve edited
outputs; Chromium matches 48 hashes and the blocked outcome. Evidence is in
fixtures/parquet/rename. These checks do not establish arbitrary external-consumer behavior,
embedded metadata rewriting, arbitrary field transforms or complete Parquet conformance.

Each of the 48 successful renames is also reversed by the same API. Independent Thrift
comparison recovers the original full metadata tree; native reads recover the original
schema and values with schema metadata equality and page-checksum verification. Restored
outputs are under fixtures/parquet/rename/restored; Chromium verifies their hashes too.
This is semantic/wire-tree round-trip evidence; canonical footer encoding need not reproduce
non-minimal original byte encodings.

## Nested value experiment (US-019-AC12; not a public API)

`scripts/experiments/parquet-values.ts` demonstrates schema-driven value assembly using
hyparquet 1.31.1. `experimental-values.schema.json` describes the complete trial output:
ordered struct fields with explicit names, lists, ordered map entries, exact decimal text,
width-tagged integer strings, finite floating-point text, bytes, booleans, textual logical
carriers, date day counts and temporal counts with unit/isAdjustedToUTC. Null is explicit.
Map entries preserve the encoded order and duplicate keys; consumers must separately apply
the native last-value map rule when they want an effective map. This is no core promotion.

The experiment strips decoder annotations only in a transient metadata copy, substitutes
safe unique field aliases and updates temporary column paths. It decodes physical structures,
then interprets them through UMF's original schema/container views. Scalar conversion uses
the authoritative original annotations, so nested decimal values avoid JavaScript Number
conversion and maps avoid object-key coercion/collapse. Source bytes remain unchanged.

Four PyArrow 21.0.0 fixtures cover data-page versions 1.0/2.0 with dictionary encoding on/off.
They retain duplicate and integer map keys, nested decimal values beyond safe integer range,
null and empty lists/maps, uint64 maximum, local/UTC timestamps, time-of-day and fields named
`__proto__` or containing dots. Native expected values derive from Arrow scalar types and
ordered map scalars; Bun and Chromium match all values. This is experimental evidence only:
no bounded public decoder, complete codecs/pages, arbitrary logical types, INT96 semantics
or nonfinite floating-point payload fidelity is claimed. Input/decompression/allocation bounds
and malformed-page behavior remain required before promoting the implementation. Hyparquet
remains a development dependency. The earlier checkpoint-only decoder is unchanged.

## Page declarations and bounds (US-019-AC13)

`inspectParquetPages(document)` returns copied source, checked/blocked status, complete:false
and diagnostics. Success adds ordered page locations/headers, declaredUncompressedBytes and
declaredValues. pages.schema.json describes the result and every named PageHeader using the
pinned IDL. Blocked results omit pages and totals. No page body is decompressed or decoded.

PARQUET_PAGE_LIMITS fixes a 65,536-byte header window, 10,000 pages, 8 MiB per declared page
body, 64 MiB aggregate declared uncompressed bytes (including headers), 100,000 values per
page, 1,000,000 aggregate declared values (including dictionary entries), and 10,000 rows.
The existing capture limit also bounds source bytes. Compact headers share the bounded
wire parser and IDL mapper used for footers. Header unknown fields/enums, crypto metadata,
external columns and unavailable column metadata block inspection. Chunk ranges must stay
before the footer and must not overlap. Page bodies must stay within their declared chunk.

Understood page types are DATA_PAGE, DICTIONARY_PAGE and DATA_PAGE_V2. Exactly the matching
page header must be present; index pages are not interpreted. Dictionaries occur once at
the declared chunk start before dictionary-encoded data. Data and dictionary offsets, value
totals and total uncompressed sizes must agree with column metadata. V2 null/row counts and
level byte lengths must fit page counts/sizes; all-V2 row counts must equal the row group.
Declared uncompressed pages require equal compressed/uncompressed sizes.

Independent thriftpy2 0.5.3 parsing matches 2,472 headers/locations across 45 files. Two
historical checkpoints (upstream-18 and upstream-24) are blocked by these strict declaration
checks even though PyArrow 21.0.0 reads them; the evidence records the actual diagnostics.
Do not infer universal reader incompatibility from these blocked outcomes. Eighteen authored
cases include two valid controls, 15 invalid declarations and one payload corruption case.
The corruption passes header inspection but fails native checksum verification. Thus checked
means declared boundaries/budgets are consistent within the supported profile, not that
actual decompression, level streams, encodings, values or CRCs are valid. Chromium repeats
all 65 cases (48 checked, 17 blocked), headers, diagnostics and preserved source bytes.
Evidence is under fixtures/parquet/pages. A public value decoder remains pending.

## Bounded physical bodies (US-019-AC14)

`decodeParquetPageBodies(document)` builds on page inspection and supports UNCOMPRESSED
and raw SNAPPY pages. Other codecs currently block the whole result. The response follows
page-bodies.schema.json: copied source, decoded/blocked status, complete:false, diagnostics,
and on success pages with exact bodyHex and checksum (`verified` or `absent`), plus
aggregate decodedBytes. Failure exposes neither decoded pages nor totals. Original compressed
bytes remain authoritative in source; bodyHex is a separate physical decoding view.

The local Snappy decoder follows the [upstream raw format description](https://github.com/google/snappy/blob/main/format_description.txt).
It checks the uint32 length prefix against the bounded expected length before allocation,
limits source/output to 8 MiB, validates each literal's source/destination range and each
copy's nonzero backwards offset, and requires exact final length with complete input
consumption. All three copy widths and one- through four-byte literal lengths are exercised.
The page inspector's aggregate 64 MiB budget also bounds decoded bodies; hexadecimal output
uses twice that many characters at most. No external decompressor or Node API is required.

Present PageHeader CRC32 is checked over stored page-body bytes before decompression.
DATA_PAGE_V2 level prefixes remain uncompressed and are copied unchanged; only the value
suffix is decompressed when required by codec and is_compressed (default true). Missing
checksums are reported as absent, never as verified. Decoded size must equal the header.
A successful physical decode does not establish valid level streams, dictionary indexes,
value encodings or scalar semantics.

PyArrow 21.0.0 independently matches 2,424 page-body byte sequences across 44 files, with
Python zlib matching 1,534 present CRC32 checks. The two historical declaration mismatches
remain blocked before decompression; the Gzip fixture is explicitly unsupported by this
codec increment. Twenty-five native-verified Snappy vectors include empty/random/repeated
content and literal/copy variants. Tests reject oversized prefixes, malformed/truncated
blocks, bad back-references, output under/overflow, CRC corruption and altered Snappy length
prefixes. Chromium repeats the 47 corpus files plus 18 prior controls/mutations: 46 decoded,
19 blocked, including payload corruption that earlier header inspection could not detect.
Evidence is under fixtures/parquet/bodies. The experimental typed decoder remains separate
until level/encoding allocation bounds and broader codec behavior are established.

## Hybrid decoding building block (US-019-AC15)

The internal hybrid.ts component decodes raw RLE/bit-packed run bytes. It is not exported
from the package entrypoint; callers must first isolate the correct page region and remove
any length or bit-width prefix. hybrid-values.schema.json describes values, consumedBytes
and separately retained final padding. Widths 0..32, at most 100,000 requested values and
8 MiB input are supported. An optional maximum value constrains levels/dictionary indexes.

Header varints and run lengths are checked before expansion. Zero-length/oversized runs,
truncation, out-of-range values, RLE count overrun and trailing bytes are rejected. The final
bit-packed group may contribute at most seven padding values; their bits are retained even
when nonzero. Uint32 values remain exact JavaScript numbers. Rules are grounded in
Encodings.md pinned alongside the existing Parquet IDL at commit
219e3f12a62f9476e830c21e26d030d231f7c017, with its SHA256 recorded in the source manifest.

Twenty-seven authored dictionary-page files are independently read by PyArrow 21.0.0.
They exercise widths 0..8, RLE/packed/mixed runs, and partial final groups. Chromium repeats
all 27 expected value/padding results and four malformed-count cases. Additional Bun vectors
exercise unsigned width 32, zero-count input, hostile varints/counts, truncation, value bounds
and trailing bytes. The 32-bit vectors are authored boundary checks, not native dictionary
coverage requiring a 2^32-entry dictionary. Evidence is under fixtures/parquet/hybrid.
Page level-stream integration, dictionary bounds against real dictionaries and broader value
encoding/assembly remain subsequent work; this component alone does not complete AC4.

## Definition/repetition levels (US-019-AC16)

`decodeParquetLevels(document)` consumes bounded decoded bodies and the native physical
schema. levels.schema.json defines copied source, decoded/blocked status, complete:false,
diagnostics, and successful per-data-page arrays. Dictionary pages are omitted. Each page
reports rowGroup, column, source offset, repetition/definition arrays, retained padding,
valuesOffset within the uncompressed body, nonNullValues and rowStarts. Failure publishes
no partial pages. Original bodies and source remain separate from this interpreted view.

V1 supports RLE/hybrid level encodings and checks their four-byte length prefixes; deprecated
BIT_PACKED is not yet implemented. V2 uses explicit header region lengths. Zero-maximum
levels are implicit zero arrays and require no stored level bytes. The hybrid kernel applies
schema-domain bounds and requested-count limits. Repetition may not exceed definition;
initial data pages and every V2 page begin at a row boundary. Decoded V2 null/row counts must
match headers, and accumulated row starts per column must equal row-group rows. Values at
the maximum definition level identify the number of physical values expected next.

An independent Python run decoder, using PyArrow 21.0.0's native maximum levels, matches
54,575 definition/repetition pairs on 1,864 data pages across 44 files. This is independent
reference-decoder evidence; PyArrow does not expose its decoded level arrays through this
API. Eight authored V1/V2 files are also read by PyArrow to prove expected required,
optional, repeated and nullable-list rows. Seven malformed level fixtures exercise bounds,
truncation, count mismatches and initial row boundaries. Chromium repeats all 47 corpus and
15 authored cases: 52 decoded, 10 blocked. Earlier Gzip and historical declaration rejections
remain explicit. Evidence is in fixtures/parquet/levels. Cross-column structural consistency,
dictionary-index validity, physical scalar decoding and complete row assembly remain open.

## Physical values and dictionaries (US-019-AC17)

`decodeParquetPhysical(document)` adds physical value decoding after bounded bodies/levels.
physical.schema.json defines copied source, decoded/blocked status, complete:false and
diagnostics, plus successful dictionary/data pages and materializedBytes. Data pages retain
level views; dictionary-encoded data retains decoded indexes and padding. Dictionary pages
retain their original entries. Failed results omit pages and totals.

PLAIN supports BOOLEAN, INT32, INT64, INT96, FLOAT, DOUBLE, BYTE_ARRAY and FIXED_LEN_BYTE_ARRAY.
Integers are signed decimal strings; floats and INT96 remain exact little-endian hex carriers
without Number/Date conversion. Binary values remain hex, including invalid UTF-8. Boolean
padding remains in the authoritative source. Every count, width and byte-array length is
checked against the bounded input, with exact consumption required. Counts are limited to
100,000 and inputs to 8 MiB per physical decoder call. Logical annotations do not coerce
these values; decimal/timestamp/string interpretation belongs in the subsequent typed view.

Dictionary data supports PLAIN_DICTIONARY/RLE_DICTIONARY with width/index-domain checks.
An empty encoded region is accepted only when no physical values are needed. A nonempty
region must carry a valid width and fully consumed hybrid runs. Expanded values are separate
objects from dictionary entries. Aggregate materializedBytes (including dictionary entries,
expanded values and byte-array length prefixes) must stay within 64 MiB, independently of
compressed/decompressed page budgets. Unsupported encodings remain explicit rejections.

An independent Python physical parser matches 9,574 carriers across the existing 44 files,
using native schemas and previously native-verified decompressed bodies. Fifteen additional
native-readable files cover every physical type and dictionary forms except Boolean.
PyArrow 21.0.0 buffers verify integer/float bits, including NaN payloads and signed zero;
native values verify binary, Boolean and valid INT96 timestamps, while UMF retains INT96 bytes.
Malformed PLAIN lengths, dictionary indexes and a valid-sized input with dictionary expansion
over 64 MiB are rejected. The expansion fixture's native metadata is checked without expanding
its entire table in the fixture generator. Chromium repeats 64 inputs: 59 decoded/5 blocked.
Evidence is under fixtures/parquet/physical. Logical semantics, cross-column alignment, row
assembly, other codecs and additional value encodings remain open.

## Physical row assembly (US-019-AC18)

`assembleParquetRows(document)` returns copied source, assembled/blocked status,
complete:false, diagnostics and successful rows described by rows.schema.json. Values are
null, physical carriers, records with ordered `{index,name,value}` fields, or repeated items.
Native wrappers remain present: this is physical assembly, not yet logical LIST/MAP lowering.
Schema indexes provide identity independently of names, dots or JavaScript property behavior.

Repetition levels locate row/repeated-instance coordinates; definition levels determine
presence along the physical path. Each leaf contributes to shared records at those coordinates.
Columns must agree on optional-group presence, empty versus populated repeated groups, and
repeated cardinality. Invalid continuations, duplicate value coordinates, gaps, missing shared
fields and unused physical values block assembly. Row counts must match every column and row
group. Empty schema groups without observable leaf streams are explicitly unsupported.

PARQUET_ROW_NODE_LIMIT caps construction at 100,000 internal nodes, including record roots,
repeated containers/items, nulls and physical slots. This budget is independent of decoded byte
and value-count budgets. Output is assigned only after complete reconstruction and consistency
checks; failure retains source and diagnostics without partial rows. Returned physical carrier
objects are copied from intermediate values.

PyArrow 21.0.0 row values reconstructed through the pinned native schema match 1,024 rows in
44 files, including nested decimals, maps with duplicate/non-string keys, unusual names and
null/empty structures. The oracle uses native scalars and field positions, not UMF level streams.
Two authored shared-row cases are independently native-readable; five additional fixtures
exercise conflicting column presence/cardinality, continuation after an empty group, and a
valid-sized input exceeding the row-node budget. All seven pass physical column decoding first,
so their rejections prove assembly-specific guards. Chromium repeats 54 cases: 46 assembled,
8 blocked. Evidence is in fixtures/parquet/rows. Logical validation/projection, additional codecs
and encodings, and complete Delta sidecar integration remain open.

## Bounded logical value projection (US-019-AC19)

`decodeParquetValues(document)` composes schema/container inspection and bounded physical
row assembly. values.schema.json defines projected/blocked results with copied source,
complete:false, diagnostics and successful typed rows. Struct fields retain indexes and
names. Lists apply the verified native layout rules; maps retain ordered key/value entries,
including duplicates, with `duplicateKeys: last-value` indicating the native effective-map
rule. This API does not collapse entries into JavaScript objects.

Every interpreted scalar retains its exact physical carrier alongside the logical value.
Supported views include exact decimal text, signed/unsigned integers with widths, date counts,
time/timestamp counts with units and isAdjustedToUTC, UTF-8 strings/enums, exact JSON text,
UUIDs and floating views. Floating text can express -0, NaN and infinities while physical bits
preserve payloads. INT96 stays an exact byte value rather than implicitly becoming a timestamp.
Known meanings without a value interpreter (for example BSON or specialized group annotations)
become opaque values containing annotation parameters and the physical row value, with one
warning per schema field. Unknown native metadata continues to follow upstream decoder guards.

Integer values must fit their logical width; uint32/uint64 recover unsigned physical bits.
Decimals must fit declared precision and the projection's limits of 4,096 source bytes and
10,000 digits/scale. Time-of-day counts must fit one day. Text requires valid UTF-8. JSON uses
a local syntax-only scanner capped at 4,000,000 UTF-16 units, depth 128 and 100,000 values;
it creates no parsed object and preserves duplicate keys, numeric spellings and whitespace.
Aggregate interpreted scalar text is limited to 64 Mi UTF-16 units. Failed validation publishes
no partial rows, while source remains intact.

Native PyArrow 21.0.0 scalar comparison covers 1,024 rows in 44 files, including nested exact
decimals, duplicate/non-string maps, null/empty containers, unusual field names and temporal
meaning. The oracle explicitly records INT96 fields that PyArrow exposes as timestamps;
UMF retains their bytes and verifies that representation independently. The bounded API also
matches the four earlier decoder-experiment fixtures after removing added physical/provenance
fields. Ten authored value cases cover malformed precision/width/time/text/JSON, exact JSON,
UUID, FLOAT16 signed zero and opaque BSON. Separate float/double cases preserve NaN payloads.
Chromium repeats 57 corpus/authored inputs (48 projected, 9 blocked), including stable error
messages. Evidence is under fixtures/parquet/values. These implemented projections do not
complete all codecs, encodings or logical annotations, nor cross-system lowering/Delta recovery.

AC20 adds repairParquetDictionaryOffsets(source), with report schema
spec/extensions/parquet/offset-repair.schema.json. This is an explicit transform, not an
implicit decoder compatibility mode. The pinned parquet.thrift defines data_page_offset as
the first data-page location and dictionary_page_offset as the optional dictionary location.
Two parquet-mr 1.10.1 corpus files instead put a dictionary at data_page_offset and omit its
separate offset. Ordinary inspection continues to reject that layout.

Repair requires no dictionary offset, a dictionary header at the declared data offset and an
immediately following data-page header within the same column chunk. It adds the dictionary
offset and changes the data offset to that following page. All other footer fields retain
wire meaning, and every byte before the footer is unchanged. Footer encoding may normalize.
Unknown metadata/enums, encryption, external columns, trailing footer bytes, bad bounds and
nonmatching layouts block. An already-correct file returns blocked with no candidate. Existing
footer, header, chunk, page, row and typed-value limits apply. The entire rewritten candidate
must pass bounded page and typed-value decoding before output is published.

Successful reports contain copied source, output, unchangedPrefixBytes and repairs indexed
by rowGroup/column with oldDataOffset, dataOffset and dictionaryOffset. Failure retains source
and diagnostics without partial output. complete remains false; repairs establish neither
general conformance nor permission to replace an external file. Keeping the original repair
report is necessary to retain source provenance when consuming the candidate.

Native evidence repairs three column chunks in two pinned files (upstream-18 and upstream-24).
Independent Thrift comparison confirms only the declared offsets change. PyArrow 21.0.0 reads
identical schemas and 23 rows before/after, and unchanged data-prefix hashes are recorded.
Deltalake 1.6.4 observations of the original native checkpoints agree with lowered UMF states
recovered from both repaired candidates. These Delta observations cover schema, metadata,
protocol, active paths and observed transactions, not original dataset scans. Chromium matches
both full transform reports, source/output JSON/YAML recovery and repaired checkpoint recovery.
Tests reject damaged dictionary payloads and repeated repairs. Evidence is under
fixtures/parquet/offset-repair/. Original corpus conformance outcomes remain unchanged.
