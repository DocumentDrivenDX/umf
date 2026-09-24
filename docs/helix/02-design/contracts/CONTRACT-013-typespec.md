---
ddx:
  id: CONTRACT-013
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-013
      kind: informed_by
---

# CONTRACT-013: TypeSpec supplied source bundles

`umf.typespec` 0.1.0 stores profile `typespec-1.16.0-sources`, an explicit entrypoint
and a map of relative `.tsp` filenames to exact source strings. The complete payload
schema is `spec/extensions/typespec/schema.json`, embedded in the extension package.
Source paths cannot traverse directories; the entrypoint must be supplied. Total text
and core structural limits apply. This is a source representation, not a serialized
semantic type graph or a claim that source preservation completes TypeSpec support.

`importTypeSpecSources` rejects invalid syntax using the pinned compiler parser.
`inspectTypeSpec` remains incomplete until separate compilation evidence is obtained.
`exportTypeSpecSources` returns copies of all files and the entrypoint without
reformatting, merging or dropping imports. Unknown representation fields remain in
UMF and block native export. `proposeTypeSpecSourceEdit` replaces one supplied file
in a candidate, preserves the input document and rechecks syntax. Semantic compilation
is an explicit subsequent operation; syntactically valid candidates may be invalid.

`getTypeSpecSyntax` returns compiler syntax-kind names and UTF-16 source ranges;
these are navigation metadata, not a semantic model. The complete result contract is
`syntax-locations.schema.json`. Source text remains authoritative. TypeSpec explicitly
warns that its AST is an advanced API outside normal stability guarantees, so the
adapter pins the compiler and does not claim cross-version AST compatibility.

`compileTypeSpecDocument` uses TypeSpec 1.16.0 through an in-memory CompilerHost.
Supplied `.tsp` files and the bundled pinned standard library are available; standard
JavaScript decorator/intrinsic implementations are fixed imports from that compiler.
Other JavaScript libraries, emitter execution and implicit filesystem/network imports
are not enabled. Missing imports are native diagnostic errors. The result schema is
`compiler-report.schema.json`; validity is the native compiler error outcome, while
`complete: false` preserves the separation from projection and external-library support.

The standard-library bundle includes MIT license, version and per-file hashes. The
native CLI oracle uses a filesystem host to check re-emitted sources and an invalid
semantic edit. It shares the compiler implementation with the in-memory host and is
not evidence of agreement between independent TypeSpec implementations. Chromium
executes the same public compiler operation. Type-graph extraction, external library
support, official corpus and projection behavior remain unfinished work.

Sources: [Compiler API](https://typespec.io/docs/standard-library/reference/js-api/functions/compile/),
[host-based emitter guidance](https://typespec.io/docs/extending-typespec/emitters-basics/),
and [pinned compiler package](https://www.npmjs.com/package/@typespec/compiler/v/1.16.0).

## Selected Compiled Semantic Graph

`getTypeSpecSemanticGraph(document, {roots})` compiles the supplied bundle and resolves
1–1000 native type expressions. The complete snapshot schema is
`spec/extensions/typespec/semantic-graph.schema.json`. Results include the copied source,
compiler report, selected roots, nodes, issues and limitations. Failed compilation or
any unresolved selection blocks the result; partially resolved selections may remain
in that blocked result for diagnosis. `available` means the selected views exist, not
that all native meaning has been interpreted. `complete` is always false.

Nodes have snapshot-local IDs, native kind/display name, attributes, typed relationship
roles and source ranges where available. Edges preserve model properties, inheritance,
model derivation sources, indexers, scalar bases, interface operations, operation
signatures, union variants, enum members, tuples and string-template spans. Allocation
before traversal retains recursion and instantiated template identity. Inherited model
properties remain on base nodes rather than being silently flattened into own properties.

Numeric literal text and Numeric API default values use strings. Defaults retain tagged
value kinds, storage-type references, optional scalar identities, arrays/objects, enum
members and scalar constructor calls. Decorator names/arguments and evaluated doc text
are available, but arbitrary decorator effects and compiler state maps are not fully
encoded. Unsupported kinds/values/constructors receive issues; the full source remains
authoritative. Enum numbers lacking exact native text are reported rather than rounded.

The snapshot is a derived, read-only consumer view. IDs are not stable across edits or
compiler versions, and snapshot editing or lossless type-graph reimport is not supported.
Native filesystem-host property traversal agrees with graph-derived inherited properties,
resolved types, optionality and defaults; this uses the same compiler implementation.
Browser checks exercise graph extraction. Complete semantic interchange and cross-system
projection remain separate work.

## Pinned Upstream Sample Evidence

The complete `packages/samples/specs` subtree at Microsoft TypeSpec commit
`5ee1157f337e461e50a7d57c2be2ae95e5026a4a` is archived with hashes and MIT license.
It contains 110 sample/context files, including 51 `.tsp` sources and 31 entrypoints;
the manifest also records the upstream license and compiler package metadata, for
112 archived files total. Upstream compiler metadata identifies version 1.16.0.

Thirty source bundles pass syntax import and preserve exact sources plus native
compiler diagnostics through JSON/YAML. Only encoded-names and string-template compile
under the current standard-library-only host. Twenty-eight bundles report compiler
errors, including unresolved HTTP, REST, OpenAPI, GraphQL, JSON Schema, Protobuf and
versioning libraries or sample JavaScript. The local-typespec editor sample deliberately
contains invalid syntax and is rejected; its original files remain in the corpus.

The filesystem-host oracle agrees on all 31 outcomes and on diagnostic-code multisets
for every syntactically accepted bundle. Configurations, emitters, sample JavaScript
and generated reference outputs are archived as context, not interpreted by the source
profile. Thus this is 2/31 compilation coverage under the declared environment, not
31/31 native support. String-template metadata also agrees after round trip and in
Chromium. Missing-library/configuration support remains required work.

Source: [pinned upstream samples](https://github.com/microsoft/typespec/tree/5ee1157f337e461e50a7d57c2be2ae95e5026a4a/packages/samples/specs).

## Explicit Registered Libraries

The source payload and source-bundle APIs now accept optional `libraries`, a map of
package names to exact versions. Export retains this map alongside all source files.
The compiler report also records the selected versions. An absent/empty map preserves
the original standard-library-only behavior. The registered set is HTTP 1.16.0, REST
0.86.0, OpenAPI 1.16.0 and Streams 0.86.0. Selection does not automatically register
peer dependencies; missing imports remain native diagnostics. OpenAPI here is the
metadata library, not the OpenAPI3 emitter. Emission remains disabled.

Unregistered names/versions survive UMF and bundle export with an incomplete-interpretation
warning; compilation raises `TYPESPEC_LIBRARY_UNAVAILABLE` without fetching or executing
an alternative package. Selected packages mount pinned `.tsp`/package metadata and
fixed native JS implementations in the memory host. Supplied-source/library collisions
are rejected. Package licenses and file hashes accompany the bundled libraries.

All 31 pinned corpus entrypoints remain accounted for: 20 compile with this four-library
set, ten report remaining compiler errors and one is intentionally invalid syntax.
Thirty syntax-valid source bundles retain selectors and diagnostics through YAML.
The filesystem host agrees on all 30 outcomes/code multisets using these installed
versions. This same-compiler evidence does not prove external emitter or HTTP runtime
behavior. Chromium also compiles and round-trips a selected HTTP/OpenAPI service.
Project configuration, remaining libraries, custom code and emitter projections stay
in the completion inventory. The earlier 2/31 report remains the no-library baseline.

## Expanded Official Library Set

Registration now also includes GraphQL 0.3.0, JSON Schema 1.16.0, Protobuf 0.86.0,
Versioning 0.86.0, OpenAPI3 1.16.0, SSE 0.86.0 and Events 0.86.0. Their fixed native
JS implementations are available only through selected package paths in the host.
The JavaScript dependencies are pinned in the package lock; library/source/version
provenance remains in the generated library manifest.

Published library-root `tspconfig.yaml` files are now retained and mounted alongside
package metadata and source. This is necessary for library-scoped compiler feature
opt-ins: GraphQL uses auto-decorators, and HTTP registers its type-info provider.
Consumers do not need to synthesize equivalent feature settings. This does not import
or execute arbitrary consumer project configuration. Emission remains disabled, even
when the selected package also provides an emitter.

The all-library profile compiles 29/31 upstream entrypoints. The remaining syntax-valid
petstore requires its custom `decorators.js`, which is archived but unregistered; the
other case intentionally contains invalid syntax. The filesystem host agrees on all
30 syntax-valid outcomes/code multisets. GraphQL compilation also succeeds in Chromium,
exercising the published library feature configuration. The standard-only and initial
four-library reports remain distinct baselines.

## Native JSON Schema Emission

`emitTypeSpecJsonSchema(document, {options})` runs only the registered
`@typespec/json-schema` 1.16.0 emitter. The source bundle must explicitly select that
library. Options must explicitly choose `int64-strategy: string | number`; native
emitter option validation handles other options. Output-location overrides are rejected.
The ordinary compile operation still disables emission.

The result follows `spec/extensions/typespec/json-schema-emission.schema.json`: copied
source, exact policy, compiler evidence, emitter version, output path/text map, limitations
and `complete: false`. Status is `emitted` for valid nonempty output, `empty` for valid
zero-file output, or `blocked` for compiler errors. Blocked results discard partial output.
Writes remain in memory below `/output`; traversal, collisions and excessive total text
are rejected. No source imports can register arbitrary emitter JavaScript.

The official JSON Schema sample emits Person, Address and Car files identically before
and after UMF YAML round trip. A filesystem-host comparison uses the same pinned native
emitter, so it establishes host agreement, not independent compiler semantics. Seven
Python jsonschema 4.26.0 cases independently check emitted bounds, required fields,
uniqueness and external references. Chromium runs the same public emission API.

Native emission is a foundation for a future audited projection. It does not enumerate
all TypeSpec-to-JSON-Schema semantic losses, prove numeric precision for every consumer,
or preserve operations/decorators in the target. Source retains these meanings. Broader
emitters, consumer configuration and projection loss accounting remain required.

## Numeric Emission Loss Evidence

The pinned 1.16.0 emitter converts the authored literal `9007199254740993` to
`9007199254740992` under both integer strategies. Its int64/uint64 schemas omit numeric
bounds; the string strategy also omits numeric syntax constraints. The operation now
includes these concrete risks in every result's limitations, without claiming that
every source contains such a loss or that these are the only possible losses.
`emitted` means the native emitter produced output, not that source semantics survived.

`fixtures/typespec/emission/numeric.tsp` is an authored boundary fixture. Exact source
and policy survive UMF YAML; both strategies produce the same native output through
memory and filesystem hosts. Changing percent's maximum from 100 to 50 changes the
generated validator while leaving the original source/output intact. Python's exact
integers distinguish original from rounded literal values: 26 before/after comparisons
show the incorrect literal acceptance/rejection, omitted signed/unsigned constraints,
nonnumeric string acceptance and correct edited percentage bounds. These are explicit
loss regressions, not successful semantic-equivalence assertions. The fixture's native
output must not be advertised as a faithful validator of its TypeSpec source.

## Materialized Native-Emission Projection

`projectTypeSpecToJsonSchema` accepts a target ID, exact emitted root filename, HTTP(S)
retrieval directory, native emitter options (JSON output required),
`usage: native-emission` and a strict/allow-reported-loss policy. Its complete result
schema is `spec/projections/typespec-json-schema.schema.json`. It runs the pinned
emitter, retains source and emission evidence, and registers every other emitted JSON
file as a dependency in the target's `umf.json-schema` payload. File segments are URI
encoded; filename-to-retrieval mappings are explicit. Original emitted `$id` and `$ref`
values are retained. Unsupported paths/formats, unavailable roots and invalid target
schemas block target creation. No network fetch fills missing resources.

This is an explicitly incomplete native-emission projection. Every result reports
`TYPESPEC_UNREVIEWED_SEMANTICS`, `TYPESPEC_NUMERIC_PRECISION` and
`TYPESPEC_INT64_CONSTRAINTS` as global risks, not source-located findings. Strict mode
returns `blocked` with no target. Allow-reported-loss can return `projected`, but always
with `complete: false`; this signifies a usable native output artifact, not audited
source-domain equivalence. There is no instance conversion or reverse recovery of
TypeSpec from the target. Consumers retain the separate source for that purpose.

The official three-model sample produces a target with two registered dependency
resources. Native export after target YAML round trip retains every emitted schema;
seven independent Python instance checks resolve the target resource URIs and reproduce
emitter behavior. Chromium exercises the same projection API. Per-concept fidelity
auditing, numeric repairs and broader target transformations remain required work.
