---
ddx:
  id: CONTRACT-016
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-016
      kind: informed_by
    - id: SPIKE-003
      kind: informed_by
---

# CONTRACT-016: Arrow integration schema JSON

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Scope and representation

`umf.arrow` retains the schema portion of Arrow integration JSON as core NativeJson.
The entire extension representation is described by spec/extensions/arrow/schema.json;
integration-schema.json describes the known schema/field/type/metadata/dictionary grammar.
It admits future type names and unknown properties without claiming to interpret them.
The grammar is an authored profile, not a completed transcription of Schema.fbs or a
claim that all Arrow IPC/data forms have been implemented.

Field/child order, metadata entry order, duplicates, unknown parameters and exact number
tokens remain authoritative. Extension-type metadata is retained as strings; no external
extension is executed or inferred. Struct aliases are not normalized during JSON export.
The library does not substitute the native JavaScript Schema object for this source.

## Public API

`importArrowSchema(text,{id})` parses bounded JSON into a new Arrow element payload and
validates known structural/semantic rules. `exportArrowSchema(document)` renders the
current exact tree as native schema JSON. It preserves unknown native content; unknown
payload or tagged-tree representation fields block export because they have no native
JSON location. UMF serialization continues to preserve those fields.

`getArrowNode(document,pointer)` returns a copied native node.
`proposeArrowNodeEdit(document,pointer,text)` replaces an existing node in a copied document,
validates it and returns the document plus incomplete inspection. The original remains
unchanged. `inspectArrow` always reports incomplete native verification and identifies
unknown content/types and duplicate metadata.

Known checks cover type parameter shapes, integer bit widths, time unit/width agreement,
decimal precision capacity, child counts, primitive child prohibition, union IDs versus
children, map entries/key nullability and run-end child type/nullability. Dictionary IDs
must be exact signed 64-bit integers. Known integer parameters are checked from original
number tokens, including scientific notation; validation-only host conversion cannot turn
a fractional token into an accepted integer. Native library numeric limits are separate.

## Evidence and limits

The 52-case authored corpus round-trips through UMF JSON/YAML, including all three types
rejected by the pinned native integration decoder. Re-decoding the exported schemas
reproduces the existing native results: 49 decode and three remain unsupported. Metadata
collapse and dictionary-ID changes observed in SPIKE-003 are not hidden or relabeled as
successful native fidelity.

The initial schema JSON API is now complemented by guarded schema-only IPC export below.
Arbitrary native IPC/file/stream import/export,
unknown FlatBuffer fields, endianness/features, dictionary memo consistency and data,
full map/union/run-end native behavior, extension-type semantics, upstream corpora and
cross-system projections remain open. JSON preservation is not a declaration that an
arbitrary schema can execute or encode arrays in Arrow JS 21.2.0 or PyArrow 21.0.0.

## Guarded schema-only IPC export

`exportArrowSchemaIpc(document,backend)` returns a copied Uint8Array containing a native
schema-only IPC stream. The caller explicitly supplies the pinned apache-arrow@21.2.0
backend. Its encode operation provides the native descriptor before encoding, the actual
IPC re-read descriptor and emitted bytes; this is a trusted integration assertion, not
cryptographic backend attestation. The optional implementation is native/arrow/runtime.ts,
with a separate browser build via `bun run build:arrow`. Core does not load it implicitly.

Unknown native fields/types, duplicate metadata and unknown representation fields block
IPC export. The exact schema JSON remains available. Host JSON conversion must satisfy
the bounded core numeric guard: dictionary IDs outside JavaScript's safe integer range
therefore remain JSON-only even when valid signed 64-bit IDs. Unsupported native types
propagate a failure rather than producing partial bytes.

Both native descriptors must equal the preserved schema after a fixed normalization:
missing metadata/children become empty arrays, struct/NONE become struct_/null, decimal
bit width defaults to 128, absent/null timestamp timezone becomes empty, map keysSorted
defaults false, and dictionary index type/orderedness default to signed int32/false.
Metadata entries and their order, dictionary IDs, field names/nullability, units, widths
and other parameters are never dropped or normalized away. The source remains unchanged.
Backend decode changes and native IPC re-read changes raise distinct errors.

The 52-case matrix exports 48 schemas. Duplicate metadata and listview/largelistview/
runendencoded block. PyArrow 21.0.0 independently reads the 48 outputs and confirms
metadata/native-type equality against the pinned native baseline; it verifies an edited
field separately. The schema-only stream contains no record-batch or dictionary values.
This API does not import arbitrary IPC, preserve unknown FlatBuffer fields from an
existing binary source, guarantee data encoding, or solve cross-runtime ID reassignment.


## Exact IPC source capture

The separate `umf.arrow.ipc` 0.1.0 package is defined by
spec/extensions/arrow-ipc/{schema.json,package.json}. Its payload is
`{profile:"arrow-ipc-source",encoding:"hex",bytes:<lowercase hex>}` at module `ipc`,
element `source`. The schema completely describes this capture representation, not
all Arrow FlatBuffer semantic fields. Unknown payload properties remain allowed and
preserved in UMF; original-byte export blocks them because they have no byte location.

`captureArrowIpc(bytes,{id})` captures up to 1,000,000 bytes. Empty, invalid, unsupported
and trailing content are intentionally accepted without a native-validity claim.
`exportArrowIpcCapture(document)` returns copied bytes from the current capture only;
it never regenerates IPC from a schema observation. `inspectArrowIpcCapture` validates
the envelope, always reports incomplete interpretation, and distinguishes structural
validity from native Arrow validity. This is an archive capability, not complete IPC
semantic import or validation. Captures are caller-editable data, not attestations.

`observeArrowIpcCapture(document,backend)` returns copied source, backend identity,
`complete:false`, and either `status:"observed"` with a native JSON schema observation
or `status:"uninterpreted"` with a failure message. It requires the explicit pinned
apache-arrow@21.2.0 backend contract. Native source bytes are copied before passing them
to the backend; backend mutations cannot change the capture. Non-JSON or unsafe numeric
observations fail conservatively while source survives. The backend is trusted, not
attested. The optional `observationBackend` in native/arrow/runtime.ts opens the native
reader, describes its schema and closes it. It does not consume/validate all batches,
trailing content, concatenated streams, unknown metadata or dictionary/data semantics.

Observations are returned separately, never persisted as authoritative schema within
the capture payload. Editing a derived schema cannot update or invalidate source bytes
implicitly. Schema-only export remains the separate guarded API above; it cannot be
presented as an edited version of an archived dataset without further data conversion.

All 18 authored PyArrow file/stream fixtures survive byte-exact JSON/YAML round trips in
Bun and Chromium. Twelve yield native schema observations; six view/run-end inputs remain
uninterpreted. Bun tests also cover invalid input, ignored trailing bytes, defensive
copies, failed/mutating backends, malformed hex, size limits and unknown representation
content. These checks do not complete framing validation, FlatBuffer semantic modeling,
IPC edits, upstream corpus coverage or cross-system projections.


## Logical FlatBuffer metadata model

`umf.arrow.flatbuffer` 0.1.0 describes all declarations in Apache Arrow 21.0.0's
Schema.fbs, Message.fbs, File.fbs, Tensor.fbs and SparseTensor.fbs, pinned to commit
`ee4d09ebef61c663c1efbfa4c18e518a03b798be`. Vendored sources, license/notice and hashes
are under spec/extensions/arrow/flatbuffers/. The model schema and declaration inventory
are spec/extensions/arrow/flatbuffer-model.schema.json and flatbuffer-inventory.json;
the extension envelope/package live under spec/extensions/arrow-flatbuffer/.

The logical root is `{rootType,value}`, where rootType is Schema, Message, Footer,
Tensor or SparseTensor. Tables/structs use native field names. Signed int64 values use
canonical decimal strings with exact signed bounds; enums use declared names; unions
use `{type:<variant>,value:<member>}` or `{type:"NONE"}`. Required unions cannot be NONE.
All struct members are required. Table fields follow explicit native requiredness;
absent scalar fields are retained as absent, and explicit source defaults are schema
annotations only. Unknown table properties and ordered duplicate metadata survive.
Unknown enum/union variants currently require retaining the IPC source capture; this
logical profile does not interpret them. This is not the flatc JSON spelling.

`importArrowFlatbufferModel(text,{id})` and `exportArrowFlatbufferModel(document)`
round-trip that logical JSON profile at module metadata / element root, using payload
`{profile:"arrow-flatbuffer-model",model:<root>}`. Unknown envelope fields survive UMF
but block profile export. `inspectArrowFlatbufferModel` always returns complete:false:
structural validity does not establish buffer consistency, type-specific constraints,
metadata meaning, extension-type execution, or native binary fidelity. This package
provides the metadata vocabulary; Raw metadata decoding and guarded encoding are specified below; full IPC framing and dataset rewriting remain open.

The strict source generator rejects unparsed syntax, unknown field types, duplicate
declarations and source-hash changes. FlatBuffers compiler 23.5.26 independently agrees
on all 59 declaration names, 85 field names, 64 explicit enum/union member names and
required table fields. This comparison does not prove field-type/default equivalence or
wire encoding. Four Bun tests (2,217 assertions) cover generated structure, exact int64
bounds, invalid unions/required fields, and logical model round trips for all five roots.
Chromium checks a schema with big-endian/features metadata, an exact max-int64 dictionary
ID, unknown table properties and both UMF serializations. No core promotion follows.


## Raw FlatBuffer metadata decoding

`decodeArrowFlatbuffer(bytes,{id,rootType})` accepts a non-size-prefixed raw metadata
buffer whose caller-declared rootType is Schema, Message, Footer, Tensor or SparseTensor.
It returns an exact source capture, complete:false, diagnostics, and either decoded
logical model/status or uninterpreted status without a partial model. The source uses
the byte-capture representation; its presence does not imply a framed IPC stream/file.
The caller's root declaration is necessary because raw FlatBuffers are not self-typing.

The decoder reads known tables, structs, enum values, tagged unions, vectors, UTF-8
strings and scalar fields directly from the pinned inventory. It retains physical
field presence rather than materializing omitted defaults. Signed long values become
exact decimal strings. Ordered metadata entries remain arrays, preserving duplicate
keys. Native JS's type decoder is not involved, allowing listview/largelistview/runend
metadata to be represented without claiming data execution support for those types.

Unknown nonzero table slots produce explicit warnings and remain in source bytes;
known fields can still be decoded. Unknown enum or union values leave the result
uninterpreted. Source bytes retain all content, including unvisited/trailing bytes.
This is not a claim of complete FlatBuffer verification or complete byte consumption.
Bounds, alignment, vtable/object extents, string termination/UTF-8, union consistency,
vector counts, recursion and total traversal limits constrain known-field decoding.
Arrow-specific invariants and buffer/body consistency remain separate required work.

Evidence comprises 65 metadata roots extracted from the 18 PyArrow file/stream inputs
plus five authored native-compiler fixtures covering Schema, Tensor and all three sparse
index variants. All 70 decoded models equal independent flatc 23.5.26 output after an
explicit representation mapping; Python preserves native int64 JSON integers exactly.
The authored schema includes max-int64 dictionary identity, big endianness, feature
flags and duplicate metadata. Tensor fixtures describe metadata only, without data
bodies or a claim that their buffers have been executed. Chromium agrees on all 70
models and source bytes. Negative tests cover unknown slots/enums, malformed/truncated
buffers and oversized vector counts. Guarded encoding and logical edits are specified below; complete IPC import remains open.


## Guarded metadata encoding and edits

`encodeArrowFlatbuffer(document,backend)` encodes a single logical metadata root using
an explicit flatbuffers@25.9.23 backend. The optional implementation is
native/arrow/flatbuffer-runtime.ts, also exported as flatbufferBackend by the optional
Arrow runtime bundle. Core does not load FlatBuffers implicitly. Before encoding, core
validates the logical profile and rejects unknown table properties or wire-omission
markers. After encoding, it decodes the actual emitted bytes and compares the complete
logical model, including absent versus present fields, arrays, metadata ordering, union
variants and exact long values. Changes, malformed output or unknown slots block export.
Output is copied and bounded to the same one-million-byte capture limit.

The backend forces physical presence only for fields present in the logical model,
including zero/default values. It preserves struct layouts, ordered metadata duplicates,
exact long values, union discriminator presence, empty vectors and absent fields.
This guarantees the compared metadata model, not byte identity, full wire verification,
complete consumption, or native data/semantic validity. Backend identity is a trusted
integration contract, not attestation. Original capture bytes remain separate.

The decoder now records any unknown wire slots in the logical payload's optional
wireOmissions array of path/message entries. The JSON Schema describes this marker;
UMF retains it. Both standalone logical export and binary encoding block the marker,
preventing a known-field model from being presented as a full re-encoding of unknown
source metadata. Markers and source are caller-editable data, not tamper-proof evidence.

`proposeArrowFlatbufferEdit(document,pointer,replacement)` copies the document, replaces
an existing logical-model node and validates the candidate. The original remains
unchanged; the returned validation remains semantically incomplete. Invalid paths or
out-of-range values fail. Unknown wire content blocks this operation conservatively.
Editing or encoding metadata never implicitly rewrites an archived IPC dataset, migrates
record-batch buffers, or resolves dictionary/body consistency.

All 70 decoded metadata roots re-encode in Bun and Chromium. Native flatc independently
agrees on those 70 outputs plus two authored outputs: max-int64 dictionary ID edited to
min-int64, and explicit zero/default/empty-vector fields. Regression checks additionally
block unknown logical properties, mutated-backend output and lossy UTF-8 conversion of
an unpaired surrogate. Full IPC framing, body-aware edits, native semantic validation,
upstream corpora and cross-system projections remain required work.


## IPC boundary inspection

`inspectArrowIpcLayout(captureDocument)` traverses a byte capture and returns source,
format, frames, optional decoded footer, EOS offset, consumed prefix length, trailing
byte count, diagnostics and complete:false. Its JSON Schema is
spec/extensions/arrow-ipc/layout-result.schema.json, with an explicit reference to the
core document schema. A frame identifies its prefix, metadata and body offsets/lengths,
known message kind and decoded logical metadata. Bodies remain in captured source;
inspection neither executes nor regenerates them.

A leading ARROW1 identifies file framing. The reader checks final magic/footer bounds,
decodes Footer, and inspects the embedded stream up to the footer. Both continuation
and legacy four-byte prefixes are recognized. Metadata/body extents and eight-byte
message alignment are checked; negative/oversized lengths or undecodable metadata stop
inspection with an error. At most 1,024 frames are traversed. A schema message must come
first. Missing EOS is allowed for streams ending on a message boundary; file framing
requires the embedded EOS. Complete native semantic validation remains separate.

bytesAccountedFor means the declared frame/body extents, optional EOS and file footer
cover the captured input without a remaining gap. It does not mean every metadata field
or body byte has been semantically interpreted. Bytes following EOS remain reported;
a concatenated second stream is not silently accepted as part of the first. On failure,
previous frames and the copied source survive. consumed is the contiguous prefix read;
trailingBytes counts the remaining suffix before a separately decoded file footer, if
present. For a fully accounted file, consumed equals total length and trailingBytes is 0.
No framing report can assert complete:true.

Nineteen inputs agree with PyArrow 21.0.0 native message-reader boundaries: the 18
existing files/streams plus an authored legacy-prefix stream. Chromium repeats all 19
public inspections. Tests distinguish missing optional EOS, trailing garbage, concatenated
streams, truncated prefixes/metadata/bodies, and corrupt footer offsets/magic. The native
oracle is scripts/arrow-ipc-layout-oracle.py; its recorded offsets are under the IPC corpus.
Footer/schema/block agreement, dictionary evolution, compressed-body decoding and actual
buffer/data validity remain unverified; an explicit report diagnostic states those gaps.


## Footer and embedded-stream consistency

`inspectArrowIpcConsistency(captureDocument)` returns the complete layout report plus
complete:false, diagnostics and footerChecks: not-applicable for streams, unverified
for files whose boundaries or metadata are insufficient, matched for checked agreement,
or mismatch for observed differences. The result schema is
spec/extensions/arrow-ipc/consistency-result.schema.json, referencing the layout/core
schemas. Layout diagnostics remain available; not-applicable does not declare a stream
valid. Unknown wire slots prevent a matched file claim.

Checks compare footer metadata version, schema and custom metadata with the first schema
message, and check dictionary/record-batch block counts, offsets, metadata lengths and
body lengths against observed messages. Duplicate offsets are errors. Recommended block
ordering is checked separately as a warning: mismatch is an observation, not an assertion
that every ordering difference makes an Arrow file invalid. Offsets/long lengths are
compared exactly with bigint; they cannot round through host-number conversion.

Schema comparison interprets declared scalar defaults and absent vectors as empty, while
retaining source presence in the actual model. It does not merge duplicate metadata keys
or ignore their order. Strings and optional child tables retain their distinctions.
Matched describes these declaration comparisons only. It cannot establish dictionary
replacement/delta correctness, array buffers, compression or extension-type semantics.

All nine authored native files have matched footer declarations; the ten modern/legacy
streams return not-applicable. Chromium agrees across all 19 inputs. Six validly framed
footer mutations demonstrate schema/version, offset/length, duplicate and missing-block
mismatches. Reordered blocks produce only the documented ordering warnings. JSON Schema
validation and typechecking pass. Data-semantic validation and source/body-aware edits
remain required before broader Arrow support claims.


## Dataset field-name transformation

`renameArrowIpcField(captureDocument,{fieldPath,name,uninterpretedMetadata:
"preserve-and-report"},backend)` returns copied source, a candidate capture, a fresh
consistency report, bodyBytesPreserved:true, complete:false and explicit diagnostics.
Its result JSON Schema is spec/extensions/arrow-ipc/rename-result.schema.json. fieldPath
is a nonempty array of zero-based positions, descending through fields/children; names
are not used as identity, so duplicate names cannot make selection ambiguous.

Input must have fully accounted known framing, one body-free initial schema, only
record/dictionary messages afterward, and matching footer declarations when present.
Unknown wire slots, trailing content, invalid paths or failed encoding reject without
mutating the original. Modern/legacy prefix style and presence/absence of optional
stream EOS are retained. Schema and footer schema copies receive the same name change;
all dictionary/record block offsets are recalculated after metadata size changes.

Every non-schema message, including its metadata, padding and body, is copied exactly.
The operation verifies that property against the reconstructed layout before returning.
All original UMF envelope and unrelated extension content survive in the candidate;
source is separately copied. Field types, dictionary identities, body bytes and other
metadata are not edited. The optional metadata encoding backend is the existing explicit
flatbuffers@25.9.23 contract. Capture size limits still apply to the finished artifact.

The required metadata policy acknowledges that names may be referenced in uninterpreted
metadata or external systems. Those references are preserved, not automatically rewritten,
and the result reports that risk. Byte-preserved data does not imply that the original
array/dictionary semantics were valid. No automatic type migration, body conversion or
reference repair is claimed.

PyArrow 21.0.0 reads all 19 transformed corpus datasets (files, modern/legacy streams,
including view/run-end types) and compares the complete tables with expected renamed
schemas: all data and other metadata match. Chromium emits byte-identical renamed
artifacts to the Bun outputs checked by PyArrow. Unit tests additionally cover nested
field selection, absent EOS, source/envelope preservation, invalid paths and rejection
of trailing content. Broader schema edits, dictionary/data semantics, upstream corpora
and cross-system projections remain open.


## Pinned upstream integration evidence

The complete `data/arrow-ipc-stream/integration/` subtree of apache/arrow-testing at
commit `9ff285c88565f0f6abc855918c6a342e70e4909c` is retained under fixtures/arrow/upstream,
with original paths, sizes, SHA-256 hashes, verified Git blob hashes and Apache license.
The selection contains 182 binary inputs and 91 compressed integration JSON inputs,
plus README/license (275 files). No integration case is filtered by successful execution.
The separate upstream fuzz directories are not included in this coverage claim.

The seven source groups are 0.14.1, 0.17.1, 1.0.0-bigendian, 1.0.0-littleendian,
2.0.0-compression, 4.0.0-shareddict and cpp-21.0.0. They exercise historical prefixes,
endianness, compression, dictionaries, metadata, empty/no batches, nested/recursive shapes,
views, run-end encoding, unions and newer decimal widths. Directory labels identify
fixture provenance, not an assertion of complete compatibility with those releases.

All 182 binary inputs survive exact UMF JSON/YAML round trips. All 91 extracted schema
portions pass schema JSON import and exact UMF round trips. Original compressed inputs
remain authoritative; schema extraction rejects duplicate object keys and unexpected
floating-point schema values rather than rounding them through Python extraction.
The integration JSON data columns are retained upstream fixtures, not a newly implemented
UMF array JSON adapter.

All binary inputs pass framing. Renaming succeeds for 179, and PyArrow 21.0.0 independently
compares complete renamed tables, including metadata. Three 0.14.1 files remain blocked:
generated_decimal.arrow_file, generated_primitive_no_batches.arrow_file and
generated_primitive_zerolength.arrow_file. Their schema messages carry V4, while footer
version is absent (V1 under the pinned FlatBuffer definition). PyArrow reads the originals
with 7, 0 and 0 rows respectively. UMF reports the version discrepancy and retains exact
source; native reader acceptance is not relabeled as declaration agreement. A future
historical-profile policy must address this explicitly before allowing such transforms.

Chromium repeats all 182 binary and 91 schema round trips and emits the same 179 renamed
byte sequences independently checked by PyArrow. Corpus scripts fail if the expected
counts or specific blocked cases change. These results materially expand native evidence;
they do not complete dictionary-state/body semantic validation, general type migrations,
fuzz robustness, cross-system projections or all Arrow/UMF completion requirements.
