---
ddx:
  id: CONTRACT-014
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-014
      kind: informed_by
---

# CONTRACT-014: Smithy JSON AST preservation

`umf.smithy` 0.1.0 stores `profile: smithy-json-ast` and `root`, a core NativeJson tree.
`spec/extensions/smithy/schema.json` completely describes this payload and is embedded
in its extension package. Exact native numbers are strings in tagged numeric nodes.
Native object members, traits, metadata, references, mixins and unknown content are
retained; formatting is regenerated. This is not a normalized semantic model or IDL
source archive. Smithy versions other than 2/2.0 receive an interpretation warning.

`importSmithyJson(text, {id})`, `exportSmithyJson(document)` and
`getSmithyNode(document, pointer)` import, export and inspect native content.
`proposeSmithyNodeEdit(document, pointer, nativeJsonText)` returns a new document and
validation report. It is explicitly a candidate operation: native validity is not
certified. The original remains unchanged. Existing node paths are required. Root
replacement is allowed; malformed replacements fail structural checks. Core size,
depth and JSON safety limits apply. Unknown representation fields cannot be dropped
through export, including extra fields in tagged native nodes.

The native structural schema describes known top-level and shape fields, members,
references and shape-specific property forms. It permits unknown native fields and
shape types for retention. Collection members may be inherited through mixins. Traits
and metadata values remain arbitrary native JSON; their numeric values are never
replaced by host-number interpretation. Structural inspection reports
`SMITHY_ASSEMBLY_REQUIRED` on every model. The package's semantic callback performs
limited native interpretation checks; `complete` is always false. Reference targets,
trait selectors, merge rules and mixin resolution require external native assembly.
Do not equate structurally valid with a valid assembled Smithy model.

The pinned oracle is `software.amazon.smithy:smithy-model:1.73.0` with smithy-utils
1.73.0. The Bun orchestration downloads the two Maven Central jars only when absent,
verifies fixed SHA-256 checksums, and runs the checked-in Java source. JVM tools remain
outside the browser library. Canonical native model hashes compare native meaning
before/after UMF serialization without passing exact values through JavaScript numbers.

The corpus includes all 63 JSON files in the upstream loader/valid subtree at commit
`dd2d50a93db313ee21b41916af158442e14669e1`, plus its Apache-2.0 license. Together with
one authored model, 64 native outcome/event/hash comparisons agree; 62 assemble in
isolation. `service-with-rename.json` and `use/use-shapes.json` require additional
referenced shapes and remain unresolved in this standalone corpus profile. A valid
candidate edit changes the native model hash; an unresolved target is natively rejected.
This does not establish full language, protocol, IDL or transformation support.

Sources: [Smithy JSON AST](https://smithy.io/2.0/spec/json-ast.html),
[model semantics](https://smithy.io/2.0/spec/model.html), and
[pinned upstream loader fixtures](https://github.com/smithy-lang/smithy/tree/dd2d50a93db313ee21b41916af158442e14669e1/smithy-model/src/test/resources/software/amazon/smithy/model/loader/valid).

## Explicit Dependency Bundles

The payload now supports optional `dependencies: [{id, root}]`. IDs must be nonempty
and unique within the dependency list; they identify supplied documents, not shape
names, filenames or namespace aliases. Each root uses the same exact NativeJson tree
and structural checks as the primary model. Array order, unknown native content and
exact numeric tokens are retained. No automatic discovery, fetch or merging occurs.

`importSmithyJson(text, {id, dependencies: [{id, schema}]})` accepts native JSON text
for every supplied model. `exportSmithyBundle` returns `schema`, all dependency
`{id, schema}` entries, copied source and diagnostics. With dependencies present,
`exportSmithyJson` throws `SMITHY_DEPENDENCIES_REQUIRED`. Unknown fields in dependency
representation objects or tagged trees block both export paths. Duplicate IDs are
errors. Conflicting native shape definitions remain preserved for the assembler to
reject; UMF never chooses a winner.

`getSmithyNode` and `proposeSmithyNodeEdit` accept an optional final `dependencyId`.
Omitting it selects the primary model. An unknown ID fails; root replacement and node
edits affect only the selected model in a copied document. All candidate validation
remains incomplete until native assembly.

The two previously unresolved upstream fixtures are now also exercised with an
explicitly authored `foo.example#Widget` model. These are augmented bundle cases, not
altered upstream files or a reclassification of the standalone baseline. Ten JVM
assembly cases verify original/restored canonical model agreement, meaningful edits,
unresolved-target rejection and conflicting-definition rejection. Java tools remain
outside the browser package. Full browser assembly and IDL handling remain open.

## Supplied IDL and JSON Source Profile

The same package now also describes the disjoint `smithy-idl-sources` profile, with a
nonempty `files` map of relative `.smithy` or `.json` paths to exact strings. No entrypoint
is inferred: Smithy assembly consumes the supplied model set. Paths cannot traverse
directories. Combined text and core structural limits apply. No external file is loaded.
The extension schema fully describes both representation profiles; it does not claim
to describe every native semantic rule.

`importSmithySources({files}, {id})` and `exportSmithySources(document)` retain file text
without parsing it. `proposeSmithySourceEdit(document, path, text)` replaces an existing
file in a copied document. Every inspection reports `SMITHY_SOURCE_UNVALIDATED` and
`complete: false`, even for text that a native parser would reject. Here `valid` means
valid source archive, not valid Smithy syntax/model. Native assembly is a separate
requirement. AST APIs and source APIs reject the wrong profile. Unknown representation
fields survive UMF and block source export; preserve the source UMF for unrelated metadata.

All 80 IDL files from the same pinned loader/valid subtree are separately archived.
Native outcomes, diagnostic IDs and canonical hashes agree before/after exact source
round trips; 78 assemble standalone, while service-with-rename and use/use-shapes need
additional context. An authored two-file model round-trips natively, a length-bound edit
changes the model hash, and a missing target fails assembly. This evidence does not
provide a browser parser or assembler. SPIKE-002 records the initial direct-port failure and the subsequent patched JavaScript
runtime experiment. Its 144-case agreement is separate from this public archive API;
public assembly integration and remaining runtime behavior still need implementation.

## Public Native Assembly

`assembleSmithyDocument(document, backend, {id})` consumes either profile through its
existing guarded export API. Source archives keep their filenames; AST bundles map
the root to `root.json` and each dependency to `dependency-N.json`, with an explicit
file/dependency-ID mapping in the result. The backend is trusted installed code with
a nonempty identity and an `assemble(files)` method returning bounded JSON text. It
receives a separate input copy and must not fetch or discover additional model files.

`createSmithyJavaScriptBackend(module)` adapts the explicitly supplied pinned generated
module from `bun run build:smithy-experiment`. It declares
`smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1`. This factory does not discover or load
code automatically; callers must supply the documented installed module. The core
TypeScript bundle does not embed the larger native runtime.

`native-assembly.schema.json` defines the bridge response and
`assembly-result.schema.json` defines the public result. Results contain status,
compiler identity, copied source, input mappings, native events, UMF issues, limitations
and `complete: false`. Native event severity, ID, message and available source location
and shape ID are retained. An assembled result additionally contains `model`, a new
`umf.smithy` JSON AST document, and exact `nativeModel` JSON text. Numeric model values
never pass through host-number conversion. The source remains the authority for text,
file boundaries and intent erased by native normalization.

Malformed source documents/exports fail before invoking the backend. Native rejection
returns `blocked` with its events and no model. Runtime exceptions, contradictory success
with ERROR events, malformed response schemas and invalid assembled ASTs return blocked
results with error issues and no partial model. Unknown bridge fields are rejected
rather than silently discarded. Backend identity is a trusted integration assertion,
not cryptographic runtime attestation.

Native assembly resolves model semantics within the pinned profile; it does not prove
protocol behavior or cross-system equivalence. Source archive inspection remains
unvalidated until this separate operation runs. Generic-superclass reflection remains
explicitly unsupported in the JavaScript port. The current adapter runs synchronously
inside its promise call when the backend is synchronous; it cannot preempt synchronous work. Use the separate worker backend for termination guarantees.

The 144-case public API audit compares initial native canonical model hashes, event
IDs and result schemas against the JVM. All 140 successful models survive UMF YAML
and reassemble to the JVM's own second-stage output. Two IDL mixin-override fixtures
change serialization by adding explicit `apply` entries on reload. The JVM's
`flattenAndRemoveMixins` comparison reports unchanged effective models for both. This
is recorded separately, not treated as byte-idempotent serialization. Every assembly
result discloses this native normalization risk. The source preserves mixin declarations
and provenance that a flattened comparison intentionally does not cover.

## Worker execution

`createSmithyWorkerBackend({workerUrl, timeoutMs?})` takes an explicit trusted module
worker URL. Host the generated `worker.js` beside `smithy.js`. Each invocation starts
one dedicated worker and terminates it on every outcome. The deadline includes startup,
defaults to 30 seconds, and accepts integer milliseconds from 1 through 120000.
`assembleSmithyDocument(document, backend, {id, signal?})` accepts an AbortSignal.
A pre-aborted signal starts no worker; active abort terminates the worker. Deadline and
abort return blocked results with `SMITHY_ASSEMBLY_TIMEOUT` and
`SMITHY_ASSEMBLY_CANCELLED`, respectively, preserving source without a partial model.
Deadlines depend on the browser event loop and are not hard real-time guarantees.

The internal structured-clone protocol is `umf.smithy.worker.v1`: requests contain only
`protocol` and a nonempty `files` map of source strings for assembly. Selection requests
contain exactly `protocol`, `operation: select`, bounded `modelJson` and nonempty bounded
`selector` strings. The worker calls the corresponding native export; responses contain only
`protocol`, `ok: true`, `report` (bounded native bridge JSON text), or `protocol`,
`ok: false`, `error` (bounded text). Unknown response fields and malformed reports fail
closed. Workers receive only explicit source files. The application remains responsible
for serving the trusted runtime module and permitting it under its worker policy.
Worker isolation provides responsiveness and termination, not a sandbox for untrusted
JavaScript. The direct module backend remains available and synchronous.

## Invalid-model evidence

The complete pinned loader/invalid model-file corpus contains 182 files (181 IDL,
one JSON). All reject in JVM and public JavaScript assembly after exact UMF YAML
source round trip. 181 return diagnostics; the resource-mixin-with-properties fixture
throws an IllegalStateException in the native JVM. The JavaScript API reports the
matching native exception message as a blocked issue without a partial model. Reports
retain this exception outcome separately from validation-event outcomes. Event parity
means severity/ID multiset equality, not diagnostic text/location equality. Chromium
also agrees on these 182 cases, bringing its runtime corpus to 326 comparisons.
This does not establish complete custom-validator, selector or reflection coverage.

## Native shape-set queries

`selectSmithyShapes(document, backend, selector, {id, signal?})` assembles either native source
profile, then invokes the backend's `select(nativeModel, selector)` method. It returns
`status: selected | blocked`, the exact selector, the complete assembly result, issues,
`complete: false`, and `shapeIds` only on successful selection. Shape IDs are unique,
sorted and retain native namespace/member identity. Native prelude shapes are included
when matched. An empty successful set is distinct from a blocked query. No matching
shape is promoted to a core entity or value merely because a selector found it.

`createSmithyJavaScriptSelectionBackend(module)` requires the explicitly installed
runtime's `assemble` and `select` exports. The native selector engine consumes the
assembled JSON model, including native reassembly normalization. The retained source
remains authoritative for original declarations. The complete bridge/result contracts
are `native-selection.schema.json` and `selection-result.schema.json`. Unknown response
fields, malformed/duplicate IDs and runtime exceptions fail closed. Failure to assemble
prevents any query invocation; selector failure retains the successful assembly report
but exposes no shape set. Invalid input options fail before running the compiler.

This is the native shape-set selection operation. Variable expressions are evaluated
by Smithy, but their variable environments are not returned. No custom starting-shape
context is supplied. The direct JavaScript backend remains synchronous and cannot
preempt native execution. The worker backend described below supports cancellable
queries. The native module is trusted.

Evidence: all 90 embedded expressions in all 15 pinned selector/cases files match
unmodified JVM output and upstream expected shape sets after source round trip. Three
invalid expressions are blocked. Chromium matches all 90 native sets. This exercises
traits, functions, traversal, comparisons and variables, without claiming exhaustive
language coverage. See the [Smithy selector specification](https://smithy.io/2.0/spec/selectors.html)
and the pinned fixture manifest for semantics and versioned evidence.

## Worker shape-set queries

`createSmithyWorkerBackend` now implements the selection backend interface too.
`selectSmithyShapes` uses one worker for assembly and a second fresh worker for selection;
`timeoutMs` applies separately to each stage, including startup. It is not a total query
wall-clock budget. A single optional AbortSignal covers both stages. A pre-aborted query
starts no worker, and cancellation during assembly prevents selection. Selection abort
or deadline returns `SMITHY_SELECTION_CANCELLED` or `SMITHY_SELECTION_TIMEOUT` in query
issues, with no `shapeIds`; the successful assembly result and original source remain
available. Assembly-stage failures remain in the nested assembly report. Every worker
is terminated on success, failure, timeout or abort. The page thread validates/copies
inputs and decodes results; native assembly and selector evaluation run in workers.

The selector worker protocol is an additive operation of v1. Applications must serve
`worker.js` and `smithy.js` from the same generated build. An older assembly-only worker
rejects a selection request explicitly rather than returning a spurious empty set.

## JSON Schema native-emission projection

`projectSmithyToJsonSchema(source, backend, policy)` requires `id`, absolute `baseUri`,
`rootShape`, `profile: native-defaults-2020-12`, `usage: native-emission`, and
`lossPolicy: strict | allow-reported-loss`. `createSmithyJavaScriptJsonSchemaBackend`
adapts the explicitly installed module's `assemble` and `jsonSchema` functions and
identifies `smithy-jsonschema@1.73.0`. Other trusted backends must identify their converter.
The complete result schema is `spec/projections/smithy-json-schema.schema.json`.

The native profile creates a fresh JsonSchemaConfig, sets Draft 2020-12 and adds the
canonical `$schema` document extension. Every other native default remains unchanged.
The root must be a data shape; service, resource, operation and member roots are rejected.
The projection assembles the source, passes exact native model text to the converter,
retains native schema text, imports it through the JSON Schema adapter and inspects it.
Compile failure blocks the target even when the adapter categorizes it as incomplete
rather than structurally invalid. Converter errors and malformed output also block.

Results preserve source, assembly report, converter identity, policy, loss issues and
`complete: false`. Native output is retained whenever conversion returned it. Only
`projected` results have a target. Strict policy always blocks a target until exhaustive
fidelity is established. Allow-reported-loss acknowledges a global, explicit lack of
full trait/operation/resource/protocol equivalence; this is not an instance converter.
Native defaults use JSON number for integer types, so fractional values can validate
for Smithy long. Timestamp/blob/union representation is native converter policy, not
an inferred universal UMF meaning. These risks are reported on every projection.

The 52-root audit compares exact schema text or conversion failures with the unmodified
JVM. Forty-two permit targets; eight native failures and two unresolved recursive-root
schemas remain blocked. Independent target tests demonstrate 12 constraint/representation
cases and confirm the recursive-root defect. Upstream expected-output files are retained
but use other configurations and are not claimed as profile-matching expected vectors.
The converter package is checksum-pinned. Configuration/mappers, worker execution,
service lowering and native output repairs remain required follow-up work. This native
emission slice is not completion of Smithy projection support.

## Root-definition emission profile

Policy also accepts `profile: native-root-definition-2020-12`. This uses the same native
configuration, then registers the converter's typed root Schema at `toPointer(root)`
through `SchemaDocument.toBuilder().putDefinition(...)`. The pointer must be top-level
and unoccupied; otherwise conversion fails. The document root itself is retained. The
operation does not walk or rewrite arbitrary JSON values. It adds a root definition even
when recursion is absent; this is a declared representation change.

The backend additionally supplies `jsonSchemaWithRootDefinition(modelJson, rootShape)`.
If unavailable, the operation is blocked explicitly. The result retains the unmodified
`nativeSchema` and adds `adaptedSchema`; only the adapted text is imported as the target.
`SMITHY_ROOT_DEFINITION_ADDED` records the change. Strict policy still blocks targets.
This named profile fixes root definition availability, not native name conflicts, mixin
conversion failures, integer representation or overall Smithy-to-JSON-Schema equivalence.

The expanded corpus has 55 roots including authored recursive structures/list/envelope
and defaults. All adapted outputs/failures match the JVM, 47 produce usable targets,
and eight native conversion failures remain blocked. Target JSON Schema documents also
survive UMF YAML round trips without changing their exact native JSON trees. Independent
validation checks recursive success/failure, required members, exact numeric defaults
and literal reference-like text. The original profile still exposes native defects as
blocked results; it is not silently repaired or reclassified.

Native-profile local references are resolved over exact JSON trees before accepting a
target. This remains effective when unsafe host-number defaults prevent JavaScript
validator compilation. External references, nested resource IDs and dynamic references
are outside these fixed native profiles and block emission. Instance-valued keywords
are not traversed as schemas. Numeric validation limits are still reported explicitly;
independent Python evidence checks exact defaults and recursive instances.

Exact-number inability to run the JavaScript validator is distinct from a reported
compile error. It does not discard native numbers or automatically invalidate a schema:
allow-reported-loss may expose such a target with `JSON_SCHEMA_NUMERIC`, exact reference
checks and `complete: false`. This profile's corpus has independent Python target
validation evidence. It is not a claim that the browser can validate every target
instance. US-014-AC16 now states this distinction explicitly after the unsafe-default
fixture exposed the earlier compile-only wording as insufficient.

## Service-context emission profile

`native-service-context-2020-12` requires a nonempty `serviceContext` shape ID. The other
profiles reject that option so it cannot be silently ignored. The native backend must
provide `jsonSchemaForService(modelJson, rootShape, serviceContext, addRootDefinition)`.
An absent capability blocks the projection. The native bridge requires an existing
ServiceShape and checks the selected data root against `Walker.walkShapes(service)`.
Unknown/wrong-type contexts and outside-closure roots fail without a target.

The profile sets native JsonSchemaConfig.service; default out-of-service-reference
behavior remains disabled. Native service renames determine definition names. It does
not invent aliases or merge shapes that have the same local name. The selected service
ID is retained in policy, and full qualified identities remain in the untouched source
and assembly model. This converts a data root in a service context, not service operations
or transport behavior. The result includes `SMITHY_SERVICE_CONTEXT` and remains incomplete.

`nativeSchema` is the original output with that service configuration; `adaptedSchema`
adds the typed root definition using the same configuration. Both are retained. The
unscoped native profile is not rerun as a prerequisite, since its name-conflict failure
is precisely what an explicitly supplied service context can resolve. Strict policy
still blocks targets and all exact-reference/target validation guards remain in force.

The 40-case matrix compares every data root against every service in each supplied
source model that declares services, including rejected combinations. Thirty produce
targets and ten explicitly fail the closure check. All match JVM output/failures and
round-trip target trees. Independent vectors confirm distinct SalesCustomer and
SupportCustomer constraints, and different enum domains under ServiceA/ServiceB. This
implements declared native contextual naming, not universal automatic name conflict
resolution. Broader configuration, service-operation lowering and other conversion
failures remain open.
