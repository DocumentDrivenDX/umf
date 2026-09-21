---
ddx:
  id: CONTRACT-002
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# CONTRACT-002: JSON Schema native extension

**Version:** 0.1.0. **Type:** schema/library. **Native dialect:** Draft 2020-12.

## Purpose

Implement JSON Schema import, typed access/edit and export without flattening
native keywords, numeric domains, annotations or resource references (FR-1/5/6/12/37).
This is the first native extension, not evidence for promoting native types to core.

## Scope and Boundaries

`umf.json-schema` 0.1.0 attaches to an element in the CONTRACT-001 envelope.
Its complete structural definition is
[the extension schema](../../../../spec/extensions/json-schema/schema.json).
The representation can retain all JSON values, including exact decimal tokens;
semantic validation and support evidence remain explicitly bounded below.

Only the Draft 2020-12 dialect is interpreted. Other or mixed `$schema` dialects,
unknown keywords/vocabularies, and numerics beyond the core runtime profile are
retained, reported as incomplete understanding, and cannot be silently edited.
No network lookup or referenced-schema flattening occurs. Pure native export
returns the root schema; bundled resources remain separately exportable and must
accompany the source if the root depends on them.

## Normative Surface

Payload: `{dialect,baseUri,root,resources}`. `dialect` is the Draft 2020-12 URI.
`baseUri` is an absolute retrieval URI without a fragment. `resources` maps
absolute retrieval URIs to native JSON trees. No implicit override or fetch occurs.
`root` must be a JSON object or boolean tree. Resources must also be schemas.

A native JSON tree is a tagged union: `kind:null`; `kind:boolean|string|number`
with `value`; `kind:array` with `items`; or `kind:object` with `members`.
Number values are strings matching JSON number syntax and emitted as number
lexemes, not quoted strings. Other scalar values have their native type. Every
container/scalar is tagged, so a native object that resembles an encoding node
cannot collide with the representation. Unknown envelope/tree fields are retained
by core but make native export unsafe because native JSON has no place for them.
Unknown native keywords belong inside object members and survive native export.

`importJsonSchema(text, {id,baseUri,resources?})` creates one `schema` element in a
`schema` module; document `id` is supplied by caller. It validates JSON syntax,
resource URI shape, and known native schema structure while allowing explicit
incomplete-preservation outcomes. Duplicate object keys fail before data loss.
`exportJsonSchema(document)` returns root schema JSON; `exportJsonSchemaResources`
returns the exact URI-to-JSON resource map. Both reject malformed structures and
unknown representation fields rather than discard them. Uninterpreted native
keywords/numerics may be exported unchanged with diagnostics available separately.

`jsonSchemaRegistry()` installs the package and trusted semantic inspector.
`inspectJsonSchema(document)` returns normal validation diagnostics, including
incomplete interpretation. Diagnostics report unknown keywords/dialects/vocabularies,
unsupported validation numerics and unresolved/invalid compilation as applicable.

`getJsonSchemaNode(document,pointer)` reads a copied native tree node using a
strict RFC 6901 pointer (empty string selects root). `editJsonSchemaNode(document,
pointer,replacementJSON)` replaces an existing node atomically, checks the whole
result with the installed registry, and leaves source unchanged. Incomplete
interpretation anywhere blocks this first edit API under CONTRACT-001. No implicit
creation, append, URI rebasing or reference rewriting is allowed.

`walkJsonSchema(document)` enumerates schema positions using Draft 2020-12
applicator rules, including definitions, properties, arrays and conditionals.
It MUST NOT treat annotations, defaults, enum/const data or unknown keywords as
subschemas. Native references and identifiers remain inside the native tree.
Core references MUST NOT substitute for `$ref`/`$dynamicRef` scope semantics.

## Precedence and Compatibility

Dialect and native resource identifiers govern native interpretation. Retrieval
URIs are retained separately from `$id`; known references resolve only through
explicit packaged resources and local schemas. Duplicate resource identities or
unresolvable references prevent complete interpreted validation. Compilation
limitations produce warnings so preserved native meaning can still be exported. JSON object key ordering,
whitespace and string escape spelling are not guaranteed; number lexemes are
retained. The generic numeric tree is extension-owned until an independent
extension demonstrates shared semantics and a migration plan.

For understood runtime-compatible inputs, Ajv 8.20.0 performs Draft 2020-12
metaschema checking and compilation, configured with format assertions disabled.
`format` therefore remains annotation-only. Content annotations are not decoded
or enforced. Unknown native keywords and required vocabularies are not ignored
as evidence of semantic support. The compiler is an installed validator, not a
proof of universal schema equivalence; upstream expected vectors and preservation
checks independently constrain the native round-trip claim.

## Error Semantics

Invalid JSON, duplicate keys, malformed trees, resource URI errors, invalid known
schema structure, and unsafe edits fail explicitly with `UmfError` or validation
diagnostics. Missing edit paths return `JSON_SCHEMA_POINTER`. Unknown native
semantics produce warnings/incomplete status; unknown *representation* fields
block export to prevent loss. Failed compilation produces an incomplete `JSON_SCHEMA_COMPILE` warning. Known
metaschema violations remain errors, including when unknown keywords coexist.
Input/tree bounds inherit CONTRACT-001; native number tokens avoid its numeric
value limit without bypassing structural/text limits.

## Examples

An object schema with a property whose minimum is `9007199254740993` imports
with that exact token as a number node. It can round-trip through YAML and native
JSON unchanged. Its installed JavaScript numeric validation is incomplete, so it
cannot be treated as a fully validated safe-edit target.

The upstream suite and authored fixtures live in `fixtures/json-schema/`, with
source revision and license recorded. Evidence must name tested dialect, suite
files, instance-vector results, and any validator limitations; preservation-only
cases cannot be counted as complete semantic validation.

## Validation Checklist

- [x] Native tree, dialect, resources, metadata access and edit boundaries defined.
- [x] Upstream round trips and expected vectors executed and failures recorded.
- [x] Browser native-adapter path executed.
- [ ] Further native dialects and exact-number semantic validator remain later work.

## Bundle and Evidence Profile

`exportJsonSchemaBundle(document)` is the complete interchange result: root schema,
resource map, a retained source UMF document, and diagnostics. The source is required
to preserve retrieval context and unrelated UMF semantics that native JSON Schema
cannot express. Root-only export is a convenience and does not prove preservation
of the whole UMF document.

The inspector conservatively reports observed Ajv limits for dynamic references,
unevaluated keywords and prototype property names. Unknown native dialects skip
interpretation; unknown keywords still permit known metaschema checks but block
complete interpretation. Unsafe numeric values retain exact tokens without claiming
JavaScript semantic validation. No exact-number browser validator is implemented.

On 2026-09-20, all 384 cases / 1,301 vectors in 46 required root files at upstream
revision `ab079cc2bace029fdbb483be28a6ade526bcfbc2` have at least one independent
native expected-vector oracle passing before and after round trip. Python's exact
numeric/vocabulary profile and individual oracle failures are recorded under
`fixtures/json-schema/`; optional and proposal files were not executed. Chromium
148.0.7778.0 executed the native round-trip, edit and exact-number retention paths.
This evidence is bounded to that corpus, not universal semantic equivalence.
