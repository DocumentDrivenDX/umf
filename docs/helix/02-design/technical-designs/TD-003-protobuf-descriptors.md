---
ddx:
  id: TD-003
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: US-003
      kind: informed_by
---

# TD-003: Protobuf descriptor representation

## Approach

Use the pinned protobuf-es descriptor reflection graph to generate the complete
JSON Schema and encode typed native descriptor fields into portable JSON. Read
only explicitly present fields, preserve unknown fields recursively, represent
64-bit values and bytes without host coercion, and retain all source metadata.
CONTRACT-003 owns normative surfaces. Runtime code compiles to browser JavaScript.

## Components

`descriptor.ts` converts binary descriptors and native reflection values to/from
the tree. `index.ts` integrates the package, diagnostics, export bundle and copied
candidate edits. `scripts/protobuf-schema.ts` deterministically generates the
schema and package from the pinned dependency; it stays outside browser code.

## Validation

The authored corpus includes proto2 required/default/group/extension cases,
proto3 optional/maps/oneofs, services and Edition 2023 feature overrides. Standard
protos are pinned with hashes and license. Native protoc compiles source fixtures
and independently decodes both original and emitted descriptors. Field presence,
options and SourceCodeInfo remain in the comparison. Typed default edits are
independently recompiled. Chromium runs the actual packaged APIs.

The first corpus exposed YAML folding corruption of leading-indented multiline
comments. Disabling emitter line wrapping fixes the shared serializer; a core
regression case retains that evidence independently of this adapter.

## Remaining Work and Risks

Broaden native behavior vectors and expand
Editions and upstream test corpora. Runtime registry construction is not a compiler:
all candidate edits retain compiler-required status. Unknown option interpretation
is not inferred from wire retention. No shared core concept promotion is justified
by these descriptor-preservation results alone.


## Source Compiler and Behavioral Oracle

`source.ts` accepts a trusted compiler interface and archives the original sources.
`native/protobuf/` implements a map-only source resolver in Go, with CLI and WASM
entrypoints sharing code. Bun builds separate compiler assets; the worker confines
Go compatibility globals to its own realm. ADR-003 records versions and tradeoffs.

The native Python behavior oracle uses independent dynamic classes and hand-written
expected wire bytes/presence assertions. Its two valid descriptor mutations must
be detected. A separate source-compiler comparison uses protoc with source options
retained and compares every field except SourceCodeInfo and default proto2 spelling.
Neither native compiler calls back into UMF to derive expected outcomes.


## Source Emitter

`native/protobuf/emitter.go` uses protoprint 1.18.1 and recompiles its output with
protocompile before returning. It passes a cloned descriptor set to the printer
and retains an untouched comparison source. Native tests additionally recompile
with independent protoc and compare descriptors through the Python oracle.
Custom-option comparison normalizes decoded extensions and opaque wire encodings
using deterministic serialization and an empty extension resolver; it never drops
option data. Unknown descriptor-set extensions or round-trip semantic differences
are errors. The TypeScript export bundles original UMF and layout diagnostics.

The Go protobuf runtime is now pinned to 1.36.12 by the printer dependency; all
source, descriptor, behavioral and browser gates rerun after that change.
