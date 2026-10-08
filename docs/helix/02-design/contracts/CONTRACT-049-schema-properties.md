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

**Version:** core 0.8.0. Owner requested implementation on
2026-10-04. Core implementation and native ideal admission are separate claims.

## Purpose

Define titles, examples, aliases, collection size, allowed values, exact numeric
ranges, minimum length and explicit literal defaults for native TableSpec use.
Also define IDEAL-08's shared JavaScript numeric admission and conversion over
these existing integer/decimal literals for Truss, Ashlar and TableSpec consumers.

## Scope and Boundaries

Metadata authoring, validation, inspection, collision-preserving migration and
the bounded JavaScript numeric adapter are in scope. Database/native transport
and storage conversion, native enforcement, temporal comparison, computed
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
resolveCoreDefault(source,field,{state:missing|present,value?}). Identity explicitly
selects scope document/module/element with exact IDs. Authoring returns the copied,
validated Document directly; inspection preserves full source. Facet patches
merge known groups without deleting omitted/unknown siblings; edits to a group
with unknown qualifiers refuse. Routine authoring and selection do not issue or verify persistent receipts.

### Shared JavaScript numeric adapter (API 1.0.0)

IDEAL-08 adds a dependency-free numeric policy module using existing typed
literals. It MUST NOT add core scalar families or database codecs. All operations
accept an optional `JavascriptNumericContext` containing `document` and
`field:{module,element}`. When supplied, the context MUST validate the value
against the current 0.8.0 Field, including signedness/width, precision/scale,
inclusive/exclusive ranges and allowed values. Unknown relevant qualifiers and
invalid documents MUST refuse. Without context, conversion makes no declared
schema-domain claim. Inputs MUST remain unchanged.

| Operation | Surface and rules |
| --- | --- |
| `admitJavascriptNumber(value,scalarType,context?)` | Explicit integer/decimal family; finite number without negative zero. Integer requires safe integer. Decimal uses the shortest number spelling only when its exact decimal value equals the binary64 value. Returns integerToken/decimalToken. |
| `integerFromBigInt(value,context?)` | bigint to base-ten integerToken without rounding. |
| `integerToBigInt(literal,context?)` | integerToken to bigint; exact integral exponent/fraction spellings accepted. Negative zero refuses because bigint loses its sign. |
| `exactDecimal(token,context?)` | JSON numeric token grammar; preserves the complete spelling, including exponent, trailing zeros and negative zero. |
| `numericToNumberLossless(literal,context?)` | integerToken/decimalToken to finite number only when exact binary64 equality holds; integer additionally requires safe integer. Negative zero refuses in this admitted number profile. Lexical recovery is not promised; the input carrier remains intact. |

`JavascriptNumericLiteral` is `{integerToken:string}|{decimalToken:string}`.
Token text is bounded to 4,000,000 UTF-16 code units and exponent text to 32
characters; expanded integer coefficients inherit the existing literal resource
limit. Malformed values and value-changing conversions throw `UmfError` with
`JAVASCRIPT_NUMERIC`; resource errors use `LIMIT`. Existing core errors can also
propagate for malformed JSON carriers or integer coefficients. Extra carrier
members refuse rather than disappear; copying MUST NOT invoke accessors.

For example, `admitJavascriptNumber(0.5,'decimal')` returns
`{decimalToken:'0.5'}`. Admission of `0.1` as a decimal refuses;
`exactDecimal('0.1000')` retains that spelling, and lossless conversion of it
to number also refuses. The full exact binary64 decimal
`0.1000000000000000055511151231257827021181583404541015625` converts to `0.1`.
An integer outside safe-number range remains serializable as an integerToken
and convertible to bigint within its declared range.

Carriers MUST serialize through existing Document JSON/YAML operations;
bigint itself MUST NOT enter the JSON envelope. Float tokens, NaN/infinity and
binary32 narrowing remain governed by separate native/value policies: this API
does not define the currently unspecified core float instance semantics or
recover precision already lost before a number was passed in. Sharing the API
does not establish adoption in the three downstream projects.

Standalone token construction validates numeric representation only; decimal
precision/scale become required when a decimal Field context is supplied.
This adapter is additive: it changes neither the core 0.8.0 schema nor ordinary
JSON-envelope number copying/parsing in CONTRACT-001. Native JSON number-tree
carriers and native float policies retain their distinct contracts.

US-054 owns the consumer acceptance criteria, TD-054 the implementation approach
and STP-054 their executable traceability. No new semantic concept is proposed
for the two-priority-system admission or native-equivalence gates.

## Precedence and Compatibility

Older versions remain unchanged. upgradeSchemaPropertiesEnvelope accepts 0.7.0,
archives every newly reserved member and length.min collision before upgrading.
rollbackSchemaPropertiesEnvelope restores the exact old source and retains
subsequent changes in its receipt. Native aliases/defaults/constraints remain
independent; no native semantics are inferred from shared declarations. Older
version-specific authoring APIs refuse 0.8.0 unless independently extended.

### Current-document key tuple encoding

Owner clarification on 2026-10-06 removes prior-document support from
`encodeCoreKeyTuple`, `verifyCoreKeyTuple` and `readCoreKeyTupleBytes`. These
operations require a validated core 0.8.0 document; they neither dispatch to older
validators nor silently migrate/downgrade source. Encoding retains the exact
current context in operation version 3.0.0. Historical operation schemas remain
archived, but the runtime refuses their earlier document/result versions.

The `umf-key-tuple-v1` byte/equality profile is unchanged. Every supplied component
must also satisfy current allowed values, exact numeric ranges and both length
bounds. Missing components remain errors; a default never supplies a key value
implicitly. Unknown relevant qualifiers still refuse encoding; unrelated native
and extension content remains retained. Previous version-specific authoring and
migration operations retain their separate historical contracts.

## Error Semantics

Invalid shapes, roles, bounds, duplicate equal values, incompatible literals and
invalid defaults reject atomically. Unknown relevant meaning refuses operations.
Forged/stale migration records reject. Common JSON resource, copy and accessor limits apply.
Unknown length units remain preserved and valid but make validation incomplete,
including minimum-only and zero-maximum bounds; extension editing therefore refuses.

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
