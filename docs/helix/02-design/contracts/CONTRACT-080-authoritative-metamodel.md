---
ddx:
  id: CONTRACT-080
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-001
      kind: references
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
    - id: CONTRACT-077
      kind: references
    - id: CONTRACT-078
      kind: references
    - id: CONTRACT-079
      kind: references
---

# CONTRACT-080: Authoritative current-core metamodel and generated enforcement

## Purpose and boundaries

Provide one editable definition of core 0.10.0. `spec/metamodel/umf.yaml` MUST
be an authored UMF document, using a declared closed metamodel vocabulary. Its
fields, accepted values, invariants and descriptions drive current structural
and semantic validation, public shapes and reference/ontology consumers.
This contract transfers authority; it does not expand native equivalence claims.
CONTRACT-001 through CONTRACT-011 retain their fidelity/unknown-content rules.

## Model and compiler

The model MUST declare required presence separately from nullable values,
container/union/reference shapes, known keys and unknown-content behavior,
conditions, domain/refinement/literal eligibility and ordered semantic assertions.
It MUST NOT embed authored JSON Schema as rule authority or invoke handwritten
core validators through named callbacks. The compiler MUST reject unknown
operators, malformed declarations, dangling targets and duplicate identities.

The compiler MUST parse independently of generated document validation, using
bounded safe JSON-compatible YAML admission. It MUST generate from a clean tree,
self-validate the model afterwards, and reach a byte-identical second-generation
fixed point. `--check` MUST write nothing and fail on stale/missing/extra outputs.
Every generated resource MUST identify its model/compiler provenance.
Here self-validation means current core structural admission plus the compiler's
closed metamodel vocabulary checks. An ordinary empty semantic registry does not
provide complete semantic validation of the metamodel extension; its report
remains `complete: false` until that vocabulary is registered.

Canonical outputs are `spec/core/schema.json`, generated semantic-reference and
extension-package schemas, `src/generated/core-model.ts`, browser-compatible
standalone structural validation, `spec/metamodel/generated/python-shapes.json`,
generated `spec/metamodel/package.json` vocabulary manifest, and shared
`spec/metamodel/generated/{core-constraints,domain-policy}.json`. Exact export
names and program grammar MUST be frozen here before delegated integration.

### Versioned Core operation-resource outputs (2026-10-26 amendments)

The canonical output inventory above is preserved. The metamodel additionally
declares operation-resource outputs through a closed `umf.metamodel.resources`
sequence. Version 1.1.0 authorized Facets v3 and Cardinality v4; version
1.2.0 additionally authorized Kind v6 and Nullability v5; version 1.3.0 adds
Key v2 and Record Type v6:

| Model binding path | Schema `$id` | Title |
|---|---|---|
| `spec/core/facet-operation-v3.schema.json` | `urn:umf:core:facet-operation:3.0.0` | `Facet inspection and authoring receipts (Key envelope) (Relationship envelope)` |
| `spec/core/cardinality-operation-v4.schema.json` | `urn:umf:core:cardinality-operation:4.0.0` | `Core cardinality inspection and explicit author declaration results (Key envelope) (Relationship envelope)` |
| `spec/core/kind-operation-v6.schema.json` | `urn:umf:core:kind-operation:6.0.0` | `Core kind author declaration receipt` |
| `spec/core/nullability-operation-v5.schema.json` | `urn:umf:core:nullability-operation:5.0.0` | `Core nullability inspection and explicit author declaration results (Key envelope) (Relationship envelope)` |
| `spec/core/key-operation-v2.schema.json` | `urn:umf:core:key-operation:2.0.0` | `Core Key and Record membership authoring and inspection receipts (Relationship envelope)` |
| `spec/core/record-type-operation-v6.schema.json` | `urn:umf:core:record-type-operation:6.0.0` | `Core record type declaration receipt` |

Each resource declaration has exactly `path`, `id`, `title`, ordered
`externalResourceIds`, ordered `definitions`, and `root` fields.
`externalResourceIds` lists the only permitted external resource targets in
that resource, in first-use order; entries must name a declared output ID and
must be unique. Facets, Cardinality, Kind, Nullability and Key list exactly
`urn:umf:core:0.10.0`, the ID of the generated `spec/core/schema.json` output.
Record Type lists that ID followed by `urn:umf:core:kind-operation:6.0.0`, the
declared Kind v6 output. Resource-local links resolve only to a definition in
that resource. External links resolve only to an ID in its
`externalResourceIds` list or to a declared `$defs` member of that exact
listed output, using a `#/$defs/{name}` fragment. No other fragment form is
admitted. `path` is a unique normalized relative path under
`spec/core/` ending in `.schema.json`; absolute paths, traversal components,
duplicates, and paths outside that directory reject. `id` is unique among
declared resources. `title` is a nonempty string. `definitions` is an ordered
sequence of unique `{name, shape}` declarations and MAY be empty; `root` is
one shape from the frozen neutral grammar. No resource declaration accepts raw
JSON Schema or arbitrary keywords.

For these resources, emitted document members are ordered `$schema`, `$id`,
`title`, optional `$defs`, followed by root-shape keywords. `$defs` is omitted
for an empty declaration list; otherwise its member order is the declaration
order. Object shapes accept the existing closed fields plus the
optional nonnegative integer `minProperties`; it is emitted only when present.
The compiler's fixed object-schema keyword order for Facets, Cardinality,
Kind, and Nullability is `type`, `additionalProperties`, `required`,
`properties`, `dependentRequired`, `minProperties`, followed by the existing
conditional keywords. The Facets request declares `minProperties: 1`; the
Cardinality request omits it. Existing
canonical outputs retain their frozen byte representation.

Key v2 retains its current exact serialization order: object keywords are
`type`, `required`, `additionalProperties`, `properties`; array keywords are
`type`, `uniqueItems`, `items`, `minItems`; root `oneOf` precedes its
`description`. Record Type v6 has no definitions, so its generated resource
omits `$defs`. These are fixed compiler rules for the two exact bindings, not
model-controlled keyword-order or raw-schema escape hatches. Generation MUST
preserve both current resource byte sequences exactly.

These operation resources additionally admit a resource-only neutral shape
`object-fragment`, only beneath a resource `conditional` shape's `condition`
or `yes` subtree. Its exact fields are `tag`, optional ordered `required`,
and optional ordered `properties`; at least one of `required` or `properties`
is required. `properties` maps property names to neutral shapes. It emits only
the present `required` keyword followed by the present `properties` keyword,
with no `type` or `additionalProperties`. It is rejected in ordinary core,
reference, package, constraint, and domain declarations. This preserves the
existing Cardinality conditional fragments without widening the normal
`object` shape.

The six operation-resource paths are additional outputs in the metamodel's
generated manifest. Each path/hash entry is bound to that manifest's model and
compiler source hashes. The compiler does not inject `$comment` or other
provenance keywords into these resources; the manifest is their provenance
record. The operation-resource declarations establish authority for the current
resource bytes from their respective amendments forward. They do not reconstruct
or validate historical edits that produced those bytes. Generation MUST
preserve all six current resource byte sequences exactly and reach the same
clean-tree fixed point required above. No other operation-resource path or
unresolved resource alias is authorized or resolved by these amendments.

The vocabulary manifest advanced to `umf.metamodel` 1.1.0 for Facets v3,
Cardinality v4, and their resource grammar, to 1.2.0 for Kind v6 and
Nullability v5, then to 1.3.0 for Key v2 and Record Type v6. Each grammar remains closed as specified for its version;
consumers MUST reject declarations outside the version they advertise.

## Portable rule execution

### Frozen compiler/runtime interface (2026-10-18)

`src/generated/core-model.ts` exports `CURRENT_CORE_VERSION`, `coreSchema`,
`semanticTypeReferenceSchema`, `extensionPackageSchema`, `coreConstraints`,
`domainPolicy`, `coreVocabulary`, and generated `Document`, `Module`, `Element`,
`CoreItemTypeReference`, `CoreSemanticTypeReference` types. Standalone structural
checks live in `src/generated/core-validators.ts`. Python generated model shapes
live in `spec/metamodel/generated/python-shapes.json`; the wheel includes this
directory through `python/hatch_build.py`.

The model's `umf.metamodel` document annotation declares `language`, `constraints`
and `domains`. Records declare native UMF `members`; member Fields declare native
types/references where expressible and `presence` independently. `shape` uses a
closed neutral grammar: `object`, `sequence`, `text`, `integer`, `number`,
`boolean`, `null`, `link`, `constant`, `choice`, `exclusive-choice`, `all`, `not`,
`conditional`, and `any`. Object members, mandatory keys, key rules, unknown-key
policy, dependent presence, bounds, patterns and sequence uniqueness are explicit.
No annotation accepts a raw JSON Schema resource or arbitrary keyword passthrough.

The inert program has ordered `let`, `for`, `if`, `emit`, and `remember` steps.
Expressions are literal values, `{var: name}`, or a closed `{op: name, ...}` node.
Generic operations are `get`, `has`, `keys`, `values`, `entries`, `without`, `flatten`, `length`,
`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `not`, `and`, `or`, `concat`,
`pointer`, `tuple`, `canonical`, `filter`, `map`, `find`, `some`, `every`,
`sort`, `index`, `lookup`, `set`, `literal-errors`, `literal-identity`,
`numeric-interval`, `registered`, and `extension-errors`. Collection expressions bind a local
variable explicitly. `remember` stores the first canonical key/value in a generic Map, and optionally diagnoses repeated keys with an
explicit model-owned diagnostic. `literal-errors` and `numeric-interval` accept
the generated domain policy; all family/carrier/eligibility/facet decisions and
diagnostic policy remain model data. `extension-errors` is the trusted supplied
registry boundary, with exact source context and model-owned diagnostic policy.
Unknown steps/operators fail before execution, including on empty collections
or untaken branches. Programs cannot access filesystem, network or executable
callbacks beyond the explicit registry boundary.

`scripts/metamodel/build.ts` owns write and no-write `--check` modes. The generated
artifact inventory is `spec/metamodel/generated/manifest.json`; all output hashes
and source model/compiler hashes are checked. `spec/metamodel/package.json` is
compiler-owned. Runtime `src/validation/constraint-kernel.ts` exports
`runCoreConstraints(document, registry)`; Python executes the identical inert
program and domain policy. `tests/metamodel/` owns compiler, opcode, model mutation
and cross-runtime conformance tests; frozen baseline outputs remain separate.

Domain inventories use closed `$members`, `$values` and `$keys` references to
authored Record membership, constant-choice definitions and field-shape keys.
The compiler resolves them; known fields and label lists are not separately
authored tables. Dangling references reject. Literal policy supplies `fields`
and `itemLookup` property selectors and ordered `refinements` descriptors.
Descriptors declare `selector`, `applies` (`scalar`, `container`, `all`), `mode`
(`always`, `refinements`), `phase` (`before`, `after` recursive items), optional
`enabled`, bound/unit/property selectors and diagnostic reason references.
The closed mechanics are `count-bounds`, `integer-width`, `coefficient-range`
and `allowed-membership`; no per-core-rule callback is accepted. Unknown keys,
unknown mechanics, missing operands and malformed selectors reject even for
disabled descriptors or an input with no corresponding field. Removing a
descriptor changes direct literal and document-default checking through the
same generic mechanics in both runtimes. Current default execution uses private
immutable snapshots; exported metadata mutation cannot change active meaning.
All literal-policy declarations are required, including selector maps, qualifier
lists, family/container mechanics, interval projection and diagnostic inventory.
Nested declarations are closed; family flags are booleans, qualifier lists contain
unique nonempty strings, unit selectors require a unit diagnostic, and diagnostic
severity is `error` or `warning`. Admission copies bounded JSON without invoking
accessors. Only explicitly prepared, deeply frozen policy copies reuse admission;
mutable caller programs and policies are readmitted after every mutation.

The constraint program is inert JSON data. Conditions, selected objects,
parameters, assertion code/message/severity/path and execution phase/order MUST
be data. A generic interpreter MAY implement path/each/root/parent/exact lookup,
Boolean/type/presence/equality/comparison/count/uniqueness/reference primitives,
exact number and UUID mechanics, safe copies, resource limits and supplied
registry callbacks. There MUST NOT be a `callValidator` escape hatch or a
handwritten function selected for each core rule.

Structural admission precedes semantic access. TypeScript and Python MUST agree
on current-core acceptance, complete/incomplete status and ordered diagnostics
for the shared corpus. Registry callbacks receive the original exact source
context. Unknown content survives; unknown interpretation reports incomplete.
Diagnostic changes require an explicit reviewed correction with evidence.
JSON Schema-only validation MUST NOT be described as full graph/native validation.

## Enforcement coverage

| Meaning | Generated JSON Schema | Shared semantic program/kernel |
|---|---|---|
| Envelope/member presence, JSON types, lexical carriers, local shape combinations | Enforced from authored shapes | Structural admission runs first |
| Known versus unknown labels/members and interpretation completeness | Open slots preserve unknown content | Scoped ordered warnings and completeness |
| Qualified targets, ownership, keys, relationship endpoints and presentation collisions | Reference object shapes only | Resolution, uniqueness and relational conditions |
| Literal/default/allowed-values/facet declarations | Wrapper/token/condition shapes | Exact coefficient/UUID/Unicode equality, applicability, bounds and membership |
| Registered extension payloads | Package envelope shapes | Supplied registry structural/semantic callbacks with original source context |
| Native execution, storage enforcement, external term meaning | No claim | No inferred claim; requires independently qualified extension/native evidence |

A JSON Schema-only consumer therefore has structural admission evidence. Full
core interpretation additionally requires the authored constraint program and
its domain policy. The same model change may affect both surfaces; matching one
surface cannot substitute for the other runtime's conformance proof.

## Current consumers and retirement

`python/hatch_build.py` MUST include generated shared rules and current schemas,
exclude inert historical resources and be tested in an installed wheel.

Current producers, classifiers, package envelopes, operation schema refs,
resource accounting, docs and browser validators MUST consume generated current
resources. Old markers MUST reject visibly; no private downgrade recursion,
old core dispatch or migration-only public core API remains. Current useful
classification and native-specific migrations MUST be preserved.

Collision-prone native conversions MUST preserve source or explicitly refuse;
changing a marker does not prove meaning preservation. Historical receipts and
source baselines MAY remain inert, but MUST NOT be imported, packaged as current
resources, or relabelled as current evidence. Native dialect, extension release
and receipt format identities remain exact and independent.

## Reference and browser

One Schemas route owns ontology, reference and catalog:
`reference/core.html#view=ontology|reference|catalog`. Owned links MUST use it;
the separate explorer host and host-level navigation/collapse shims retire.
Reusable renderer changes MUST have a real release/pin and reproducibility
proof. Current-model local-file, embedding, collapsed startup, YAML default/JSON
toggle, keyboard/mobile/deep-link behavior remain mandatory.

## Acceptance

US-089-AC19–25 and STP-091 govern qualification. Completion requires closed
retirement census, full required regression, independent review, current docs,
automated build-role signing and live manifest/signature/browser verification.

## Rust execution binding amendment

ADR-006 changes the shared implementation language, preserving this contract's
authored-model authority and inert program grammar. The target compiler and
structural/semantic/literal mechanics MUST have one Rust implementation shared
by native Python, Node/Bun and browser WASM. Generated TS/Python shapes and inert
resources remain derived outputs; bindings MUST NOT maintain parallel core rules.
The named current TS/Python implementation paths above are migration inputs, not
permission to retain separate interpreters after cutover. R0/R1 of the Rust plan
freeze replacement paths/interfaces before implementation. Exact diagnostics,
callback source context, bootstrap independence, fixed-point generation and
unknown-content requirements remain. No core version change follows solely from
changing language; any semantic or public-interface correction requires its own
reviewed compatibility decision.


### R2 production Rust interface and resource freeze

R2 implements the complete current compiler, structural gate, literal/domain
mechanics, ordered program, registry, copying and serialization. The three R1
operations and their JSON request protocol are experimental controls, not the
production interface. R3 generators and R4 codegen-package/V8 removal are separate.
The existing TypeScript/Python implementations remain frozen differential inputs
until their respective qualified cutovers; their historical results are not Rust
evidence. R2's installed `umf-core` candidate preserves its public import names,
Pydantic model ergonomics, supplied extensions and synchronous operations.

`crates/umf-core` owns the public Rust library. Its owned `Value` variants are
`Null`, `Bool`, `Number`, `String`, `Array`, and `Object`. `String` and object keys
use `Utf16` code-unit sequences; `Object` stores unique ordered `(Utf16, Value)`
members. Number constructors and public operation admission enforce CONTRACT-001's
finite binary64/safe-integer/nonnegative-zero envelope. Typed literal tokens remain
strings; exact coefficient/exponent arithmetic MUST NOT pass through binary64.
Interpreter-only `Missing` and keyed-map values are distinct from JSON null and
MUST NOT escape as JSON data. Object enumeration, canonical sorting, string
length/coercion and number formatting preserve the current JavaScript contract,
including UTF-16 ordering and integer-index member enumeration where applicable.

Bindings transfer values using the private `umf.core-wire/1` tagged tree:
`{kind:"null"}`, `{kind:"boolean",value:boolean}`,
`{kind:"number",bits:"<16 lowercase IEEE-754 hex digits>"}`,
`{kind:"string",units:u16[]}`, `{kind:"array",items:WireValue[]}`, or
`{kind:"object",members:[{key:u16[],value:WireValue}]}`. All fields are required
as shown; unrecognized fields/tags, duplicate decoded keys and malformed payloads
reject. Numeric bits are the big-endian IEEE-754 binary64 bit pattern. Native
bindings MAY use an equivalent direct typed traversal. A generic host JSON stringify
or UTF-8 conversion MUST NOT precede hostile-object/numeric/Unicode admission.
Host wrappers may inspect descriptors/types and construct this tree, but Rust
owns semantic admission and all model decisions. No wrapper may replace core rules.

The shared Rust types are `Format::{Json,Yaml}`, `EngineError {code,path,message}`,
`Diagnostic {code,path,message,severity}`, and
`Validation {valid,complete,diagnostics}`. Engine-error paths/messages and all
three diagnostic text fields (including consumer-supplied codes) preserve UTF-16.
Closed machine error codes remain UTF-8 identifiers. Public
entry points return owned snapshots or `Result<_,EngineError>`; validation returns
its contracted invalid/incomplete diagnostic report for ordinary invalid documents.
`Engine::new(ResourceSet)` admits and privately owns immutable resources;
`ResourceSet` contains the three schemas, constraint program and domain policy.
The public modules expose `value::copy_json`, `serialization::{read_json_value,
write_json_value}`, `document::{read_document,write_document,validate_document}`,
`literal::{prepare_policy,literal_errors,literal_identity,numeric_interval,
exact_coefficient}`, `constraints::{check_program,execute_constraints,
run_core_constraints}`, `schema::CompiledSchema::{compile,validate}`, and
`registry::Registry::{new,register,get}`. Context/budget arguments are explicit;
concrete Rust lifetime/allocation details may evolve without changing these meanings.

`CompiledSchema` operates on owned values and explicit supplied resources only.
The core evaluator's diagnostic codes, pointer paths, messages and ordering match
frozen current controls; no error-count truncation is permitted. Consumer schema
and registry admission MUST retain their existing dialect/resource behavior,
including Python's existing Draft 3/4/6/7/2019-09/2020-12 validator surfaces, strict unknown-keyword
refusal where currently required, exact identity conflicts, boolean schemas and
no implicit retrieval. A new restrictive schema subset cannot silently replace
an accepted current capability. Unsupported implementation cases remain an open
R2 gate. Structural checks precede semantic access and use the same generic
canonical equality for `const`, `enum` and `uniqueItems` as the program kernel.

Registry records own immutable copied manifests/schemas and an optional trusted
capability token. The core invokes an explicit host `Capabilities` interface with
that token, a copied payload and `{document,path,scope}` containing the original
source document. Callback results are ordered diagnostics; callback errors follow
the model-owned failure rule and MUST NOT become successful unchecked validation.
Host exception presentation, thread affinity and synchronous reentry stay in the
binding. Missing semantic capabilities report incomplete; documents cannot load
callbacks, fetch resources or select installed code by text. Registry instances
and invocation budgets MUST NOT depend on mutable global defaults.

Ordinary source and serialized output limits remain 4,000,000 UTF-16 text units,
with depth 128 and 100,000 traversed semantic values; the explicit synchronous catalog scope retains 1,000,000 values. Preserve
the existing 5,000,000 constraint-instruction ceiling and charge copies,
enumeration, sorting, exact arithmetic and nested interpretation. Copied values and private canonical/interpreter intermediates do not acquire a
new fixed aggregate text ceiling. Their owned work must still be charged before
allocation. Transport wrapper overhead must not consume an independently admitted
payload's text, depth or value allowance; protocol parsing remains explicitly
bounded by already-owned input and frame depth. The invocation
`Context` owns counters, an optional caller meter and cooperative cancellation;
clock deadlines require an explicit host clock capability. Resource failure,
cancellation or callback failure publishes no partial successful result. Reentrant
calls own independent state. Parser/regex calls and trusted callbacks are not
claimed hard-preemptible. The default resource profile is `Cooperative`. A request for `HardIsolated` MUST
return `RESOURCE_PROFILE_UNAVAILABLE` before parsing, compilation or callbacks in
R2; no hard-deadline or whole-process-memory guarantee is implied. Future native
worker/browser Worker profiles require separate implementation and execution
proof. They cannot silently replace synchronous public operations. Copies, output
units, exact coefficient expansion (at most 4,000,000 digits), collection work and
allocation requests are charged before allocation/work; counters describe owned
work, not whole-process resident memory. An optional caller meter may impose a
stricter limit and its errors propagate. Depth/value ceilings apply to each
admitted/copied JSON tree as in the current API; repeated legitimate copies do
not consume a new cumulative 100,000-value default allowance. Invocation work
meters remain cumulative where contracted. Private wire tags/code-unit arrays
are transport overhead, not extra semantic JSON values. The R1 8-MiB request
ceiling MUST NOT narrow the production 4-million-code-unit profile. No parser/regex/trusted-callback
preemption claim follows from cooperative checks around those calls.

The separately versioned `umf.python-client-host-read/4` selection profile in
CONTRACT-079 admits at most 4,000,000 cumulative UTF-16 units of selected
record/action identity strings before deduplication. This is a specific new
host-selection admission rule, not a reinterpretation of the ordinary source
limit and not a general ceiling on private copied values, generated output or
other computed text. Its raw-reference and frame limits, ordered controls and
cooperative-host qualification are governed by CONTRACT-079.

`crates/umf-metamodel` exposes `parse_model`, `compile_model` and `render_outputs`;
the compiler accepts independently admitted source, then checks the complete closed
vocabulary/program/policy before emitting. Its filesystem CLI is `crates/umf-cli`.
The eleven canonical output paths listed above remain compiler-owned, including
the output manifest and `python/umf_access/src/umf_access/generated_core.py`.
Current schemas/program/domain-policy/shapes must match predecessor meanings;
compiler provenance changes identify the new Rust source closure and Cargo.lock.
The manifest retains `umf.metamodel.outputs/1` with truthful successor provenance.
Its `sources` names the actual Rust compiler/runtime helper closure, Cargo.lock
and explicit build-backend inputs; the compiler digest MUST NOT retain the retired
TypeScript compiler identity. Hashes use UTF-8 output bytes, never host object
serialization. Successor generation is byte-identical on its second pass and
`--check` remains entirely non-writing, detecting missing/stale/extra files.

`src/generated/core-validators.ts` may remain a pinned Ajv standalone build output
until the default JS cutover in R7. This is an explicit third-party build backend,
not the production Rust structural engine or a hidden native compiler dependency.
Rust owns authored-model parsing, grammar checks, schema/rule/type/data emission;
the Bun assembler may supply only Ajv standalone emission and final manifest
assembly. Its final eleven-file inventory and fixed-point/no-write checks remain
mandatory. The native Rust CLI emits portable compiled data without invoking
JavaScript; it MUST NOT claim to independently emit Ajv's standalone artifact.
Predecessor comparisons permit only reviewed provenance changes and approved
backend-artifact differences; do not omit semantic schema/rule/type comparisons.

R2 qualifies a dedicated Rust-backed native/Node/Bun/browser entry plus an installed
`umf-core` candidate; the existing default JS engine remains a separately identified
differential implementation until its planned cutover. Browser loading is explicit:
asynchronous initialization returns an engine whose model operations remain
synchronous. Preserve existing default-entry synchronous APIs during this staged
qualification. No Rust-backed operation may silently fall back to JavaScript when
its native module or WASM initialization is absent.


#### Rust skeleton shared between implementation owners

These signatures freeze the cross-module split. Implementations may add private
helpers, but peers do not invent alternate value/resource/callback protocols.
`Utf16` owns `Vec<u16>` with borrowed `units()` and explicit fallible UTF-8
conversion; it MUST NOT replace unpaired units. `Value` is recursively owned.
`EngineError` and `Diagnostic` preserve the fields specified above.

```rust
// Foundation-owned public types; all public constructors re-admit caller data.
pub enum Value { Null, Bool(bool), Number(f64), String(Utf16),
    Array(Vec<Value>), Object(Vec<(Utf16, Value)>) }
pub enum Format { Json, Yaml }
pub enum ResourceProfile { Cooperative, HardIsolated }
pub struct Limits { pub max_text_units: usize, pub max_depth: usize,
    pub max_values: usize, pub max_constraint_steps: usize,
    pub max_coefficient_digits: usize }
// Context owns counters and optional meter/cancel/clock capabilities; no ambient
// state. Context::ordinary() uses 4M/128/100K/5M/4M, catalog() changes values to 1M.
pub struct Context<'a> { /* private counters and borrowed host capabilities */ }
pub struct StructuralError { pub instance_path: Utf16, pub schema_path: Utf16,
    pub keyword: String, pub params: Value, pub message: Utf16 }
pub struct SchemaResources { pub entries: Vec<(Utf16, Value)> }
pub struct CompiledSchema { /* privately owned immutable admitted schema */ }
impl CompiledSchema {
    pub fn compile(schema: &Value, resources: &SchemaResources,
        ctx: &mut Context<'_>) -> Result<Self, EngineError>;
    pub fn validate(&self, value: &Value, ctx: &mut Context<'_>)
        -> Result<Vec<StructuralError>, EngineError>;
}
pub fn copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError>;
pub fn read_json_value(source: &[u16], format: Format, ctx: &mut Context<'_>)
    -> Result<Value, EngineError>;
pub fn write_json_value(value: &Value, format: Format, ctx: &mut Context<'_>)
    -> Result<Utf16, EngineError>;
// Semantic-owner types; callback handles never originate from document content.
pub struct ResourceSet { pub core_schema: Value, pub reference_schema: Value,
    pub package_schema: Value, pub constraints: Value, pub domain_policy: Value }
pub struct SemanticContext { pub document: Value, pub path: Utf16, pub scope: String }
pub trait Capabilities {
    fn validate_extension(&mut self, token: u64, payload: &Value,
        context: &SemanticContext) -> Result<Vec<Diagnostic>, Utf16>;
}
pub struct Engine { /* private immutable ResourceSet and prepared programs */ }
impl Engine {
    pub fn new(resources: ResourceSet, ctx: &mut Context<'_>)
        -> Result<Self, EngineError>;
    pub fn validate_document(&self, value: &Value, registry: &Registry,
        capabilities: &mut dyn Capabilities, ctx: &mut Context<'_>)
        -> Result<Validation, EngineError>;
}
```

`Registry` is semantic-owner code. It accepts immutable copied package manifests
and optional capability tokens; the Python `Extension` adapter retains its current
public shape and maps it to a Rust-owned registration admission operation, rather
than implementing an independent package/schema/diagnostic policy in Python.
The empty capability implementation refuses unknown tokens. `Engine` current
resources are supplied explicitly by each distribution's embedded resource module;
they must match the compiler manifest. Rust tests may construct mutated resources
through the same admission API. Core code never opens package files itself.


#### R2 compatibility review clarifications

Strict unknown-keyword admission and regex language are separate choices. Core
and TypeScript registry schemas use ECMAScript Unicode semantics. Python consumer
and extension schemas use an explicit Python regex version profile; a JavaScript
regex engine plus a few text rewrites cannot substitute for that capability. The
Rust Python grammar/matcher owns execution and versioned Unicode data. Unsupported
version profiles are explicit, and support claims require installed version evidence.
The predecessor's local-reference guard, dialect-specific metaschema admission and
active keyword sets remain native Rust policy, including inert annotation behavior.

The exact predecessor admission corpus and official six-draft instance corpus are
independent controls, not new metamodel authority. Existing deviations from an
external test suite require an explicit reviewed compatibility decision. Python
code-point-origin distinctions that share the same UTF-16 sequence (an astral
scalar versus an explicit surrogate pair) remain an open review gate; no full
Python string-identity/regex-parity claim may silently exclude them.


#### Python diagnostic path provenance

The internal Rust `Diagnostic` carries `python_source_path` provenance in addition
to its four public fields. Only native schema path construction sets this marker;
Python/Node/WASM callback adapters set it false. The Python binding decodes marked
source-pointer segments only when this trusted provenance is present. Callback
codes or marker-looking path text MUST NOT select decoding. Schema resource URI
prefixes remain literal; internal pointer decoding MUST NOT rewrite `$id` content.
The closed wire and public Python/JavaScript diagnostics remain exactly
code/path/message/severity. This metadata preserves native Python path identity
without extending document-controlled executable policy.


The Rust-only diagnostic metadata also retains optional `PythonDiagnosticText`
(code/path/message as `PyText`) for trusted Python callback results. Operational
errors may retain `python_message_origin` for a raised Python host exception.
These fields preserve native code-point identity through core processing; they
are never inferred from user text and never extend the closed wire or public
four-field diagnostic shape. Host conversion, including final diagnostics and
exceptions, uses the invocation Context before allocation. This does not relax
the ordinary safe-number/UTF-16 value envelope.

The Python source/value serialization profile is selected explicitly by its
binding and implemented in the shared Rust parser/writer kernel. It preserves
Python code-point key/text identity, int versus float origin, and predecessor
YAML numeric resolution. JSON reading/writing and YAML reading preserve insertion
order; YAML writing sorts each mapping recursively by Python Unicode code-point
lexical order, as frozen in R2-SOL-PYTHON-SERIALIZATION-001-A1. Default ECMAScript/Bun serialization is
unchanged. The frozen source/output budget remains 4M UTF-16 units; copied values
and private intermediates have no new 4M field ceiling. Serializer whitespace is
presentation; value/type/origin preservation remains mandatory. See decision
R2-SOL-PYTHON-SERIALIZATION-001 and its independently captured native boundaries.


R2-SOL-CORRECTION-002 fixes the predecessor Python YAML writer's silent U+0085
(NEL) loss. YAML output MUST escape NEL in every string/key position so reading
the result preserves the original code point. Raw NEL in source retains native
ruamel line-break normalization; escaped NEL remains U+0085. This narrow reviewed
correction is guarded by its frozen native fixture, selected case and case hash;
it does not authorize other compatibility changes or alter the default
ECMAScript profile. Python YAML source character admission and scalar resolution
otherwise match the independently frozen native profiles.


R2-SOL-YAML-PARSER-PROFILE-001 permits a narrow, source-pinned vendor patch of
saphyr-parser 0.1.0 under `crates/umf-core/vendor/saphyr-parser`. Both serialization
profiles MUST use that shared scanner/parser implementation. Trusted Rust code
selects the immutable scanner profile; document content cannot select it. Existing
constructors retain the default YAML 1.2 behavior. The Python profile preserves
the native reader/scanner line-break and column behavior, including NEL/LS/PS,
and resolves implicit timestamp keys before flattening timestamp values to strings.
Global source rewriting and blanket scalar rejection do not satisfy this contract.
The vendored source, focused patch record, upstream hashes and all referenced
licenses belong to compiler attestations, inventory and offline sdist inputs.
Existing limits, cooperative controls and native/browser qualification apply.


The closed constraint interpreter preserves private logical object origins from
the retained TypeScript reference: recursively copied document/program/policy
objects have null-prototype coercion behavior, while evaluated object expressions,
`without` results and normalized diagnostics have ordinary-object coercion behavior.
Container transformations retain child origins unless the reference constructs a
new object. Equality and canonical identity ignore this private origin. This is
interpreter state, not a public Value, Python carrier, resource or wire extension,
and requires no host prototype inspection. Primitive comparison uses shared Rust
ECMAScript coercion, with UTF-16 string ordering and private numeric intermediates;
it does not relax ordinary finite/safe-number admission.

Native reference coercion refusals use the stable Rust `CONSTRAINT_COERCION` error
envelope. Qualification compares exact successful diagnostics and the explicitly
reviewed refusal mapping; it does not claim JavaScript `TypeError` class identity.
Operational limit/meter/cancellation failures cannot substitute for this mapping.
Python text origins remain output metadata and cannot alter ordinary ECMAScript
comparison. Composition materializes only trusted schema-path fragments before
joining them with arbitrary literal text, preserving marker-looking literal/URI
content and preventing a global trusted-path flag from affecting the new string.


Public Rust literal entry points admit each raw Value argument independently under
the ordinary envelope before delegating to private already-admitted mechanisms.
This enforces the new Rust public boundary; the retained TypeScript literal
helpers themselves do not perform the same defensive copies. Contextful schema
resource snapshots replace the initial contextless cloning helper.

The interpreter's computed strings and diagnostics use work/allocation admission,
without a fixed text-field ceiling. In particular, `concat`, `pointer` and
`canonical` must preserve preowned values larger than 4M units. The 4M UTF-16
limit remains specific to actual JSON/YAML source and serialized payload output;
protocol envelopes and copied/computed field values do not acquire that limit.


R2's Python standalone consumer validator retains the predecessor's broad
instance-numeric behavior separately from ordinary safe-number schema-source
admission. The evaluator distinguishes Python integer/float origin, including
older-draft integer and divisor mechanics, and preserves NaN/infinity comparison
and arithmetic-error classifications. Arithmetic conversion failures remain
instance errors through stable `PYTHON_SCHEMA_ARITHMETIC`, with deterministic
reasons. Native Python exception class/message identity is recorded in the frozen
oracle and is not part of the Rust facade claim. The 648-case and 1,938-case
independent arithmetic corpora qualify the tested subset alongside the six-dialect
schema suite; they do not imply the entire jsonschema Python API is implemented.


Python consumer evaluation order is observable. The shared Rust evaluator must
support first-error evaluation for `is_valid` and `validate`, including predicate
subcalls, without executing later work after the result is known. `iter_errors`
preserves the ordered public diagnostic prefix and raises a deferred arithmetic
terminal error only when iteration reaches it. Candidate errors buffered inside
combinators must not leak as public diagnostics or suppress required exceptions.
Meter/cancellation/deadline errors propagate; they are not validation failures.
This is one generic evaluator with explicit evaluation modes, not a Python
semantic implementation. Frozen ordered-keyword/combinator controls qualify the
predecessor behavior alongside arithmetic and official-suite controls.

Work totals and deliberately superlinear operation estimates use u64 on native
and wasm32. Host notifications split wide estimates into the same chunks of at
most u32::MAX units on both targets, checking capabilities between chunks before
opaque work. This prevents a hidden wasm32 total ceiling or clamped arithmetic
estimate; it does not add process-memory or hard-preemption guarantees.


The Python native predecessor's schema-valued `additionalProperties` traverses a
hash set of extra keys. Independent seed controls show different early validation
and arithmetic outcomes for the same owned object. R2 deliberately uses owned
object insertion order for that branch instead of reproducing host hash entropy.
The correction is limited to this identified unordered traversal; it does not
permit reordering deterministic keyword, array, property or combinator checks,
or treating arithmetic/operational errors as ordinary invalidity. Aggregate
false-schema diagnostics and exact target controls remain separately qualified.


The exact unordered-extra rule is recorded as
[R2-SOL-CORRECTION-003](../../04-build/evidence/rust-migration/r2/approved-python-schema-unordered-extras-correction.json),
with unchanged seed-dependent predecessor evidence and a separately frozen
insertion-order target corpus. Only schema-valued `additionalProperties` replaces
native `set(extras)` traversal; false-schema aggregates retain deterministic
native sorted-name/pattern behavior. Exact field/path/rule metadata and all other
method traversal remain independent gates.


Compiled Python error projection carries trusted keyword/rule metadata and a
physical instance location independently from native display paths. A display
path may identify a referenced keyword, omit a false-schema descent, or name a
missing Draft 3 property; it cannot safely recover `validator_value` or `instance`.
Use the actual source rule with preserved Python origin, and resolve ordinary
subjects in the shared admitted snapshot. Ephemeral subjects such as property
names use an explicit typed override. Override presence distinguishes an actual
null from no override. Do not copy the whole instance into every error or infer
metadata from path spellings. These are Python record fields; public core
Diagnostic and Value/wire shapes remain unchanged.


[R2-SOL-PYTHON-SCHEMA-ERROR-ORIGIN-001](../../04-build/evidence/rust-migration/r2/sol-python-schema-error-origin-decision.json)
qualifies the exposed validator, validator_value, instance and path fields. The
normalized Rust error envelope remains in use; exact native exception class,
message formatting and the entire jsonschema exception API are not claimed.


The supplemental
[subject-phase receipt](../../04-build/evidence/rust-migration/r2/sol-python-schema-error-subject-phases.json)
separates 11 construction refusals from two legally admitted Draft 3 schemas whose
boolean reference targets raise at evaluation. Preserve that phase. The latter
maps to `PYTHON_SCHEMA_EVALUATION` with deterministic reason `Draft 3 reference
target is not an object schema`; this is a trusted internal semantic terminal alongside approved
arithmetic and reached local-reference failures. First-error evaluation
may avoid unneeded later branches; all-errors iteration raises the terminal at
its ordered position. Resource/meter/cancellation/deadline failures remain outer
errors. The original combined-capture fixture is immutable; its `schemaError`
label alone is not evidence of constructor refusal.


Reached local schema references preserve evaluation phase and method ordering.
Missing local targets retain `SCHEMA_REF_UNRESOLVED`; reached targets that are
neither object nor boolean schemas use `PYTHON_SCHEMA_EVALUATION` with reason
`Schema reference target is not an object or boolean schema`. The earlier Draft 3
boolean-target reason remains distinct. These are semantic terminals, not source
admission failures or ordinary invalidity. Native first-error and predicate
short-circuits remain observable; iteration preserves diagnostics yielded before
the reached terminal. The frozen reference controls cover 363 admitted cases and
1,089 method observations across the three pinned Python versions.

Terminal classification uses trusted internal provenance, never public code or
message text. Context removes that provenance from every host-capability error,
including an error object previously returned by a kernel. Host meter, control,
cancellation and clock failures always remain outer errors. Recursive evaluator
frames must support the admitted depth on an ordinary 2 MiB native thread and
the actual browser WASM stack; increasing the test stack is not qualification.


Python schema display paths retain typed segments from the actual evaluated
source: `Key(PyText)` for object members and `Index` for array positions. Preserve
these through reference display rebasing and keyword prefixing. Numeric object
keys remain strings, while array positions remain integers even when the caller's
root contains only a reference. Neither pointer spelling nor traversal of the
original root can recover that distinction. This metadata is private to Python
error projection, with copies charged before allocation.


The reviewed correction-001 amendment is limited to the Draft 2019-09
schema-object `additionalProperties` annotation defect: evaluate actual extra
values with the existing first-error validity predicate, excluding declared and
pattern-matched names, and mark successful extra keys. It replaces the native
collector's use of the rule's member names. Independently frozen native/target
controls name eight changed rows; this is one general algorithm rule, not a
fixture-specific production test. Preserve all other legacy collector behavior.

Reached Draft 2019-09 item-annotation collection with boolean `items` and no
`additionalItems`, after required reference processing, retains its native
evaluation-time failure. Normalize it as a trusted internal
`PYTHON_SCHEMA_EVALUATION` terminal with reason
`Draft 2019-09 boolean items annotation has no length`. An `additionalItems`
member triggers the native all-index early return instead. Preserve construction
admission, iterator prefix, and first-error/predicate short-circuits.


Python source-reference metadata must bind local fragments against the nearest
recognized schema resource, preserving source code points and typed pointer
indices. An ID inside opaque annotation content is not automatically a new
schema-resource boundary. Resource-base changes and reference lookup history are
distinct: ordinary subresource descent changes the effective base without adding
a lookup-history frame. The qualified Draft 2019-09 recursive-reference profile
resolves its canonical local root and follows native nearest-first history,
stopping at the first nonanchored resource barrier. Preserve source admission,
explicit-resource-only resolution, and existing nonlocal-reference refusals.
These are internal resolver semantics; no ambient retrieval or public carrier
change is introduced.


The Python resource-source compatibility profile is qualified against plain
`jsonschema` 4.26.0 with optional URI/IRI format modules absent, as captured by
the native resource-origin evidence. Accepted surrogate and explicit-pair IDs
must remain lossless internal identities; replacing them with U+FFFD, collapsing
them into scalar-equivalent UTF-16, or rejecting them is not compatible. Optional
format-extra/plugin combinations are not qualified by this base dependency
profile. Private PythonResourceUri values own exact native u32 codepoints and apply
ASCII URI delimiter, join and dot-segment operations structurally. Immutable
source-node locators select resources and anchors. Diagnostic UTF-16 projection
is one-way and never feeds identity or lookup; no escape codec or public carrier
change is introduced. Context admits owned URI, path, history and resource-map
copies and comparisons before work/allocation, without a private text ceiling.
