---
ddx:
  id: CONTRACT-003
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# CONTRACT-003: Protobuf native extension

**Version:** 0.1.0. **Profile:** `protobuf-es-2.15.0`. **State:** descriptor layer
and optional native source compiler/emitter implemented with scoped evidence.
Edition 2024 source operations remain unsupported by the pinned compiler.

## Purpose and Boundaries

Represent native Protobuf schema meaning without equating its presence, numeric,
oneof, default or evolution rules with JSON Schema. Initial import/export consumes
binary `google.protobuf.FileDescriptorSet`. A descriptor is the compiler's native
schema representation, not a serialized application message. Source `.proto`
compilation and emission are available through explicit compiler/emitter interfaces. No concepts are promoted to core.

The 30 recursive definitions in `spec/extensions/protobuf/schema.json` cover the
complete descriptor message graph exposed by @bufbuild/protobuf 2.15.0. Unknown
wire fields include custom options and newer descriptor fields; preserve their
number, wire type and exact value bytes without claiming their interpretation.

## Normative Representation

The element payload is `{descriptorProfile,descriptorSet}`. The set and every
nested message are `{type,fields,unknown}`. `type` is the fully qualified native
descriptor message name. `fields` uses native snake_case field names. Omission
retains field absence; explicit default values remain present. Repeated fields
are ordered arrays; nested messages use the same representation.

32-bit numbers and enums are JSON integers. 64-bit integers use canonical decimal
strings; bytes use lowercase hex. Floating fields use JSON numbers or exact
special tokens `NaN`, `Infinity`, `-Infinity`, `-0`. Native field default expressions
remain the descriptor's original strings; do not coerce them into host numbers.
`unknown` is an ordered array of `{number,wireType,data}` where data is hex-encoded
wire value bytes, including any length prefix. This representation is distinct
from application ProtoJSON, which cannot retain every unknown descriptor field.

SourceCodeInfo, synthetic oneofs, declaration ordering, options, imports, service
methods, reserved ranges and feature declarations are retained. Binary field order,
duplicate singular wire occurrences and source lexical text are not guaranteed.
Descriptors represent parsed native meaning; source preservation needs the later
source-language adapter and artifact bundle. No field is stripped for comparisons.

## Library Operations

- `importProtobufDescriptorSet(bytes,{id})` constructs the canonical schema element.
- `getProtobufDescriptorSet(document)` returns a copied, editable descriptor tree.
- `exportProtobufDescriptorSet(document)` emits binary descriptors; unknown UMF
  representation fields with no native destination block export explicitly.
- `exportProtobufBundle(document)` returns binary descriptors, retained source UMF
  and diagnostics; target-only descriptors cannot retain unrelated vocabularies.
- `inspectProtobuf(document)` checks structure, runtime scalar rules and descriptor
  registry construction. Unknown wire semantics and compilation limits are warnings.
- `proposeProtobufDescriptorEdit(document,callback)` creates a candidate on a copy,
  verifies scalar/representation constraints and returns diagnostics. It does not
  claim a compiler-validated safe edit. Original input remains unchanged on failure.

All inspected descriptors currently receive `PROTOBUF_COMPILER_REQUIRED`; complete
semantic validation remains false until a native compiler path is established.
A candidate must be compiled before being accepted as a valid native schema.
The callback is trusted caller code, not artifact-provided executable content.

## Errors, Compatibility and Limits

Malformed binary, malformed tree, wrong field types, impossible runtime scalar
values and unknown representation fields fail explicitly through `UmfError`.
Unknown native wire fields remain exportable with incomplete interpretation.
Core value/depth/text limits apply. The binary input/output bound is 4 MB.
No implicit network retrieval occurs. Explicit descriptor dependencies must travel
with the set; registry resolution errors are reported rather than guessed away.
Future descriptor profiles require a versioned schema and migration evidence.

## Evidence

US-003 records executed descriptor tests, independent protoc comparisons, candidate
edits and browser checks. `fixtures/protobuf/descriptor-results.json` names every
corpus file. The native oracle is protoc 36.2. Proto2, proto3 and Edition 2023 are
covered by authored constructs; descriptor retention alone does not certify all
source syntax or all Editions. Broader native behavior tests and edited-source
round trips remain required before completing B-006 or SPIKE-001.


## Source Compilation and Archive

`importProtobufSources({files,roots},compiler,{id})` accepts an explicit source map
and distinct supplied root filenames. The trusted compiler interface returns a
binary descriptor set plus its version identity. The optional implementation is
protocompile 0.14.1 compiled with Go 1.27.1 into a browser worker (ADR-003).
The resolver never fetches imports or consults a host filesystem. Input bounds
apply before dispatch. Compiler errors fail the import.

The optional payload `sourceArchive` contains `{role:"original",compiler,files,roots}`.
It retains original source text separately from the current descriptor state.
A descriptor edit does not rewrite this archive, and replaying it is not an edited
native export. Full bundle export preserves the archive; descriptor-only output
cannot carry it. Source emission derives output from the current descriptors. Newer Editions outside
the pinned compiler's supported versions remain unsupported for compilation even
when their compiled descriptors can be preserved.

Native source compiler comparison includes `protoc --retain_options`. SourceCodeInfo
is excluded only across different compilers; source files remain archived. Omitted
syntax is normalized to proto2; all other descriptor fields are compared unchanged.
The Python protobuf 7.36.2 oracle checks 42 expected native behaviors and detects
mutations to default values and optional presence. This is authored corpus evidence,
not universal language or runtime conformance.


## Source Emission

`exportProtobufSources(document,emitter)` returns `{files,compiler,printer,source,
diagnostics}`. The installed emitter is protoprint 1.18.1 in the same optional WASM
worker. It emits all supplied descriptor files, including dependencies, from a copy
of the current descriptor state. It never substitutes archived source for an edit.
The original UMF document travels in `source` to retain all metadata and semantics.

Before returning, the installed emitter recompiles every emitted file and compares
native descriptors against an untouched copy of the input. File-set changes or
any non-layout descriptor difference fail the operation. Comparison excludes
SourceCodeInfo and treats omitted syntax as proto2. Custom options are compared
through a consistent wire decoding profile so decoded extensions and unknown-wire
representations of the same options do not yield false mismatches. Option bytes,
presence, declaration ordering, defaults and feature settings are not discarded.
An opaque descriptor-set extension, or another unknown field with no expressible
source counterpart, fails source emission while remaining available in UMF and
binary descriptor export.

Every source emission reports `PROTOBUF_SOURCE_LAYOUT`: formatting, source spans
and comment attachment may change. This is an explicit target limitation; original
source and SourceCodeInfo remain recoverable from retained UMF. A source-only
round trip does not establish lexical preservation. Compiler success is not a claim
of universal semantic understanding of custom options.

Executed native evidence covers 15 standard roots plus the authored proto2, proto3
and Edition 2023 cases. Four standard Edition 2024 roots fail explicitly because
the pinned compiler only supports through Edition 2023. `emission-corpus-results.json`
records every standard root; `emission-results.json` records the edited-source
case; `emission-behavior-results.json` records 42 native behavior checks. Actual
Chromium executes descriptor edit → source emission → source reimport.
