---
ddx:
  id: TD-014
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-014
      kind: informed_by
    - id: US-014
      kind: informed_by
---

# TD-014: Smithy native JSON trees

Reuse the shared NativeJson representation for Smithy's JSON AST. No new core concept
is justified merely because Smithy has structures, resources or services. Traits and
metadata remain exact native content; names are not collapsed into core identities.

Use a native structural schema for field forms and a callback for explicit unknowns
and interpretation limits. Host JSON conversion is temporary and used only for shape
checks; no numeric trait or metadata value is persisted through that conversion.
Mixins can supply collection members, so local-member requirements must allow them.
Semantic reference resolution and trait interpretation are not approximated in this
first browser profile. Candidate edits preserve the source and return incomplete checks.

A separate JVM oracle assembles original and re-exported models and hashes canonical
serialization in Java. It compares diagnostic IDs as well as outcomes, and checks a
valid edit and an unresolved reference. Vendored upstream fixtures include failing
standalone cases; no corpus pruning converts missing context into apparent support.
The checksummed Java dependencies are development-only. Chromium exercises the public
adapter with exact numeric tokens and a candidate reference edit.

Next work: supplied multi-file assembly and missing fixture context, native IDL source
round trips, an editable normalized model view with provenance, and explicit target
projection contracts. Protocol behavior, selectors and arbitrary custom trait semantics
remain unimplemented. No core promotion follows from this source-retention evidence.

Dependency bundles now retain separate tagged native roots under explicit IDs. Inspection
walks every root and reports dependency-local paths. Native export of the primary file
alone is forbidden when dependencies are present. Bundle export includes all sources
without flattening model boundaries or resolving conflicts. Candidate node editing uses
an explicit dependency selector and preserves the other roots.

The bundle oracle writes each model to an isolated native directory and lets the JVM
assembler apply its own merge/reference rules. Original and re-exported directories
produce identical canonical models. Native negative controls reject a missing reference
and a conflicting definition; a valid dependency edit changes the model hash. The
Widget dependency is authored fixture context, clearly separate from upstream evidence.

A disjoint source profile now preserves supplied IDL/JSON files as exact strings.
The registry dispatches by profile; AST operations cannot read the source archive as
if it were a parsed model. Source inspection checks paths/size and always returns an
unvalidated warning. Candidate source editing therefore makes no parser claim. JVM
conformance compares all 80 pinned IDL fixtures and an authored multi-file edit case.
SPIKE-002 records concrete runtime gaps in a direct native-assembler JavaScript port;
no failed or reduced-validation port is shipped as browser assembly support.

The optional native runtime now compiles to JavaScript through the compatibility
patches recorded in SPIKE-002. All 144 existing JVM corpus outcomes/events/model hashes
agree in Bun and Chromium. This is experimental evidence; public archive APIs continue
to report unvalidated status. A typed assembly operation must retain source and report
unsupported reflection/runtime failures explicitly before exposing assembled models.

The public assembly layer now accepts a trusted backend separately from the small
TypeScript bundle. It constructs explicit file inputs from either source or AST profiles,
passes a copy, validates the bounded string response against a complete bridge schema
and imports the exact model JSON through the existing AST adapter. A structured result
retains original source and all native diagnostics, including locations and shape IDs.
No target is exposed after rejection or runtime/protocol/import failure. Runtime code
loading remains an explicit application decision. Worker isolation, cancellation and
deadlines remain required follow-up work; the promise wrapper alone does not provide them.

Reassembly verification must compare against the JVM's second-stage serialization,
not assume the native serializer is idempotent. Two mixin member override fixtures add
explicit `apply` entries on reloading. A separate native flattened-effective-model
comparison remains stable. Both serialization and effective-model results are retained;
source provenance is never replaced by the flattened comparison.

The worker backend now allocates one module worker per request, copies validated source
files, and uses a single settlement function to clear the deadline, detach abort/message
handlers and terminate the worker. No runtime state survives between jobs. The public
operation preserves typed timeout/cancellation/protocol issues. Source remains retained
on all blocked outcomes. Browser tests use the real compiled runtime for acceptance and
rejection; a separate deliberately nonterminating test worker checks page heartbeat,
termination by abort and deadline. It is not native compiler conformance evidence.

The negative-corpus oracle uses a separate Java entry point that catches native runtime
exceptions per file so one native failure cannot truncate later cases. It records the
native exception class/message and does not synthesize validation events. The public
API comparison requires the matching exception message in a blocked result; other
cases require exact event severity/ID multisets and no runtime issues. Every source
is archived/restored before public assembly. All manifest hashes are checked first.
The conformance gate invokes this oracle after building the optional JavaScript runtime.

The optional native bridge now exports `select(modelJson, expression)`, reassembles the
exact native model and calls Smithy's `Selector.parse(...).select(model)`. It returns
sorted shape IDs rather than approximating traversal in TypeScript. The typed query API
first assembles the retained document, validates the bounded native JSON query response,
and nests the assembly report in its result. Blocked queries never expose partial sets.
Native member and prelude identities survive unchanged. Query execution supports both direct and worker backends; variable-environment output
remains open. No new core concept is inferred from selector behavior.

The oracle inventories all 15 selector/cases source files and all 90 embedded expected
vectors. It compares full native shape sets before applying the upstream test-only
prelude filter for expected-vector checks. This prevents fixture filtering from changing
the public API contract. Source archives round-trip before queries. Chromium separately
runs every native expression and compares complete shape IDs against the JVM.

The worker backend now shares a request lifecycle between assembly and selection while
keeping operation payloads explicit. Each request owns its worker, timeout and abort
handler; a single settlement function cleans up all three. Stage-specific cancellation
and deadline codes preserve whether assembly or selection stopped. The public selection
operation passes the same AbortSignal to both stages and checks it again before exposing
results. A completed assembly is retained after query failure. Timeout is per native
stage, not an overall deadline. Native query code itself is unchanged.

The optional runtime now unpacks checksum-pinned smithy-jsonschema 1.73.0 alongside
model/utils and exposes `jsonSchema(modelJson, rootShape)`. No converter source patch
was needed for the named native-defaults-2020-12 profile. Both JVM and compiled runtime
use the same explicit configuration. The public projection keeps native output separate
from the imported target and blocks unresolved references rather than hiding the native
recursive-root defect. Broader configuration and repairs require separate evidence.

The converter oracle covers all source resources in the upstream test-resource directory
and all declared data roots, plus authored recursive/constraint cases. It compares exact
output or native exception messages and validates the public result schema. Independent
Python target-instance tests qualify generated validation behavior, including fractional
long acceptance. No concept is promoted into core from superficial shape similarity.

Root-reference correction is a separate emission profile. The bridge shares the native
conversion helper, then uses the converter's exact root pointer and SchemaDocument
builder to add the typed root schema as a definition. It neither guesses shape names
nor rewrites `$ref` strings inside defaults or other instance values. An occupied or
non-top-level pointer blocks conversion. The public layer retains both original and
adapted text and imports only the latter for this profile. JVM comparison and independent
recursive instance validation cover the change; source preservation and strict loss
policy continue to apply. Root duplication is explicit even for nonrecursive schemas.

An exact unsafe-integer default revealed that JSON Schema inspection can skip JavaScript
compilation before reaching unresolved references. Projection now separately walks
schema positions and resolves each local pointer against the exact tagged tree. It
rejects nonlocal/dynamic/resource-scope references outside the native profile. Defaults
and other instance values are excluded from schema-position traversal. A regression
combines an unsafe integer default with a missing reference and requires a blocked target.

Native naming inspection showed that PropertyNamingStrategy controls member names,
not shape references. Shape reference naming instead honors JsonSchemaConfig.service
and the service's existing rename map. The new profile therefore requires an explicit
service context rather than fabricating a naming strategy. Walker verifies root membership
before conversion; both native and root-definition output use the same service setting.
The source is never renamed. A separate JVM matrix iterates each source's service/data-root
cross product so outside-context cases remain tested rather than filtered away.
