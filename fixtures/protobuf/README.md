# Protobuf descriptor evidence

The three root `.proto` fixtures are original UMF examples authored 2026-09-20:

- `legacy.proto`: proto2 required fields, exact int64 and byte defaults, group,
  packed repeated values, enum aliases, oneof, extensions/custom options,
  reserved names/numbers and server streaming.
- `modern.proto`: proto3 optional presence, map, oneof, nested messages, repeated
  imports and bidirectional streaming.
- `edition.proto`: Edition 2023 explicit/implicit presence, expanded repeated
  encoding and closed enums.

`authored.pb` is a compiler-produced descriptor fixture, including imports and
SourceCodeInfo. Reproduce with protoc 36.2:

```
protoc -I fixtures/protobuf/upstream -I fixtures/protobuf --include_imports --include_source_info --descriptor_set_out=fixtures/protobuf/authored.pb legacy.proto modern.proto edition.proto
```

`upstream/` contains 19 standard `.proto` files from the installed protoc 36.2
include directory. The manifest retains every SHA-256 hash and upstream location;
the BSD license is included. These are standard native examples, not the entire
upstream Protobuf conformance corpus. No source file is filtered out of this corpus.

`tests/protobuf/descriptor.test.ts` compiles all 22 source files independently,
imports the resulting descriptors into UMF, serializes through YAML, emits native
descriptors and compares **protoc's text decoding** before and after. No descriptor
fields, options or source metadata are stripped. Separate tests check a default
edit through native descriptor recompilation, invalid edits and unknown fields.
The compiler version and vendored hashes are checked on every test run.

The compiled descriptor layer covers all 30 message definitions in the pinned
protobuf-es 2.15.0 descriptor graph. Unknown wire fields/options retain raw value
bytes and incomplete interpretation. Binary field ordering, redundant singular
wire occurrences and source lexical spelling are outside this semantic profile.

`descriptor-results.json` names the tested native files and comparison profile.
Chromium 148.0.7778.0 executes descriptor round-trip and candidate-edit checks.
All candidate edits report compiler validation as required. The optional browser source compiler and authored runtime behavior checks below
do not establish full native source emission, universal runtime conformance or
universal Editions support is claimed; those remain implementation work.

Native descriptor reference:
[descriptor.proto v36.2](https://github.com/protocolbuffers/protobuf/blob/v36.2/src/google/protobuf/descriptor.proto).


`behavior-results.json` records 42 independent expected behaviors using Python
protobuf 7.36.2. Checks cover required initialization, presence/defaults, integer
boundaries, packed values, groups, enum aliases/unknown values, oneofs, extensions,
custom options, maps, Editions features and streaming descriptors. Valid deliberate
mutations to a default and optional presence are both detected. Expected values
and wire bytes are authored independently in `scripts/protobuf-behavior-oracle.py`.

`source-compiler-results.json` records protocompile 0.14.1 source import. The Go
bridge compiles to WASM; Chromium exercises it through a worker. Sources resolve
only from the explicit map, including supplied standard dependencies. An independent
protoc 36.2 run with `--retain_options` agrees on descriptor fields after excluding
SourceCodeInfo and normalizing omitted syntax to proto2. The full original sources
remain archived. `source-behavior-results.json` records the same 42 behavioral
checks on both compilers' descriptors. The source-emission evidence is described below.

Build the optional assets with `bun run build:protobuf` using Go 1.27.1. The main
library remains TypeScript; the worker and compiler are separate distribution
assets with dependency licenses. Native oracle tests use the same Go bridge via
its CLI entrypoint. Module versions/checksums live in `native/protobuf/go.mod`
and `go.sum`.

Behavior sources: [field presence](https://protobuf.dev/programming-guides/field_presence/)
and [wire encoding](https://protobuf.dev/programming-guides/encoding/).

Source emission is now implemented using protoprint 1.18.1 in the optional worker.
The emitter starts from current descriptors, recompiles its output and refuses any
semantic descriptor difference under the stated layout profile. It does not replay
archived input. The printer receives a copy, preserving an untouched comparison
baseline. Unknown fields without a source representation fail emission explicitly.

`emission-results.json` records unchanged and edited authored-source recompilation
through independent protoc 36.2. `emission-behavior-results.json` records 42 expected
runtime checks. `emission-corpus-results.json` records every standard root: 15 pass;
four Edition 2024 roots are unsupported and their actual errors are retained.
Chromium also executes edit → emit source → reimport. Source spans and comment
attachment may change; retained UMF contains the original SourceCodeInfo and archive.

The printer dependency updates the Go protobuf runtime to 1.36.12. All native and
browser gates were rerun; exact transitive versions/checksums remain in go.mod/go.sum.
