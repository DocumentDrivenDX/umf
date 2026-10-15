---
ddx:
  id: CONTRACT-070
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# CONTRACT-070: Typed access extension

**Type:** extension schema. **Version:** proposed `umf.access` 0.1.0 over core 0.8.0.

## Purpose

Author the instance-view and native-column choices that typed access needs and
that neither core nor CONTRACT-042 physical bindings express: which Python
presence and null carriers each view admits, which fields are mutable or
engine-generated, whether a timestamp is an instant or a local date-time, and
which native column type a bound Field uses on each target, and which search
indexes exist with what semantics. These are reviewable
UMF document content, never compile-request options.

## Scope and Boundaries

The extension attaches only to a module as `{"umf.access": Access}` with exact
vocabulary registration `umf.access` 0.1.0. It references local Records, Fields
and Keys of the same core 0.8.0 document and, for native columns, element bindings
of a supplied CONTRACT-042 `umf.binding` document. External document references
refuse. The extension introduces no core scalar, changes no core availability or
default meaning, and never selects a physical store, table or column by itself.

CONTRACT-067 consumes this extension; CONTRACT-068 defines the Python carriers it
selects. Weft backends own native lowering; this extension only records authored
column facts that those backends and the generator must agree with.

## Normative Surface

All IDs compare exactly. Unknown members are retained and reported as unchecked;
an unknown member on a selected Record blocks generation (CONTRACT-067
`UNKNOWN_RELEVANT`).

### Access

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `views` | RecordView[] | yes | At most one entry per local Record; empty is allowed. |
| `columns` | ColumnSet[] | yes | Native column facts per target binding; empty is allowed. |
| `search` | SearchIndex[] | yes | Search index declarations (CONTRACT-074); empty is allowed. |
| `searchBindings` | SearchBinding[] | yes | Per-target native index bindings (CONTRACT-074); empty is allowed. |

### RecordView

`{record:RecordRef, fields:FieldView[]}`. `fields` MUST cover every owned member
Field of the Record and every reached item/value Field exactly once, in Record
member order followed by nesting order. Missing or duplicate entries refuse.

FieldView is `{field:FieldRef, row:Presence, create:Presence, mutable:boolean,
generated:boolean, temporal?:"instant"|"local"}`.

- `Presence` is `{missing:boolean, null:boolean}`. `missing:true` admits an absent
  value (Python `MISSING`); `null:true` admits an explicit `None`. Both false means
  a value is required in that view.
- `row` describes stored or result values. `create` describes input to creation.
  Patch inputs always admit `missing` as "no change"; Patch admits `None` exactly
  when `create.null` is true.
- `generated:true` means the engine assigns the value. Such fields are excluded
  from Create and Patch, require `create:{missing:true,null:false}` and MUST be
  backed by a native generation declaration in every ColumnSet that binds them.
- `mutable:false` excludes the field from Patch. Key component Fields MUST be
  `mutable:false` in 0.1.0.
- `temporal` is required exactly when the Field's core type is `timestamp`, and
  forbidden otherwise. `instant` selects an absolute UTC instant; `local` selects
  a wall-clock date-time with no zone. No default is inferred.
- Item/value Fields (array items, map values) MUST set `row.missing` and
  `create.missing` false, `mutable:false` and `generated:false`. Arrays cannot
  contain absent positions; an absent map key is not a present null value.

### Conflict rules

A RecordView that contradicts core or binding meaning is a declaration error.
Each FieldView is checked against the allow table below. It is normative and
complete for 0.1.0: a combination of core facts that has no row, or a `row` or
`create` presence the matching row does not list, refuses with `ACCESS_CONFLICT`.

The table is keyed by five core facts:

- *Key*: whether the Field is a component of any Key of the Record.
- *Availability*: the core 0.8 Element `nullability` member, `required` or
  `absent-allowed` (CONTRACT-040). `unspecified` has no row and always refuses,
  because it cannot establish an instance view.
- *Null*: whether core admits an explicit null value for the Field
  (`validateCoreFieldValue`); under CONTRACT-049 only `absent-allowed` Fields can.
- *Default*: the authored default's `on` trigger (`missing`, `null`,
  `missing-or-null`) or `none` (CONTRACT-049).
- *Generated*: the FieldView's `generated` flag.

Presence is written `missing/null`, so `F/T` means `{missing:false,
null:true}`. The `row` presence depends on whether the Field is bound by a
relational ColumnSet:

- A Field bound by any relational ColumnSet (`postgresql`, `lakebase`,
  `spark-delta`, `unity-catalog`) can never have `row.missing:true`: relational
  columns cannot carry absence distinct from null. This holds even if the same
  Record is also read through Truss or Ashlar, so an engine that returns absence
  for such a Field refuses in its adapter (CONTRACT-069).
- A Field bound by no ColumnSet uses the engine-only column. This is the case for
  every Field of an engine-only Record, one read only through Truss or Ashlar.
  The engine can hold either absence or null for an `absent-allowed` Field, so the
  view admits both.

| Key | Availability | Null | Default | Generated | `row` (ColumnSet-bound) | `row` (engine-only) | `create` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| yes | `required` | no | any | false | `F/F` | `F/F` | `F/F` |
| yes | `required` | no | any | true | `F/F` | `F/F` | `T/F` |
| no | `required` | no | `none` or `null` | false | `F/F` | `F/F` | `F/F` |
| no | `required` | no | `missing` or `missing-or-null` | false | `F/F` | `F/F` | `F/F` or `T/F`; with `T/F` the engine applies the default and the generator never executes it |
| no | `required` | no | any | true | `F/F` | `F/F` | `T/F` |
| no | `absent-allowed` | yes | any | false | `F/T`; or `F/F` when every binding ColumnSet declares the column NOT NULL | `T/T` | `F/F`, `T/F`, `F/T` or `T/T`. `T` for missing omits the value; with default `missing` or `missing-or-null` the engine applies it. `T` for null passes `None`; with default `null` or `missing-or-null` the engine substitutes it |
| no | `absent-allowed` | no | any | false | `F/F`, with every binding ColumnSet declaring the column NOT NULL | `T/F` | `F/F` or `T/F` |
| no | `absent-allowed` | any | any | true | `F/F`, or `F/T` when Null is yes; matching each ColumnSet's `notNull` | `F/F` | `T/F` |

Key component rows admit only `required` Fields with no null: key components are
always present and non-null (CONTRACT-040), and keys are caller-supplied in 0.1.0
unless generated. A Key default is never applied through the SDK.

These rules apply in addition to the table; each violation refuses with
`ACCESS_CONFLICT`:

| Core fact | View or binding choice | Outcome |
| --- | --- | --- |
| Field is a Key component whose core type is `date` or `timestamp` | any | Refuse in 0.1.0: CONTRACT-040 leaves temporal key equality unspecified and requires it to block. |
| `temporal` set | ColumnSet native type is not a timestamp type of the matching kind | Refuse. |
| Field is a vector index's embedding Field (CONTRACT-074) | Core type is not a fixed-length array of 32-bit floats whose length equals the index `dimensions` | Refuse. |
| Field is a vector index's embedding Field | ColumnSet native type is not a vector type of the same dimension (`vector(n)` for pgvector, `ARRAY<FLOAT>` with the length check recorded as an obligation for Delta) | Refuse. |

A vector embedding Field is usually `absent-allowed`, so `row.null:true` is
allowed by the table; rows without embeddings are never returned by search.

### ColumnSet

`{binding:{sourceId,module}, target:TargetRef, columns:NativeColumn[]}`.
`binding` names the supplied CONTRACT-042 binding document and module. `target`
is `{platform:"postgresql"|"lakebase"|"spark-delta"|"unity-catalog",
majorVersion:string}`. One ColumnSet per binding/target pair.

NativeColumn is `{field:FieldRef, type:string, notNull:boolean,
generation:null|"identity"|"stored-expression"|"default"}`.

- `field` MUST be bound to a column by the referenced CONTRACT-042 binding.
- `type` is the exact native type spelling the column uses, including modifiers
  (`numeric(12,2)`, `timestamptz`, `TIMESTAMP_NTZ`, `DECIMAL(38,10)`). The
  generator never chooses it from core facets; it checks compatibility with the
  core type and facets and refuses on any widening, narrowing or precision change.
- Compatibility needs the core facets that fix the value domain. An integer Field
  MUST declare an integer width facet, and a decimal Field MUST declare precision
  and scale facets; otherwise its NativeColumn entry refuses with `ACCESS_NATIVE`,
  because no native type can be shown equal to an unbounded domain.
- `notNull` MUST equal the row view: `notNull` true exactly when `row.null` false.
- `generation` records how the engine produces the value. `generated:true` in the
  view requires a non-null `generation`; `default` alone does not make a field
  generated.

### Search indexes

SearchIndex and SearchBinding shapes, and their validation rules, are defined in
CONTRACT-074. They are part of this extension so that search semantics are
authored and reviewed with the rest of the document.

### Notes for consumers

- Timestamp and date Fields cannot be Key components (CONTRACT-040 blocks temporal
  Key equality). A table keyed on a time bucket authors a separate, non-temporal
  key Field holding the bucket (for example an integer bucket number or canonical
  text such as `2026-10-15T14`), alongside the timestamp Field itself.
- ColumnSets are the authored physical facts that typed access relies on. A
  consumer that emits its own DDL should emit it from the same UMF documents and
  bindings, and check in CI that its DDL matches the ColumnSets; `verify()`
  (CONTRACT-072) also detects drift when the application starts.

## Precedence and Compatibility

Core contracts own value meaning; CONTRACT-042 owns physical placement; this
extension owns only view carriers and native column facts. A later `umf.access`
version may add views (for example update-specific null semantics) but MUST NOT
reinterpret 0.1.0 entries. Changing any entry changes generated source and requires
regeneration and the compatibility classification in CONTRACT-067.

## Error Semantics

| Code | Condition |
| --- | --- |
| `ACCESS_SHAPE` | Malformed extension member or unknown vocabulary version |
| `ACCESS_REFERENCE` | Missing, duplicate or external Record/Field/binding reference |
| `ACCESS_COVERAGE` | A RecordView omits or duplicates a reached Field |
| `ACCESS_CONFLICT` | A choice contradicts the conflict table |
| `ACCESS_NATIVE` | Native type incompatible with core type, facets or temporal kind |

All errors are declaration errors reported with JSON Pointers; none is repaired.

## Examples

An `Order` Record with Key `orderId`, required decimal `amount` (precision 12,
scale 2), absent-allowed string `memo`, required timestamp `placedAt` with default
`on:"missing"`, and engine-assigned 64-bit integer `revision`:

```json
{"umf.access": {
  "views": [{"record": {"module": "commerce", "element": "Order"}, "fields": [
    {"field": {"module": "commerce", "element": "orderId"}, "row": {"missing": false, "null": false}, "create": {"missing": false, "null": false}, "mutable": false, "generated": false},
    {"field": {"module": "commerce", "element": "amount"},  "row": {"missing": false, "null": false}, "create": {"missing": false, "null": false}, "mutable": true,  "generated": false},
    {"field": {"module": "commerce", "element": "memo"},    "row": {"missing": false, "null": true},  "create": {"missing": true,  "null": true},  "mutable": true,  "generated": false},
    {"field": {"module": "commerce", "element": "placedAt"},"row": {"missing": false, "null": false}, "create": {"missing": true,  "null": false}, "mutable": false, "generated": false, "temporal": "instant"},
    {"field": {"module": "commerce", "element": "revision"},"row": {"missing": false, "null": false}, "create": {"missing": true,  "null": false}, "mutable": false, "generated": true}
  ]}],
  "columns": [{"binding": {"sourceId": "orders-binding", "module": "commerce"},
    "target": {"platform": "postgresql", "majorVersion": "18"},
    "columns": [
      {"field": {"module": "commerce", "element": "orderId"},  "type": "text",          "notNull": true,  "generation": null},
      {"field": {"module": "commerce", "element": "amount"},   "type": "numeric(12,2)", "notNull": true,  "generation": null},
      {"field": {"module": "commerce", "element": "memo"},     "type": "text",          "notNull": false, "generation": null},
      {"field": {"module": "commerce", "element": "placedAt"}, "type": "timestamptz",   "notNull": true,  "generation": "default"},
      {"field": {"module": "commerce", "element": "revision"}, "type": "bigint",        "notNull": true,  "generation": "identity"}
    ]}]
}}
```

Marking `orderId` as `row.null:true`, `memo` as `row.missing:true` (it is bound
by a ColumnSet), or `placedAt` without `temporal`, refuses with `ACCESS_CONFLICT`.
Removing the width facet from `revision` refuses its NativeColumn entry with
`ACCESS_NATIVE`.

## Validation Checklist

- [ ] Extension schema and conflict-table tests implement this draft.
- [ ] Every allow-table row has positive fixtures for each listed presence and negative fixtures for the unlisted ones, for both ColumnSet-bound and engine-only Records.
- [ ] Temporal Key components and integer or decimal Fields without width or precision/scale facets refuse.
- [ ] Native type compatibility rules are qualified per target platform version.
