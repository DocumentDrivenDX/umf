---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-record-type
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-ideals-next-wave
      kind: informed_by
---

# R8 Parquet Record Type TypeScript predecessor packet

This bounded packet freezes the TypeScript outcomes for
`classifyParquetRecordType` and `recoverParquetRecordTypeBytes` against pinned
Parquet fixtures. It does not implement or map the operations, select a host route,
or update the R8 gap inventory.

The full output and source/fixture pins are in
[`typescript-predecessor.json`](typescript-predecessor.json).

## Ledger and implementation boundary

The captured R8 gap ledger has two logical executable declarations in this
family: `classifyParquetRecordType` and `recoverParquetRecordTypeBytes`. Each is
still a TypeScript `./reference` implementation and is also inherited by the
Node and browser package roots. All six ledger rows have no accepted Rust mapping
and no proven binding route. The TypeScript source hash in the ledger is
`a1fcfef747b3843dd532ac700046950264ebbaec9f4a529d5b2aea7c78911b4c`.

The operation consumes a current UMF Document containing a captured Parquet source
and a schema index; it does not read files or fetch resources. It relies on the
existing Parquet capture, schema and LIST/MAP interpretation helpers, the core
envelope and kind-operation schemas, and the exact
`parquet-record-type-classification` result schema. Its bounded interpretation is
non-root struct-valued members after LIST/MAP interpretation. Repetition stays in
the native source. LIST/MAP wrappers, primitives, roots, unknown annotations,
duplicate sibling names, conflicting author assertions and stale receipts block.

Existing Rust provides generic core Record Type operations and generic source
value/capture support, but no Parquet module, Parquet schema/container decoder,
Parquet record-type implementation or corresponding wire operation. The
predecessor is therefore capturable, while a Rust candidate requires an opt-in
Parquet source/interpretation foundation first. Interface/resource recommendation
sent to the implementation owner: establish that opt-in foundation, then expose
the classifier behind a retained engine using its exact result schema and the
core/kind schemas; preserve the original byte capture separately from index-based
field interpretation, and keep LIST/MAP interpretation claims tied to the pinned
native fixtures.

## Frozen outcomes

The matrix contains three LIST-encoded struct-valued members (`list-tuple`,
`list-array`, `list-items_tuple`) in both strict and report modes. Each classified
result is fully recorded and its source bytes are recovered after both JSON and
YAML receipt round trips. Twelve blocked results cover schema indexes 1–3 in the
three-element LIST and canonical MAP fixtures. Additional controls capture root
and missing-index errors, valid and conflicting Field author receipts, altered
receipt/target/current-document recovery refusals, and refusal when the document
exceeds the 100,000-value core copy limit. The JSON packet retains complete
success/blocked outputs, error names/messages/codes, exact fixture bytes as hashes,
and recovered byte sequences as hex. Totals are 6 classified, 12 blocked and 12
successful recovery operations.

The runner pins the classifier and its helpers, operation/result schemas, core and
Parquet package schemas, focused test, public root export, generic Rust Record Type
foundation and CONTRACT-019. It also pins every Parquet file used. Moving planning
and inventory documents establish the task context but are not executable source
pins. The binary fixtures are the same five files referenced by the focused
predecessor tests; the result schema is
`spec/core/parquet-record-type-classification.schema.json`.

Reproduce from the repository root:

```sh
bun scripts/rust-migration/parquet-record-type-predecessor.ts
bun scripts/rust-migration/parquet-record-type-predecessor.ts --check
bun test tests/core-ideals/parquet-record-type.test.ts
```

The capture writes only this directory's `typescript-predecessor.json`. The check
compares the newly computed full object against that file, including source and
fixture pins. `--check` passes with Bun 1.4.3; the focused tests pass 2/2 with 71
assertions. `bun run typecheck` also passes, including the tool-script project.

This is TypeScript predecessor evidence only. It does not establish an independent
Apache Parquet native-oracle comparison, Rust behavior, Node/WASM wrappers, real
browser execution, wider resource/deadline/cancellation parity, default-root
selection, installed SDK behavior or release readiness. The source limit control
covers the existing value-copy limit only.

## Rust Document capture prerequisite

`parquet_document_capture.rs` adds the bounded extraction prerequisite for the
full Rust classifier. It accepts a current core `Value` Document plus the
caller's Engine, Registry, capabilities and Context; validates the core
envelope; admits only the pinned `umf.parquet@0.1.0` source profile
(`parquet/source`, `parquet-file-source`, lowercase hex); returns an owned copy
of the exact source bytes; decodes the schema through the existing Rust Parquet
adapter; and reports the requested schema index with its `parquet.fields` /
`schema:<index>` identity when that module is present. Unknown capture
properties, malformed bytes, out-of-range indexes and mismatched field
identities refuse explicitly. It does not classify a record type, produce a
receipt, or claim recovery or host delivery.

Focused unit cases use the pinned `list-tuple.parquet` source and cover exact
byte retention, selected index identity, malformed source, wrong identity and
unknown source properties. After module registration, Rust 1.90 offline
verification passed with
`CARGO_TARGET_DIR=/private/tmp/umf-parquet-capture-target cargo test -p umf-core
--offline parquet_document_capture --lib` (3 passed). The Rust operation copies
before envelope validation so resource admission precedes schema work; raw
JavaScript trap-order parity is not qualified. The Rust Parquet foundation
remains opt-in and this capture seam alone does not close either TypeScript
operation's R8 gap.

Runner SHA-256: `969c819f483a01abdfe04422ff9626b518f61e0e9e273fbb52868455652ffede`.
Initial packet SHA-256: `62f60934a8c0b0fc12fd46f766c3ca6afa7b4821fd2b90969749eb5e26640b39`.
The refreshed packet SHA-256 is
`0d7d9ffbcffa78eb177cffcb9e20c42e4c33823ee92414f535ba566ae55dad18`;
only the generated core-schema and Rust `lib.rs` source pins changed, with
all outcomes unchanged.

## Rust candidate foundation — 2026-10-25

The opt-in Rust candidate adds `umf_core::parquet_record_type_candidate` and a
tagged `parquet.recordType.resolveCandidate` wire transport. The caller supplies
the original bytes and a flat Parquet `SchemaElement` view. Rust validates the
preorder group/leaf tree and physical/repetition spellings under the shared
work budget, charges the retained byte/schema copy, preserves the byte capture
exactly, then resolves a selected schema index only when it is a
non-root struct-valued element interpreted through a valid two-level or
three-level LIST. The returned layout and path are observational metadata;
native repetition stays in the supplied schema.

This profile does not decode Parquet files or derive the supplied schema view
from bytes. It explicitly refuses roots, primitives, out-of-range indexes,
LIST/MAP wrappers, MAP members, unknown annotations, and non-LIST struct nodes.
It does not consume a UMF Document, check Field author receipts, classify a
Record Type, validate a classification result, or recover bytes from a receipt.
The wire response carries `complete: false`, exact captured byte hex, and is a
tagged test transport only. No default route or binding availability is
claimed. `CORE_SCHEMA`, `KIND_OPERATION_SCHEMA`, and
`CLASSIFICATION_SCHEMA` are compile-time resource inputs for the next slice;
this candidate does not yet validate against them.

`cargo test -p umf-core parquet_record_type_candidate --lib` passes 3 tests,
covering byte preservation, the LIST struct subset, root/primitive/index
refusals, both two-level and three-level interpretation, malformed group
counts and MAP refusal. The tagged wire suite
`cargo test -p umf-core-wire --test r8_parquet_record_type_wire` passes 2 tests,
covering the incomplete candidate response, captured-byte preservation and
primitive refusal. These tests use a synthetic pinned-shape schema; they do not
establish native Parquet parser agreement against the five frozen fixture files.
The commands were rerun after adding resource bounds and safe integer admission;
both pass from an isolated `/private/tmp` Cargo target directory.

## Rust retained-byte schema decoder — 2026-10-25

`umf_core::parquet_schema_decode::decode_schema` derives the narrow schema
view from retained Parquet file bytes. It checks PAR1 framing and footer bounds,
decodes the Compact Protocol `FileMetaData.schema` list and the SchemaElement
fields consumed by the existing R8 candidate, then returns owned
`SchemaElement` values. Parser slices do not escape. The candidate continues
to retain the original capture bytes independently, so footer interpretation
cannot replace or normalize the source.

The qualified input subset is plaintext PAR1 files with one decodable
FileMetaData struct and a nonempty preorder schema of at most 50,000 nodes.
Source size is capped at 1,000,000 bytes, nesting at 64, and Compact Protocol
collection/node work at 50,000 values; the footer byte span and each parsed
node/binary payload are charged to the caller's `Context`. Footer length
addition and file subtraction are checked before slicing. Compact varints
reject high payload bits outside their declared widths. Trailing footer bytes
are counted and remain in the original capture; they are not interpreted as
schema data.

Schema names require UTF-8. The decoder maps known physical and repetition
enum values and identifies legacy or modern LIST annotations. MAP and other
annotations flow as unsupported markers for the candidate to refuse. Unknown
SchemaElement field IDs, `type_length`, decimal `scale`/`precision`, `field_id`,
unsupported logical-type payloads, PARE/encrypted files and malformed footer
wire data are refused. This is only the schema input needed by the LIST
record-type candidate; it does not map the remaining FileMetaData, validate
row groups/pages, establish native-reader agreement or complete classification
and byte recovery.

Rust 1.90.0 focused tests pass 5/5 with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-decode-target \
cargo test -p umf-core parquet_schema_decode --lib
```

The tests decode the three frozen files `list-tuple.parquet`,
`list-array.parquet` and `list-items_tuple.parquet`; each owned schema view
resolves schema index 2 through `ParquetCapture::resolve_record_type`, and the
source byte vectors remain equal to their pre-decode copies. The fixture SHA-256
pins are `d865757dae18e11d4e0f071356aa3d8cac7e4a3b63269932404d39dbf3c6f5a5`,
`6df1f25f59236fcd69c98d68f919fb05068c398196f3ca46010a9f87d625c246` and
`2c018ed431f7ff0b1dcaab6782ae94050eb404c2043702a7f1c75278f3d5f144`, in that
order. Two adversarial tests reject discarded high bits in 64-bit and 32-bit
varints and footer-length address overflow. Existing source/result schema
compile-time inputs remain the candidate's `spec/core/schema.json`,
`spec/core/kind-operation-v6.schema.json` and
`spec/core/parquet-record-type-classification.schema.json`; the decoder adds
no embedded schema resources. No independent Parquet oracle or browser/binding
route is established by these tests.

## Rust LIST-element classifier candidate — 2026-10-25

`umf_core::parquet_record_type_classifier::ClassifiedCapture::classify` joins
the bounded retained-byte footer decoder to the existing schema-index candidate
resolver. It reports either a supported LIST struct element (including its
schema path and two-level/three-level layout) or an explicit unsupported reason,
while retaining the exact source bytes. Focused tests use the three frozen
`list-tuple`, `list-array` and `list-items_tuple` fixtures and verify root,
primitive, out-of-range and malformed-framing behavior. The classifier charges
the full byte-copy cost before allocating its retained copy; candidate creation
then meters the owned capture and schema representation.

This remains a candidate classifier. It does not consume or edit a UMF
Document, validate Field author receipts, detect duplicate sibling names or
conflicting author assertions, produce/validate the full classification result,
or recover bytes through a classification receipt. Thus it does not claim
TypeScript predecessor parity. Rust 1.90.0 `cargo test -p umf-core
parquet_record_type_classifier --lib --locked --offline` passes 3/3 focused
tests after an unrelated E0505 in the Avro classifier test was corrected.

## Rust UMF Document Record classification — 2026-10-25

`umf_core::parquet_record_classifier::classify_parquet_record` now joins the
current-Document capture, retained-byte schema decoder, LIST interpreter and
generic core kind-declaration verifier. For the pinned three LIST struct
fixtures it emits the complete `classify-parquet-record` 1.0.0 result shape,
field and Record mappings, a validated target Document, and strict/report
requests. The result is checked against
`spec/core/parquet-record-classification.schema.json` with its pinned core,
kind-operation and semantic-type-reference resources. Source bytes remain in
the receipt; the native schema fragment is the bounded decoded SchemaElement
view used for the interpretation.

This Rust slice is intentionally LIST-only. Root, primitive, wrapper, MAP,
unknown annotation, missing/ambiguous field identity, duplicate sibling names,
identity collisions, conflicting or stale authors, malformed source and
resource-limit cases refuse or return a blocked receipt. It does not reproduce
all TypeScript `classifyParquetRecord` layouts, construct the TypeScript
adapter's exact `nativeField` mapping fragments, recover bytes from a receipt,
or provide a binding/default route. The successful cases exercise the six
frozen predecessor combinations (three fixtures × strict/report) for status,
target validation, mappings and empty residuals; they are not byte-for-byte
receipt comparisons or independent native-oracle evidence.

Rust 1.90.0 focused replay passes 3/3 tests with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-record-classifier-target \
cargo test -p umf-core --locked --offline parquet_record_classifier --lib
```

The tests cover the six frozen success combinations, a LIST-wrapper blocked
receipt, result-schema validation and refusal under a deliberately small
resource limit. This is scoped Rust execution evidence only; the remaining
TypeScript parity and host-delivery gaps stay open.

## Rust classified-record byte recovery — 2026-10-25

`umf_core::parquet_record_recovery::recover_parquet_record_bytes` is an opt-in
operation that composes the current Parquet Document capture and
`parquet_record_classifier::classify_parquet_record`. It accepts the receipt,
the caller's current Document, and the caller's Engine, Registry, capabilities
and Context. It validates the complete classification schema and requires a
classified status, recomputes the receipt from its retained source and request,
compares the canonical receipt and current Document against the recomputed
target, and returns a copy of the original captured Parquet bytes. Object member
order is ignored in receipt/current-target comparisons; arrays preserve order.
All input/canonical traversals, author copies and the final byte copy use the
caller's resource budget. A blocked, malformed, altered or stale receipt returns
an error without recovered bytes.

Focused Rust tests pass 3/3: exact `list-tuple.parquet` byte recovery, altered
receipt/stale target/blocked receipt refusals, and caller resource-limit refusal.
Run with Rust 1.90 and an isolated target directory:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-recovery-target \
cargo test -p umf-core --offline parquet_record_recovery --lib
```

This establishes only the focused opt-in recovery composition over the
classifier's pinned LIST-struct subset and existing exact-byte capture. It does
not add a default route, retire either TypeScript export, establish binding or
host delivery, broaden the supported Parquet interpretation, or claim
independent Apache Parquet/native-reader agreement.

## Rust UMF Document Record Type classification — 2026-10-25

`umf_core::parquet_record_type_operation::classify_parquet_record_type` is an
opt-in composition over the current Parquet Document Record classifier. It
consumes the caller's UMF Document, request, Engine, Registry, capabilities and
Context; the existing capture path verifies the pinned `umf.parquet@0.1.0`
source profile, retains its exact bytes, and decodes the bounded plaintext
footer. The existing LIST interpreter admits only the frozen non-root
struct-valued element subset. The operation keeps blocked classifier outcomes,
checks the selected Field identity and scalar/Record Type conflicts, optionally
recomputes supplied core Field-kind author receipts, preserves the composed
Record classifier mappings, appends selected Field and Record Type mappings
using the retained decoded native schema fragment, writes the Record Type
reference into the classified target, and validates its complete result against
`parquet-record-type-classification.schema.json` and the pinned
core/kind/semantic-reference resources. Work remains charged to the caller's
Context.

The evidence is scoped to the three pinned LIST struct fixtures and the
existing decoder and Record classifier. Rust tests pass 5/5 for success across
all three fixtures, preserved Record plus appended Field/Record Type mappings,
both inherited-member and selected-Field author receipts, a conflicting
existing kind (blocked receipt), and caller resource-limit refusal:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-record-type-target \
cargo test -p umf-core --locked --offline parquet_record_type_operation --lib
```

The Rust result is not full TypeScript parity: this slice does not provide the
TypeScript `nativeField` fragment construction, does not establish recovery of
a Record Type receipt, independent Parquet native-reader agreement, binding or
default-route delivery, or support for layouts beyond the interpreted LIST
struct-element subset. Existing TypeScript exports and R8 route gaps remain.

## Rust Record Type byte recovery — 2026-10-25

`umf_core::parquet_record_type_recovery::recover_parquet_record_type_bytes` is
an opt-in operation over a classified Record Type receipt. It validates the
complete `parquet-record-type-classification` result schema and requires a
classified status, reconstructs the request including optional generic author
receipts and the selected `fieldAuthor`, then recomputes the full receipt from
its retained source. Recovery compares the canonical recomputed receipt and
the caller's current Document with the classified target before returning the
exact retained Parquet bytes. Object member order is ignored; array order is
preserved. Receipt copies, request author copies, schema validation,
canonicalization and the final byte copy use the caller's `Context` budget.
Malformed or schema-valid altered receipts, stale targets, blocked receipts
and resource exhaustion refuse recovery without returning bytes.

Rust 1.90.0 focused tests pass 3/3: exact `list-tuple.parquet` byte recovery,
schema-invalid and schema-valid receipt tampering, stale target and blocked
receipt refusals, and caller resource-limit refusal:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-record-type-recovery-target \
cargo test -p umf-core --locked --offline parquet_record_type_recovery --lib
```

This evidence covers only the opt-in Rust composition over the operation's
existing bounded LIST struct-element subset and exact source capture. It does
not establish TypeScript parity, default routing, binding or host delivery,
independent Parquet native-reader agreement, or recovery for other layouts.

## Rust Record Type fixture parity follow-up — 2026-10-25

The Record Type operation now preserves the generic Record mappings when that
classifier returns a blocked receipt, appends the selected Field and Record
Type mappings with `unknown` outcomes, and validates the complete blocked
receipt. For unsupported three-element LIST and canonical MAP fixtures, it
retains direct-member Field mappings before the Record declaration mapping,
then appends the selected mappings in the same order as the frozen TypeScript
packet. The tests compare mapping kinds and native paths for all 12 blocked
fixture requests (two families × three indexes × strict/report), and verify
the role and conflict diagnostics and absent target.

For all six classified cases (three LIST fixtures × strict/report), the tests
compare the full ordered mapping arrays, including native fragments, paths,
bases and outcomes. The Rust result now emits the same raw Parquet field names
and numeric-string enum values for the selected LIST struct and its direct
primitive children; source field positions also match the predecessor, which
omits the schema root. The target retains the source, marks the selected Field,
adds its Record Type reference, and creates the Record with the ordered direct
member references. Valid selected-Field and inherited-member author receipts
are retained in the request and recomputed against the source; a wrong role
receipt blocks. A caller resource limit and the predecessor's 100,001-value
copy-boundary control both refuse with `LIMIT`.

The frozen result schema permits `authors` to be omitted or present. The Rust
typed request now uses a presence-aware list so omitted and explicitly empty
`authors` remain distinct through the receipt and recovery path.

The retained-byte decoder now also carries the numeric value of native
`SchemaElement.converted_type` (field 6) into the narrow `SchemaElement` view.
The opt-in Record Type operation emits the frozen TypeScript spelling and
decimal-string value in blocked wrapper fragments. A test compares each full
ordered mapping array, including fragments, against all 12 frozen requests
(two fixture families × three indexes × strict/report). This does not interpret
modern `logicalType`, expand LIST/MAP admission, or claim broader layout
semantics; original file bytes remain the authority for uninterpreted content.

Rust 1.90.0 locked/offline `cargo test -p umf-core parquet_` passes 30/30,
including the 12-case full mapping comparison and the decoder field-6 assertion.
`cargo check -p umf-core-wire` and `rustfmt --check` on the touched Rust files
also pass.

Rust 1.90.0 focused tests pass 7/7 with locked, offline dependencies:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-parquet-record-type-target \
cargo test -p umf-core --locked --offline parquet_record_type_operation --lib
```

The seven tests include all frozen classified and blocked fixture combinations,
mapping and target assertions, valid and conflicting author receipts, and both
resource-boundary refusals. This is fixture-parity evidence for the opt-in Rust
operation only; it does not establish a default route, host delivery or support
for layouts beyond the pinned LIST struct subset. The separate
[native oracle](parquet-native-oracle.json) checks all 18 selected requests
against PyArrow 21.0.0 across five pinned files and records Apache Thrift
0.22.0's original SchemaElement fields beside the predecessor mappings. That
grounds native layout facts, not complete Rust target/receipt parity or broad
Parquet semantics.
