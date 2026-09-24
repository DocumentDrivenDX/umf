---
ddx:
  id: TD-013
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-013
      kind: informed_by
    - id: US-013
      kind: informed_by
---

# TD-013: TypeSpec source preservation and compilation

Pin the parser/compiler to 1.16.0. Store exact source files in the extension and parse
on inspection. Do not serialize compiler runtime objects with cycles, symbols, Maps
and mutable semantic state as if they were a portable complete type graph. Syntax
locations are a derived navigation view; compilation is a separate async operation.

The host mounts supplied files under `/project` and bundled standard-library text
under `/compiler`. Only pinned standard decorator and intrinsic modules are available
through `getJsImport`; no arbitrary code is loaded from source strings. All I/O goes
through the memory host, with emission disabled for the compile-only operation. The package's browser mappings remove
Node host dependencies. Internal standard-library module paths are version-coupled and
must be reviewed when upgrading the compiler. A generated manifest hashes the bundled
standard text and retains the compiler package license.

Test a multi-file authored domain with templates, recursion, unions, operations,
standard decorators, comments and exact numeric literals. Compare source round trips,
then force a semantic error by changing a field type without changing its default.
Run the native CLI against exported files as a separate-host check, and exercise the
memory compiler in Chromium. Native type-graph extraction and projections are the
next stage; the source bundle is not evidence that those requirements are satisfied.

Compiled metadata now reuses the memory-host Program internally, without exposing its
mutable runtime graph. Resolve selected type expressions, allocate IDs by native object
identity before traversal and emit explicit edges. This preserves recursion and separate
template instantiations. Native values receive tagged JSON representations with numeric
strings; no host number conversion is used for exact numeric literals/defaults.

Depth/node limits bound traversal. Unknown compiler kinds and unencoded semantic state
produce issues or global limitations. Source and compiler evidence remain attached.
The native filesystem-host oracle uses `walkPropertiesInherited`; a separate traversal
of emitted graph edges must reproduce its property names, resolved types, optionality
and numeric defaults. This validates consumer access without claiming an independent
TypeSpec implementation or a reversible complete semantic graph.

The upstream corpus selects the whole samples/specs subtree rather than only examples
that already compile. Every `.tsp` entrypoint group is accounted for. Non-source context
is archived separately; only `.tsp` files enter the current extension/compiler host.
The filesystem-host oracle reproduces this same supplied-source environment, excluding
project configuration and unregistered JavaScript, then compares acceptance and sorted
native diagnostic codes. Compilation failures are recorded as profile gaps, not test
success evidence for the affected language/library semantics.

Library selection mounts only registered package versions under virtual node_modules.
Package metadata and `.tsp` sources are generated from pinned dependencies; JS entrypoints
are fixed imports, activated in the host only for selected packages. Internal entrypoint
paths remain version-coupled. Both compiler checks and semantic graph extraction pass
through the same selector-aware host. Reports retain the exact selected versions.
The filesystem oracle exposes the same installed selections in an isolated source
workspace, comparing native acceptance and diagnostic codes. Arbitrary project JS and
configuration are neither inferred nor silently executed.

Library archives now include published root configuration as well as source/package
metadata. The native source loader reads feature opt-ins from each library's own config;
omitting it changed GraphQL compiler behavior despite identical source and JS modules.
The browser host now supplies that configuration unchanged. This discovery is covered
by the GraphQL upstream browser case and same-compiler filesystem comparison. Project
configuration and emitter dispatch remain separate contracts.

A separate emission operation registers the fixed JSON Schema emitter entrypoint and
passes explicitly supplied native options to the same memory compiler host. Host writes
collect an output bundle with location, collision and total-size checks. The public API
requires the selected library and an integer strategy, and suppresses partial writes
when compilation fails. Default compilation remains no-emit. This avoids making native
emission an implicit side effect of inspecting metadata. Output text is compared exactly
with a filesystem host; independent JSON validation checks observable target behavior.
The emission result keeps source and explicit limitations until a separate projection
contract can audit losses.

Numeric emission probes expose native emitter losses rather than hiding them behind
JavaScript-number comparisons. An authored fixture retains an exact unsafe-integer
literal and int64/uint64 fields; Python parses emitted JSON with arbitrary-precision
integers to observe the changed literal. Both integer policies are tested before/after
a percent-bound edit. Result limitations always disclose the observed pinned-emitter
risks; they do not purport to locate every occurrence. A later audited projection must
detect or repair these cases before making equivalence claims.

The native-emission projection delegates compilation/emission to the existing operation
and imports the chosen JSON output through the existing exact JSON Schema adapter.
All remaining emitted files become retrieval resources. A caller-supplied directory
anchors encoded file paths; native IDs/references remain unchanged. The result embeds
source, emission evidence, resource mappings and global risks. Strict policy blocks
unreviewed output; allow-reported-loss permits the artifact without equivalence claims.
Independent validation runs against UMF's re-exported target and resource registry.
