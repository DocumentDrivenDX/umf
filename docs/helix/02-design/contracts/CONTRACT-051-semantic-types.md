---
ddx:
  id: CONTRACT-051
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

# CONTRACT-051: Versioned semantic types

**Type:** core library/schema. **Version:** experimental core 0.9.0, layered on core 0.8.0.
The existing `umf.semantic-types` 0.1.0 implementation is an interim prototype.

## Purpose

Under FR-4/5/17/34, domain types such as `email`, `phone_number` and industry
identifiers belong to independently versioned semantic vocabularies. Core elements
MUST provide the generic ability to reference these meanings without defining them
as scalar families. The owner clarified this core/vocabulary boundary on 2026-10-04.

## Scope and Boundaries

This profile governs element annotations, exact vocabulary lookup and explicitly
supplied value validators. Native TableSpec declarations and validation recipes
remain native and MUST NOT be equated with a same-named semantic term. Automatic
inference, normalization, remote loading, code evaluation and native projection
are outside this profile. DDD context and physical types remain independent.

## Normative Surface

An element MAY contain `semanticTypes`, a nonempty array of references.
Each reference MUST have nonempty strings `vocabulary`, `version`, `term`.
An absent field makes no semantic type declaration. An empty array MUST reject;
clearing a declaration removes the optional field.
Version is an exact opaque release identifier; strings are matched literally,
without range evaluation, latest aliases or fallback.
Unknown properties MUST survive serialization and copied access; interpretation
of a reference with unknown properties MUST report incomplete.
Multiple references are conjunctive declarations, without ordering precedence.
Referenced term catalogs are resolved separately and need not be extension
packages or declared in the document's extension `vocabularies` map. The ability
to point to them MUST NOT require `umf.semantic-types` registration.
`semanticTypes` is an element field; its presence at module/document scope MUST
remain uninterpreted rather than establish a semantic declaration.

`SemanticTypeRegistry.register(reference, definition, validator?)` MUST copy and
retain a JSON object definition. Identical exact triples MUST reject duplicate
registration; distinct vocabularies and versions MUST coexist. Definition content
is vocabulary-owned metadata; it MUST NOT authorize validator loading or execution.
`lookup(reference)` MUST return a copied definition or undefined.

`inspectCoreSemanticTypes(document, {module,element})` MUST return an
`inspect-core-semantic-types` 1.0.0 receipt with copied `source`, exact `identity`,
JSON Pointer `path`, `meaning` and `diagnostics`. Meaning is `missing`, `legacy`
(with opaque `value` on older cores), or `declared` (with copied `types`).
`getCoreSemanticTypes(document, identity)` MUST require core 0.9.0 and return
copied references or undefined. `declareCoreSemanticTypes(document, identity,
typesOrNull)` MUST require 0.9.0, use null to remove the optional field, and return
`declare-core-semantic-types` 1.0.0 with copied `source`, validated `target`,
`identity`, `request:{types:typesOrNull}`, `diagnostics` and
`provenance:{origin:"authored",path,basis:"explicit-author-declaration"}`.
Identity MUST have only nonempty module/element strings. Unknown qualifiers in
an existing array MUST block replacement/removal unless the array is unchanged.
`verifyCoreSemanticTypeDeclaration(receipt,current)` MUST recompute the declaration
and require exact JSON equality with both receipt and current target, ignoring
object key order; any subsequent document edit makes the declaration stale.

`validateCoreSemanticTypeValue(document,identity,value,registry)` MUST evaluate
all declared references in array order and return copied `source`, `identity`,
`checks`, aggregate `status`, `complete` and `issues`. Each check follows
`validateSemanticTypeValue`. Invalid dominates unknown, which dominates valid;
completeness requires every check complete. Absence returns unknown/incomplete.
This aggregate MUST NOT imply validation of other core constraints or native
payloads. Document-level interpretation remains incomplete without resolving
external meanings; extension registry registration is independent of term lookup.

`validateSemanticTypeValue(reference,value,registry)` MUST return the copied
reference, `status` (`valid`, `invalid`, `unknown`), `complete`, and `issues`.
An explicitly registered validator MUST receive isolated JSON copies of value and
definition. It MUST return `status`, boolean `complete`, and string-array `issues`.
Unknown term, missing validator, unknown reference properties, malformed validator
result or thrown validator MUST return `unknown`, `complete:false`, with a reason.
A validator result `unknown` MUST NOT claim completeness. Validity is scoped solely
to that exact term's supplied validator; it does not certify field nullability,
scalar compatibility, normalization, deliverability, identifier ownership or native
system enforcement. `null` MUST be passed unchanged to the supplied validator.


`upgradeSemanticTypesEnvelope(document, {migrateExtension:false})` MUST require
valid 0.8.0 and return `upgrade-semantic-types-envelope` 1.0.0 with copied
`source`, 0.9.0 `target`, exact `request`, and ordered `residuals` of
`{path,value,reason:"Legacy semanticTypes content retained without reinterpretation"}`.
Default policy is false. It MUST archive every old element `semanticTypes`
field, including well-shaped lookalikes, in `residuals` and move its exact value
to the element's opaque `legacySemanticTypes` field in the target, so discarding
the receipt does not lose it. An already-present `legacySemanticTypes` field MUST
refuse the upgrade. Root/module fields remain opaque.
With `migrateExtension:true`, selected element `umf.semantic-types` payloads MUST
have profile 0.1.0 and valid nonempty `types`. Unknown annotation-level keys,
opaque-field collisions or unsupported profiles MUST refuse conversion. Reference
qualifiers MUST remain copied and incomplete; the original extension remains in
both source and target. Validation MUST warn `SEMANTIC_TYPE_COMPETING_MEANING`
when an element's core `semanticTypes` differ from its retained extension
payload `types`; core is authoritative and neither copy is modified. No conversion is inferred from native `domain_type`.

`verifySemanticTypesTransition(receipt)` MUST schema-check and recompute either
upgrade or rollback. `rollbackSemanticTypesEnvelope(upgrade,current)` MUST verify
the upgrade, validate current core 0.9.0 and require the same document ID, then
return `rollback-semantic-types-envelope` 1.0.0 with `source:current`,
`target:upgrade.source`, verified `receipt` and
`reason:"Original envelope restored; subsequent content retained in source"`.
Later edits MUST remain fully archived in `source`, without applying them to the
restored original. Receipts certify internal consistency, not source authenticity.

Published schemas: `semantic-types-document.schema.json`,
`semantic-type-reference.schema.json`, `semantic-types-operation.schema.json`,
`semantic-types-transition.schema.json`, `semantic-types-selection.schema.json`
under `spec/core/`. Existing prototype APIs retain their extension wrapper shape.

## Precedence and Compatibility

No implicit fallback between versions or namespaces is permitted. Definitions
and validator behavior belong to their publisher. Changing either requires a new
release identifier. A new core revision MUST introduce this field; existing core
schemas and previously opaque uses MUST NOT be retroactively reinterpreted.
Migration MUST archive collisions and the exact original source, preserve native
and unknown extension content, and provide verified rollback. Migrating the interim
extension MUST be explicit: retain its original payload, copy only representable
references, and report unknown annotation-level qualifiers or conflicting core
content. No automatic precedence or merge is permitted. Unknown catalogs remain
usable as references without becoming interpreted constraints.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Empty/malformed reference or definition | `SEMANTIC_TYPE_STRUCTURE` | Supply JSON-compatible data matching the schema |
| Duplicate exact triple | `SEMANTIC_TYPE_DUPLICATE` | Use a fresh registry or distinct version |
| Non-JSON data, unsafe numbers, accessors or structural limits | Existing core JSON error | Supply portable JSON data |
| Missing element/unsupported core revision | Explicit authoring refusal | Supply an existing element and supported revision |
| Invalid document | `SEMANTIC_TYPE_DOCUMENT` | Repair structure/references |
| Missing term/validator or uninterpreted qualifier | unknown/incomplete | Supply explicit matching implementation |
| Validator failure | unknown/incomplete | Repair implementation; no validity claim |

## Examples

```json
{"id":"contact_email","scalarType":"string","semanticTypes":[
  {"vocabulary":"example.contact","version":"1.0.0","term":"email"},
  {"vocabulary":"example.healthcare","version":"2026-01","term":"provider_id"}
],"extensions":{}}
```

`example.contact` is illustrative. No universal email or telephone validation
algorithm is implied. TableSpec's detection regex, expectation recipes, severity,
sample generator and conversion metadata MUST retain their separate meanings.

## Validation Checklist

Tests MUST exercise namespace/version collisions, missing validators, explicit
invalid results, null, thrown/malformed results, unknown qualifiers, copy isolation,
absence versus empty arrays, unsupported core revisions, and JSON/YAML recovery
with native/unknown content. Migration tests MUST include old opaque field
collisions, extension-to-core conflicts, unknown annotation qualifiers, forged
receipts and edited rollback. Prototype evidence MUST NOT count as core acceptance.
The public library MUST execute in a real browser without host-specific APIs.

## Unknowns

Core 0.9.0 follows the concurrent 0.8.0 schema-properties revision. Existing
version-specific authoring APIs retain their supported envelope limits; read/write,
validation, element selection and semantic-type operations support 0.9.0.

Known limit: the 0.8.0 schema-properties APIs (`inspectCoreSchemaProperties`,
`declareCoreSchemaProperties`, `verifyCoreSchemaPropertyDeclaration`,
`validateCoreFieldValue`, `resolveCoreDefault` and the schema-properties
upgrade/rollback functions) require an exact 0.8.0 envelope and reject 0.9.0
documents. After upgrading, schema-property authoring is unavailable until a
0.9.0-aware revision exists; roll back or edit schema properties before upgrading.
A validator exception makes the check `unknown` and appends the exception message
to `issues`.

A publisher-owned catalog and validator release policy, TableSpec catalog import,
projection bindings and independent native validator parity remain unimplemented
by this profile; none may be claimed from annotation preservation alone.

## Retained Prototype Compatibility

The interim `umf.semantic-types` 0.1.0 extension attaches only to elements and
contains `{types:[reference,...]}`. It MUST be declared in the extension
`vocabularies` map. Unknown wrapper/reference properties remain preserved and
incomplete. `getSemanticTypes(document,module,element)` returns the copied wrapper;
`setSemanticTypes(document,module,element,annotation)` returns a copied validated
document, declaring that exact profile when absent and refusing a conflicting
profile version. These APIs MUST keep their wrapper signatures and MUST NOT be
used as the core pointing API. `semanticTypesRegistry()` registers the prototype
schema and incomplete semantic inspection. It is independent of
`SemanticTypeRegistry` and is never required for core 0.9.0 references.
