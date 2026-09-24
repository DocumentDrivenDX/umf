---
ddx:
  id: TD-019
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-019
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: SPIKE-005
      kind: informed_by
---

# TD-019: Authoritative Parquet sources

src/adapters/parquet/index.ts exposes capture/export and framing inspection through the
existing core registry. Hex keeps the payload browser-portable without host binary globals.
The bound fits within core text limits. Export validates known shape and rejects unknown
representation fields; otherwise bytes are independent of any decoder or metadata edits.

Framing uses DataView's unsigned little-endian footer length with explicit source bounds.
PARE marks encrypted footer regions; PAR1 can still include signed footers or encrypted
columns. The API therefore reports a footer region, never complete metadata validity.
Inspection returns copied source and does not mutate input or retain mutable byte views.

The decoder experiment from SPIKE-005 remains a development dependency, separate from
this public package. Next define understood physical/logical metadata and typed value
schemas, resource limits and unknown-field policy before integrating decoding and Delta
sidecars. Complete Thrift preservation and safe schema edits remain open. Similar binary
capture mechanics in Arrow and Parquet do not establish equivalent schema semantics and
therefore do not justify promoting their physical models into core.

AC5 adds a local bounded Compact Protocol parser in footer.ts. It operates only on the
located plaintext/signed region and preserves numeric widths/bits and ordered unknown
fields instead of converting to a library's known-field object. Raw binary values remain
hex; interpretation of UTF-8, field names, enums and logical schemas is a separate layer.
The parser uses BigInt for ZigZag and bounds varints before conversion to safe lengths or
field IDs. It accounts for collection cardinality before allocation and for depth/value
budgets while reading. Decode failures never replace the source with partial metadata.

Independent Python Thrift reads establish wire-tree parity on the full captured corpus
and a native-written boundary fixture. This avoids trusting one decoder to validate its
own output. The resulting schema describes the wire view; it does not yet describe the
complete Parquet IDL or establish semantically safe edits. Unknown wire types block with
raw source retained because their value length cannot be inferred safely.

AC6 maps the exact wire tree through static descriptors compiled from pinned parquet.thrift.
All 69 declarations and 176 fields receive generated schemas; the browser mapper consumes
those descriptors without a Python or dynamic-IDL dependency. Its named view never replaces
source or wire authority. Known fields require exact wire kinds, union cardinality and
requiredness; duplicate known IDs block mapping. Unknown IDs remain ordered wire entries
under $unknown, and unknown enum values retain numeric strings with warnings. Effective
IDL defaults are recorded in descriptors but never inserted into the source-derived view.

A separate thriftpy2-generated native reader supplies independent named expectations for
all 39 files. Schema-tree consistency, logical constraints and metadata edit/re-encoding
still require further implementation; generating IDL schemas does not discharge those
requirements. Page headers/indexes/crypto structs have generated shape schemas but do not
yet have dedicated public decoders or complete native fixture coverage.

AC7 consumes the named flat schema using one bounded preorder cursor. Each node retains
its source index and array-valued path; leaf ordinals provide column identity even when
names duplicate or contain dots. Levels accumulate from non-root repetition only. The
derived tree is held locally until topology, available column links and exact row-count
checks finish; failures preserve metadata/wire/source without exposing a partial tree.
Encrypted/unavailable column metadata limits link evidence rather than fabricating a link.
Logical annotation compatibility and data/page verification remain downstream checks.

AC8 adds a separate logical annotation pass over the checked physical tree. Modern and
legacy metadata are retained independently; effective legacy defaults exist only in the
annotation view. Exact BigInt decimal-capacity checks have a bounded 4,096-byte carrier
limit, with larger cases marked uninterpreted. Per-annotation validation distinguishes
implemented-rule success from invalid and uninterpreted meanings; global complete remains
false. Logical failures preserve the previously valid physical view. No values are coerced,
statistics rewritten or modern UTC/local flags collapsed into legacy meanings.

AC9 adds containers.ts as a separate reading view over scalar inspection. A preorder walk
uses physical tree indexes and annotation origins, interprets legacy element wrappers before
visiting nested lists, and suppresses a second map interpretation for MAP_KEY_VALUE entry
markers. Names are consulted only for the explicit legacy list tuple rules. Source bytes
and metadata are never rewritten. A separate generated result schema describes every view.
Native metadata-only fixtures and Chromium exercise the view; stored data, VARIANT/FILE,
implicit unannotated repeated-field projections and safe edits remain subsequent work.

AC10 adds encode.ts and transform.ts. The encoder enforces wire kinds, widths and bounded
allocation while retaining unknown/repeated native IDs in the generic wire API. The guarded
file transform has a stricter boundary: named metadata must contain no unknown/crypto fields
or future enum codes. A trailing footer region blocks rewriting before any output is exposed.
Append adds file field 5 or extends its list, encodes the tree, preserves the entire original
prefix and updates the little-endian footer length. The full UMF envelope is cloned so
unrelated declared extension content survives. Result schemas distinguish blocked results
from successful output. Native and browser evidence covers metadata append; schema rewriting
and values/codecs remain separate work.

AC11 adds rename.ts, reusing an internal footer reconstruction helper shared with metadata
append. The rename walks the physical tree to locate the selected index/parent, calculates
affected leaf ordinals, edits native SchemaElement field 4 and ColumnMetaData field 3, then
reruns schema/container interpretation. The final container view must be unchanged, which
protects name-sensitive legacy list rules. Metadata with possible schema references blocks
rather than being removed or left stale. The helper preserves the entire prefix and UMF
envelope; operation-specific guards run before rewriting. Native and browser fixtures cover
all indexes in three compression variants, with multiple row groups, page indexes/checksums
and field IDs. Wider schema transformations and embedded metadata policies remain open.

AC12 tests an alternative physical-structure decoder experiment. It aliases every native
schema element and column path in transient hyparquet metadata, removes interpretation
annotations there, and reconstructs values with the authoritative UMF schema. This avoids
unsafe JavaScript property names, dotted-path collisions, premature map materialization and
nested decimal rounding. Ordered maps keep duplicate/non-string keys. Four independent native
fixtures exercise page/dictionary combinations in Bun and Chromium. The trial output has a
JSON Schema but is not exported by src/index.ts. Before adoption, bound decompression/page
allocations and establish malformed-input behavior, complete scalar/carrier validation and
codec limits; input byte limits alone do not bound decompressed allocations.

AC13 extracts reusable internal compact.ts and idl-map.ts components from footer decoding,
then pages.ts walks disjoint declared column ranges without touching compressed payloads.
It maps bounded header prefixes, checks known page variants/offsets/counts and exposes no
partial inventory on failure. Shared parser regressions remain covered by the full Parquet
suite. Fixed declaration budgets constrain this inspector, but do not make hyparquet's page
body allocations safe: actual decompressed length, RLE/delta counts and binary value lengths
must be bounded in the eventual decoder too. The public value API remains unimplemented.

AC14 adds snappy.ts (internal bounded raw-block decoder) and bodies.ts (public physical
body view). Codecs are checked before decoding; stored CRC32 is verified before each body
is expanded. Snappy validates its own length prefix against the header before allocation,
checks every copy range and preserves overlapping back-references by sequential copying.
V2 repetition/definition bytes bypass decompression. Output pages are assigned only after
all pages succeed. Exact decompressed bytes have a JSON Schema and native/browser evidence;
value assembly and its RLE/delta/dictionary counts remain a distinct allocation boundary.

AC15 adds hybrid.ts with bounded sequential RLE/bit-packed decoding. It uses exact unsigned
Number arithmetic through 32 bits, validates run counts before appending values, checks
packed payload length before reading, and retains at most seven padding values separately.
An optional maximum value will enforce level/dictionary domains. The internal API expects
a raw run stream: V1 length prefixes, V2 byte lengths and dictionary width prefixes must be
handled by subsequent page-specific integration. Native dictionary fixtures verify common
widths; browser and malformed-input checks cover the kernel independently of value assembly.

AC16 integrates the bounded hybrid kernel in levels.ts. The decoder locates V1/V2 regions,
uses physical leaf maxima, handles implicit zero levels, and returns physical-value offsets
rather than interpreting the remaining bytes prematurely. It reconciles level domains,
row-group row starts and V2 null/row declarations. Hexadecimal body conversion allocates a
bounded byte buffer directly, avoiding a per-byte regex match array. Independent Python
reference arrays and native-readable authored row layouts qualify the evidence; dictionary
and physical-value decoding are the next allocation/meaning boundaries.

AC17 adds plain.ts for exact physical carriers and physical.ts for dictionary/page integration.
PLAIN uses bounded DataView reads and exact byte consumption; floating values remain raw bits.
Dictionary indexes use the hybrid kernel with a dictionary-size maximum. Materialization is
budgeted separately because a small dictionary can expand into many large repeated values.
The API publishes results only after all pages succeed and copies dictionary entry objects
for data-page views. Current composition reuses body/level/schema inspections; optimization
can follow semantic coverage. Next assemble columns and apply authoritative logical semantics
without discarding physical source or opaque metadata.

AC18 introduces rows.ts. Each leaf maintains row and repeated-depth coordinates across its
data pages. Shared records use Map keys containing schema indexes, avoiding name coercion.
Presence conflicts are checked while merging; final traversal requires every expected child,
which detects inconsistent repeated cardinality across leaves. Separate construction limits
bound intermediate row nodes before allocation. Native scalar-to-physical reconstruction
verifies rows without using the implementation's level-coordinate algorithm. The physical
wrappers and exact carriers remain intact for later logical projection.

AC19 adds values.ts over the bounded row assembler. Native index-based container views guide
LIST/MAP lowering; scalar interpretation keeps physical values and preserves native temporal
flags. Exact integer arithmetic handles decimal and unsigned carriers. A bounded syntax-only
JSON scanner replaces object parsing so duplicate keys and number text remain untouched.
Unsupported known annotations remain opaque with their physical representation; warnings are
deduplicated per schema field. Projection budgets bound decimal work and total text. Native
INT96-to-timestamp behavior is recorded as a projection difference rather than adopted without
a governing semantic decision. The public typed path no longer depends on the experimental
hyparquet decoder; it remains available as earlier evidence only.

AC20 implements an explicit footer correction over the existing bounded Compact Protocol and
IDL readers. It identifies only dictionary-at-data-offset columns without dictionary offsets,
checks the following header, and edits the two corresponding ColumnMetaData wire fields.
Candidate validation reruns all page and typed-value checks. The source envelope and payload
prefix remain untouched; source and candidate coexist in the result. No writer-name heuristic
or automatic metadata normalization is added to ordinary decoding. Independent native Thrift
comparison and PyArrow reads verify the scoped correction; Delta recovery consumes the candidate
only through an explicit second call.
