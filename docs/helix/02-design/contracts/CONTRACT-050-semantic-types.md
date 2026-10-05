---
ddx:
  id: CONTRACT-050
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

# CONTRACT-050: Versioned semantic types

**Type:** core library/schema. **Version:** planned core revision, unallocated.
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
Version is an exact opaque release identifier, never a range or latest alias.
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

Core typed inspection and authoring MUST expose the `semanticTypes` references,
validate the document and supported core revision, and return copied data.
Authoring MUST use a copied document, reject missing elements and unsupported
core revisions, and validate the candidate before returning it. The final public
API signatures MUST be settled before implementation; the prototype's annotation
wrapper MUST NOT silently change to an array under the same API contract.
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

The release number, core API signatures and migration receipt schema remain to
be allocated alongside concurrent core work. The core reference field is planned,
not implemented by the interim extension.

A publisher-owned catalog and validator release policy, TableSpec catalog import,
projection bindings and independent native validator parity remain unimplemented
by this profile; none may be claimed from annotation preservation alone.
