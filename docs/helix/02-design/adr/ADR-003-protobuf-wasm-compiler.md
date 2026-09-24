---
ddx:
  id: ADR-003
  type: adr
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
---

# ADR-003: Compile Protobuf source with an optional WASM compiler

**Date:** 2026-09-20. **Status:** implemented experimental choice, open to review.

## Context

TypeScript remains the main implementation, but native Protobuf source compilation
must retain options, features and reference semantics in the browser. The owner
allows WASM. Descriptor reflection alone does not compile source; a handwritten
shared-record parser would require substantial native language work before it
could satisfy the existing fidelity gate.

## Decision

Use Buf protocompile 0.14.1 through a small Go bridge compiled to WASM. Pin Go
1.27.1 and module checksums. Keep the compiler in a worker with an explicit source
map resolver: no filesystem or network import lookup. Keep the portable UMF API in
TypeScript and inject its compiler interface. Bun builds and tests remain the
default; Go is an optional adapter build tool, Python an independent oracle.

Distribute the compiler as separate assets through `bun run build:protobuf`.
The main JavaScript library does not load it implicitly. Retain original source
files as an archive distinct from the editable descriptor state. Source emission
must later reflect descriptor edits; replaying archived source is not sufficient.

## Alternatives

- Native protoc only: suitable independent oracle, insufficient for browser imports.
- Handwritten TypeScript compiler: possible future replacement, but would need the
  same independent corpus and semantics coverage before claiming equivalence.
- Descriptor-only interchange: implemented foundation, insufficient for the required
  native source-language workflow.

## Consequences and Evidence

The optional WASM binary is approximately 14 MB before compression. A worker keeps
Go compatibility globals outside the application. Consumers explicitly load local
compiler assets and may terminate the worker. Supported source versions remain
bounded by the pinned compiler and tested corpus; do not infer support for newer
Editions from descriptor retention.

Authored proto2/proto3/Edition 2023 source compiles in Chromium. Native protoc 36.2,
with `--retain_options`, agrees on all descriptor fields except SourceCodeInfo and
omitted/default proto2 syntax spelling. Original source text remains archived.
Python protobuf 7.36.2 passes 42 native behavior checks on both compilers' results.
Native source emission now uses protoprint 1.18.1 in the worker, with recompile
and descriptor comparison gates; Chromium verifies an edited-source round trip.
Fifteen standard roots pass native emission; four Edition 2024 roots are explicitly
unsupported. Broader language conformance remains outside the demonstrated scope. This choice does not promote native concepts into UMF core.

## Sources

[Buf parser reference](https://buf.build/docs/reference/parser-examples/) and
[protocompile API](https://pkg.go.dev/github.com/bufbuild/protocompile).
