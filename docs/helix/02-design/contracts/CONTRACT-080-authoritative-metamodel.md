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
