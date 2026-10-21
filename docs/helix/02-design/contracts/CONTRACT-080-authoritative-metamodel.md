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
    - id: CONTRACT-077
      kind: references
    - id: CONTRACT-078
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
`Validation {valid,complete,diagnostics}`. Paths/messages preserve UTF-16. Public
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
including Python's declared Draft 7 validator surface, strict unknown-keyword
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

Ordinary limits remain 4,000,000 UTF-16 text units, depth 128 and 100,000 traversed
values; the explicit synchronous catalog scope retains 1,000,000 values. Preserve
the existing 5,000,000 constraint-instruction ceiling and charge copies,
enumeration, sorting, exact arithmetic and nested interpretation. The invocation
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
