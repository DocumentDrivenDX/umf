---
ddx:
  id: CONTRACT-084
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-081
      kind: references
---

# CONTRACT-084: Core JSON values and sets

**Type:** semantic schema/library contract. **Version:** additive amendment to
core 0.10.0. **Status:** draft. Core meaning, literal validation and the
PostgreSQL 18 mapping through `umf.tables` (CONTRACT-081) are implemented and
tested. Other native bindings refuse these meanings explicitly; they are not
delivered. Neither meaning is an admitted ideal under CONTRACT-040: that needs
useful projections to at least two of the five priority systems, and only the
PostgreSQL mapping exists.

## Purpose

Let a Field hold one arbitrary JSON document, and let a Field hold a set: a
finite collection of distinct items whose order carries no meaning. Fireweed
space schemas need both (queue item bodies, Snorri await keys) as plain core
documents, without a private schema language or extension.

## Version decision

Both are additions to core 0.10.0, not a new core version. Before this
amendment `scalarType:"json"` and `cardinality:"set"` were unknown labels:
structurally valid, retained, and reported as uninterpreted (incomplete). No
known 0.10.0 meaning changes and no member is removed. Two consequences are
deliberate and are the compatibility cost of this choice:

- A document that used `json` or `set` as a private label now acquires the core
  meaning below.
- `cardinality:"set"` now forbids `scalarType` on the same Field and accepts
  `itemType`, as `array` and `map` already do. A previously valid document that
  combined `set` with `scalarType` becomes invalid.

The current core 0.10.0 cardinality operations (`declareCoreCardinality`
request schema `cardinality-operation-v4`, `inspectCoreCardinality` result
`cardinality-operation-v6`) admit `set` with the same `itemType` rules as
`array` and `map`; their closed enumerations gained `set` in place, for the same
reason. Operations bound to retired core versions are unchanged.

## Normative Surface

### JSON values

| Declaration | Literal | Meaning |
| --- | --- | --- |
| `scalarType: json` | `{json: <JSON value>}` | One RFC 8259 JSON value: `null`, `true`, `false`, a number, a string, an array or an object. |

The value domain:

- Strings and object member names are Unicode scalar sequences; unpaired
  surrogates are not JSON values here.
- Object member names are unique; member order carries no meaning.
- Array order is significant.
- Numbers are finite decimal values (no NaN or infinity). The domain does not
  fix a precision. A document literal is read under the document reader's
  binary64 number profile, so a number needing more precision cannot be
  authored as a literal; that limit belongs to the document carrier, not to
  the domain.
- JSON `null` inside the value is a present value. It is distinct from Field
  absence, which `nullability` governs and which a binding carries separately
  (for PostgreSQL, SQL `NULL` versus `'null'::jsonb`).

Equality and order are not admitted in this revision: native systems disagree
on number spelling, scale and precision. Consequently a `json` Field cannot be
a Key component (`KEY_EQUALITY`), cannot carry `allowedValues`, cannot be a set
item (`SET_ITEM_EQUALITY`) and takes no facets. Defaults and examples are
admitted. A `json` Field may be an array or map item.

A literal `{json: X}` validates X as above. `{string: "{}"}` is a string, never
a JSON value: no string is parsed as JSON implicitly.

### Sets

| Declaration | Literal | Meaning |
| --- | --- | --- |
| `cardinality: set`, optional `itemType` | `{array: [...]}` | Finite collection of distinct items; order carries no meaning. |

`set` follows the container rules of `array` and `map` (CONTRACT-040): the
Field carries no `scalarType`; `itemType` names the Field describing each item;
container availability stays independent of item availability; an empty set is
a present value, not absence; `facets.collectionSize` bounds the number of
items.

A referenced item Field MUST be a singleton (`cardinality:"one"`), `required`,
not record-valued, and of a family with exact core equality: boolean, integer,
decimal, string, binary, bits128 or uuid. Otherwise validation reports
`SET_ITEM_EQUALITY`. A missing `itemType` leaves item meaning unasserted, as for
arrays; literal validation then refuses (`item-required`).

Set equality is equality of the item collections. A literal is valid when its
items are pairwise distinct under the item Field's exact equality
(`Set items must be distinct`); literal order is not significant.

**Canonical order.** Where a carrier must store a sequence, the canonical
representation lists items in ascending item order: string by Unicode scalar
value sequence (code point order, no collation or normalization); integer and
decimal by mathematical value; boolean `false` before `true`; binary, bits128
and uuid by unsigned byte sequence. Readers MUST NOT infer meaning from
sequence order.

**Membership** (`x ∈ S`) is the item equality above. A binding that offers a
membership predicate MUST use that equality.

Why a cardinality and not a uniqueness facet: facets narrow a value domain and
never change equality (CONTRACT-040, CONTRACT-049). Array equality is
order-sensitive, so a facet on an array could exclude duplicates but could not
make `[a,b]` and `[b,a]` the same value.

## Bindings

| System | json | set | Status |
| --- | --- | --- | --- |
| PostgreSQL 18 (`umf.tables`, CONTRACT-081) | `jsonb` | `{kind:"array",element}` column, e.g. `text[]` | Implemented |
| Parquet | `JSON` logical type over UTF-8 `BYTE_ARRAY` | `LIST` with residual uniqueness | Design only; refuses |
| SQL Server | `json` (2025) or `nvarchar(max)` with `ISJSON` | none native | Design only; refuses |
| Avro | `string` with residual JSON meaning | `array` with residual uniqueness | Design only; refuses |
| TableSpec | none | none | Refuses |

PostgreSQL `jsonb` residuals, recorded rather than hidden:

- jsonb does not keep the lexical number spelling (`1e2` reads back as `100`),
  whitespace or member order. The domain already excludes member order;
  spelling is not part of the domain.
- jsonb cannot store U+0000 in strings or member names. UMF refuses such a
  literal at compilation; writers MUST refuse such values rather than alter
  them.

PostgreSQL array residuals for sets:

- A native array allows duplicates and keeps order. Generated DDL enforces a
  one-dimensional, one-based array and, for required items, no NULL elements.
  It does not enforce distinctness or canonical order: writers (UMF, Weft and
  hosts such as Fireweed) MUST write the canonical form. A reader that finds a
  non-canonical value has found a writer fault and MUST NOT treat order as
  meaning.
- String items use `COLLATE "C"`, whose byte order for UTF-8 equals code point
  order, so native array ordering and equality agree with the canonical order
  and exact string equality.
- Membership queries use the array containment operators (`@>`, `&&`), which a
  GIN index serves.

Other bindings: the core projections and classifiers (PostgreSQL, SQL Server,
Avro, Parquet, TableSpec, Spark/Arrow, Delta, Iceberg) compare the authored
family against their native maps and report a mismatch or refusal for `json`
and `set`; the access SDK reports a `set` Field as uninterpreted. None of them
silently treats the new meanings as another shape.

## Error Semantics

| Code | When |
| --- | --- |
| `SET_ITEM_EQUALITY` | A set's item Field is not a required singleton of an exact-equality family. |
| `CORE_SCHEMA_PROPERTIES` "Set items must be distinct" | A set literal repeats an item. |
| `CORE_SCHEMA_PROPERTIES` "Expected an exact JSON value" | A json literal has duplicate member names or a non-finite number. |
| `CORE_SCHEMA_PROPERTIES` "No exact equality for this literal/domain" | `allowedValues` on a json Field, or a set item without equality. |
| `KEY_EQUALITY` | A json Field used as a Key component. |

## Example

```json
{"id": "body", "kind": "field", "scalarType": "json", "cardinality": "one",
 "nullability": "required", "default": {"value": {"json": {}}, "on": "missing"},
 "extensions": {}}
{"id": "await_key", "kind": "field", "scalarType": "string", "cardinality": "one",
 "nullability": "required", "extensions": {}}
{"id": "await_keys", "kind": "field", "cardinality": "set",
 "itemType": {"module": "space", "element": "await_key"},
 "nullability": "required", "extensions": {}}
```

`{"array": [{"string": "b"}, {"string": "a"}]}` is a valid `await_keys` value
whose canonical form is `["a","b"]`; `{"array": [{"string": "a"}, {"string":
"a"}]}` is invalid. The complete space document, with its `umf.tables`
declaration, is `crates/umf-codegen/tests/fixtures/fireweed-space.json`.

## Evidence

- `crates/umf-codegen/tests/fireweed_space.rs`: literal validation, set item
  rules and the PostgreSQL 18 mapping through the Rust API.
- `tests/binding/table-json-sets.test.ts`: the same mapping through the
  TypeScript API.
- The generated DDL was applied to PostgreSQL 18.7: the array check rejects
  NULL elements, two-dimensional arrays and non-1 lower bounds, and the GIN and
  partial indexes serve `@>` and the claim query. This was a manual check, not
  a CI test.
- `crates/umf-core/tests/r8_scalar_types_for_version.rs`: the generated
  vocabulary includes `json`.
- The metamodel (`spec/metamodel/umf.yaml`) is the authority for the
  vocabulary, the structural rules and `SET_ITEM_EQUALITY`;
  `bun run check:metamodel` checks the generated outputs.
