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
tested. Cross-system projections below retain native enforcement and encoding
limits explicitly. A reported mapping does not imply native equality, value
conversion or promotion under CONTRACT-040.

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
| Parquet | `JSON` logical type over UTF-8 `BYTE_ARRAY` | `LIST` with residual uniqueness | Explicit mapping with retained residuals |
| SQL Server 2022 | Explicit `nvarchar(max)` JSON text with `ISJSON(...,VALUE)` | Checked JSON array, with uniqueness and item residuals | Explicit mapping with retained residuals |
| Avro | `string` with residual JSON meaning | `array` with residual uniqueness | Explicit mapping with retained residuals |
| TableSpec | Explicit JSON text in `TEXT` | Explicit JSON array text in `TEXT`, with shape/item/uniqueness residuals | Explicit mapping with retained residuals |

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

## Explicit JSON text and set projections

Avro, SQL Server and TableSpec Field requests accept optional
`jsonEncoding:boolean`. It defaults to false. A JSON Field mapped to a native
string requires `jsonEncoding:true`; a plain string carrier never establishes
JSON meaning implicitly. SQL Server uses `nvarchar(max)` and checks
`ISJSON(column,VALUE)=1`, admitting JSON null and scalar JSON documents.
TableSpec collection requests use `TEXT`, `jsonEncoding:true` and mapping
`encoding:"json-text"`. Avro set requests select a native array; Parquet selects
LIST. Native-only import observes the native string/list representation.

These encodings report writer obligations for valid JSON, unique object keys,
Unicode scalar strings, finite numbers and native text capacity. Set list/text
encodings additionally report uniqueness and canonical-order obligations. Strict
mode blocks residual meaning; report mode retains the complete source, request
and residuals for verified recovery. Native JSON null remains distinct from SQL
NULL or an absent Field.

## RFC 6902 JSON Patch

`applyJsonPatch(document,patch)` in TypeScript and
`apply_json_patch(document,patch)` in Python apply the same Rust value operation.
The engine request is `{document:Json,patch:Operation[]}`. Supported operations are
`{op:"add"|"replace"|"test",path:string,value:Json}`,
`{op:"remove",path:string}` and `{op:"move"|"copy",from:string,path:string}`.
Operation-specific unknown members are ignored as RFC 6902 requires.

Operations execute in order on a private admitted copy. A failure returns an
error and no partial result; the input remains unchanged. Successful results are
`{present:true,value:Json}` or `{present:false}` after removing the root.
`test` uses structural JSON equality: object key order is irrelevant, array order
is significant, JSON numbers compare numerically, and booleans remain distinct.

Paths follow RFC 6901: empty string selects the root, `/` selects an empty member
name, and `~0`/`~1` decode tilde/slash once. Array indices have no leading zeros;
`-` is valid only for insertion. `move` removes before resolving the destination
and cannot move a value into its descendant. Missing parents or targets fail.
Errors use `JSON_PATCH` at `/patch/{index}`; resource and cooperative controls
propagate through the original engine boundary.

This operation transforms JSON values. It grants no row-write authority or
concurrency guarantee. A host persists its successful result through its existing
transaction and write-admission contract.

Normative sources: [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902),
[RFC 6901](https://www.rfc-editor.org/rfc/rfc6901),
[Parquet logical types](https://parquet.apache.org/docs/file-format/types/logicaltypes/),
[Avro 1.12.0](https://avro.apache.org/docs/1.12.0/specification/), and
[SQL Server ISJSON](https://learn.microsoft.com/en-us/sql/t-sql/functions/isjson-transact-sql).
