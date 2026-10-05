---
ddx:
  id: CONTRACT-049
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-048
      kind: informed_by
---

# CONTRACT-049: Shared schema properties

**Version:** experimental core 0.8.0. Owner requested implementation on
2026-10-04. Core implementation and native ideal admission are separate claims.

## Purpose

Define titles, examples, aliases, collection size, allowed values, exact numeric
ranges, minimum length and explicit literal defaults for native TableSpec use.

## Scope and Boundaries

Metadata authoring, validation, inspection and collision-preserving migration
are in scope. Native enforcement/conversion, temporal comparison, computed
expressions and automatic alias resolution remain outside this contract.

## Normative Surface

| Member | Scope and shape | Meaning |
| --- | --- | --- |
| title | document/module/element string | Display label; never identity. |
| aliases | document/module/element distinct nonempty strings | Alternative names; no automatic matching or normalization. |
| examples | Field array of typed literals | Illustrations, not allowed values or observed profiles; checked against known shape/facets, not allowed-value/range refinements. |
| allowedValues | Scalar Field nonempty typed literal array | Unordered finite set in boolean/integer/fixed-scale-decimal/string/binary domains; equal duplicates and null reject. |
| facets.collectionSize | array/map Field {min?,max?} | Nonnegative safe integer counts of entries or keys; duplicates count; min <= max. |
| facets.length | string/binary Field {min?,max?,unit} | Unicode scalar or byte count; at least one bound; min <= max. |
| facets.range | integer/decimal Field {min?,max?,minInclusive?,maxInclusive?} | Matching typed bounds with exact mathematical order; flags require bounds; flags default to inclusive. Empty intervals reject. |
| default | Field {value,on:missing/null/missing-or-null} | Explicit literal substitution declaration. Value must satisfy known constraints. Validation never inserts it. |

Typed literals are single-member objects: boolean, integerToken, decimalToken,
string, binaryHex, floatToken, date, time, timestamp, array (literal array) or
map (string-keyed literal map), or explicit JSON null. Numeric tokens use JSON
number syntax; integers must be mathematically integral. Decimals require
precision/scale and exact representability without rounding. Float/temporal
literals are preserved illustrations only; defaults and value evaluation refuse
those domains pending their separate value contracts. Strings reject unpaired
surrogates; binary equality ignores hex case. Null requires absent-allowed.
Collections require explicit itemType for literal validation. Unknown relevant
qualifiers refuse value/default evaluation; unknown unrelated meaning survives.

Public operations: declareCoreSchemaProperties(source,identity,patch),
inspectCoreSchemaProperties(source,identity), validateCoreFieldValue(source,field,value),
resolveCoreDefault(source,field,{state:missing|present,value?}), and
verifyCoreSchemaPropertyDeclaration(receipt,current). Identity explicitly selects
scope document/module/element with exact IDs. Authoring returns copied source,
target, request and provenance; inspection preserves full source. Facet patches
merge known groups without deleting omitted/unknown siblings; edits to a group
with unknown qualifiers refuse. Receipt checks recompute the full operation.

## Precedence and Compatibility

Older versions remain unchanged. upgradeSchemaPropertiesEnvelope accepts 0.7.0,
archives every newly reserved member and length.min collision before upgrading.
rollbackSchemaPropertiesEnvelope restores the exact old source and retains
subsequent changes in its receipt. Native aliases/defaults/constraints remain
independent; no native semantics are inferred from shared declarations. Older
version-specific authoring APIs refuse 0.8.0 unless independently extended.

## Error Semantics

Invalid shapes, roles, bounds, duplicate equal values, incompatible literals and
invalid defaults reject atomically. Unknown relevant meaning refuses operations.
Forged/stale receipts reject. Common JSON resource, copy and accessor limits apply.

Value properties (examples, allowedValues, default, facets) are refused unless
the target element has kind 'field'; only title and aliases apply elsewhere.
Facet patches merge into the existing group and cannot clear an existing bound;
clearing a bound requires re-declaring the group through a future explicit
operation (current limitation). The validation/document.ts and
validation/schema-properties.ts import cycle is intentional and known.

## Examples

```json
{"title":"Quantity","aliases":["qty"],"examples":[{"integerToken":"2"}],
 "allowedValues":[{"integerToken":"1"},{"integerToken":"2"}],
 "facets":{"range":{"min":{"integerToken":"1"},"max":{"integerToken":"2"}}},
 "default":{"value":{"integerToken":"1"},"on":"missing"}}
```

## Non-Normative Notes

This is a bounded literal API, not a converter for TableSpec rows. Admission and
five-system native bindings remain separate. SQL insert and Avro reader defaults
retain their own contracts.
