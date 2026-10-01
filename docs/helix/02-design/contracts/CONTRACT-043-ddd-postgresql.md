---
ddx:
  id: CONTRACT-043
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: US-048
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-015
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
---

# CONTRACT-043: DDD and binding to PostgreSQL DDL

**Type:** directed projection. **Initial target:** PostgreSQL 17, qualified
subset; no database migration or query execution. **Status:** draft.

## Purpose

Generate reviewable native DDL from an authored `umf.ddd` logical model,
CONTRACT-041 relationships and a separate PostgreSQL `umf.binding` document.
The operation retains each source and reports the meaning the target lacks.

The relationship-independent table stage is implemented for a pinned PostgreSQL
17.4 subset: DDD entities and a separate binding emit quoted tables, explicit
scalar columns, a JSONB object carrier and LIST/default partition layout.
Its explicit type policy must target bound DDD columns, and every partition
family must be selected; stale or embedded-field scalar policies block before
DDL emission.
The table-stage report retains every index choice, relationship choice, DDD
identity and unsupported scalar/path obligation as a residual. A separate
table-plus-index stage has pinned PostgreSQL 17.4 evidence for four supported
indexes and explicit residuals for four unsupported choices. Neither stage is
the complete projection defined below; relationship and Key composition still
require their dependent beads.
`fixtures/projections/ddd-authored-relationships/base.json` prepares the same
DDD graph with Key 0.6.0 Record ownership and separate PostgreSQL/Delta
bindings, plus separate Order→Customer and reified Order→Product relationship
proposals. The committed Key candidate validates the base, but this
preparatory fixture emits no relationship DDL and is not admission evidence.

## Scope and Boundaries

The caller supplies the logical document and binding document explicitly,
plus a complete naming/type/partition policy and `strict` or `report` loss
policy. No network, live database or artifact-supplied code runs in the portable
library. DDL is a target candidate, not proof of deployment, data migration,
transaction enforcement or query behavior. Per-entity SQL views are a later
projection, not part of this contract.

## Normative Surface

`projectDddToPostgresql(logical,binding,policy)` returns a complete projection
result. The policy MUST identify its PostgreSQL major version, schema,
identifier naming map for every emitted table/column/constraint, scalar type
mapping, partition family definitions, and loss mode. Every name is explicit
or follows a declared deterministic naming rule with collision checking.
Unqualified SQL identifiers are not interpolated from model text. Predicate
language/version must match the supported PostgreSQL profile; expressions are
opaque to UMF and cannot be treated as enforced until target syntax and behavior
are checked. Unsupported or unsafe syntax blocks in either loss mode.

| Source declaration | Target candidate | Required report distinction |
| --- | --- | --- |
| Bound entity/association element | `CREATE TABLE` with mapped columns and each supported named key under the declared policy | Stable authored key IDs remain in the source/report; native constraint names do not replace them. DDD entity lifecycle, value equality, aggregate ownership and repository behavior remain in source. |
| Bound `column` field | Typed SQL column with explicit nullability and facet lowering | Scalar width/coercion, default/absence and collation mismatches use CONTRACT-040 outcomes. |
| Bound `embedded` field | JSONB document column and declared path in the supported profile | JSON shape and path constraint/enforcement are residual unless emitted and natively checked. |
| Relationship `foreign_key` | FK column/constraint only for a single type-checkable source/target and the explicitly named target Key ID, including a compatible alternate key | Heterogeneous source, both-end `min..max` participation not enforced by the FK, inverse, target lifecycle and validation/trust state are residuals or native observations. `NOT VALID` and composite `MATCH SIMPLE` cannot certify existing referential integrity. |
| Relationship `junction` | Junction or bound association-Record table with checked FK columns for supported many-to-many | Association Record key/fields must survive explicitly; absent native uniqueness, minimum participation, lifecycle and inverse are residuals. Field container ordering/map keys do not define relationship multiplicity. |
| Relationship `edge` | Shared adjacency table with relationship-name discriminator and explicit endpoints | A discriminator alone does not enforce heterogeneous endpoint type; report unenforced constraints. |
| Relationship `inline` | Only an explicit supported inline carrier | Unsupported layout blocks or residualizes; never guess storage. |
| Bound partition/index | PostgreSQL partition clause and `CREATE INDEX`/unique form after safe policy checks | Unsupported `clustering`, opaque predicate semantics, path/collation/statistics behavior remain reported. |

### Relationship column policy

The relationship-capable PostgreSQL policy MUST provide one layout entry keyed
by exact `{module,id}` for each supported `foreign_key`, `junction` or `edge`
choice in the versioned `umf.binding` ID-based profile. The layout MUST name
the carrier table, ordered source and target column maps with SQL type and
nullability for every referenced Key component, and explicit constraint names.
A junction or shared edge carrier also requires the exact stable source Key
ID. The target Key ID comes from
`relationship.target[].key` and MUST match the target column map. No primary,
first, or same-named native key may be substituted. Every mapped target Key
field MUST resolve to a bound column with a comparator and type compatible
with its referencing column; SQL collation and NULL behavior remain qualified
under CONTRACT-040. Missing, extra, duplicate or mismatched map entries block
before DDL emission. The policy is target layout, never logical relationship
meaning or an authored key.

The initial portable policy profile is
`postgresql-relationship-layout-1`, pinned to target version `17.4`. It
extends the existing explicit table policy with `keyLayouts` and
`relationshipLayouts`. Every entry is keyed by stable core IDs; neither a
display name nor a native constraint name selects an authored assertion:

| Entry | Required members | Validation |
| --- | --- | --- |
| `keyLayouts[]` | `record:{module,element}`, `key` (stable Key ID), `table`, `constraint`, ordered `components[]` | The referenced Record owns the exact named Key. Components match its ordered `Key.fields` one-to-one. Each component gives `keyField:{module,element}` (core Field ID), `boundField:{module,element,field}` (DDD field key), `column`, `sqlType`, and `nullable:false`. The core Field must be exclusively owned through `Record.members`; the bound field and column must resolve in the separate binding and table policy. The target must prove a native unique/primary constraint before an FK can reference it. |
| `relationshipLayouts[]` | `relationship:{module,id}`, `storage`, `carrierTable`, `targetKey:{module,element,key}`, `targetConstraint`, ordered `targetComponents[]` | Exactly one layout matches each projected ID-based physical relationship choice. Its storage equals that choice. `targetKey` equals the authored relationship target and names a `keyLayouts` entry. The carrier table equals the bound source table for `foreign_key`; no DDD field name may stand in for a relationship ID. |
| `sourceKey` and `sourceComponents[]` | Required for `junction`/`edge`, absent for initial `foreign_key` | `sourceKey` names a stable source Record Key and its ordered components; `sourceConstraint` names the carrier FK. An association Record uses its own bound table as carrier. |
| `associationRecord` and `associationKey` | Required when the authored relationship names an association Record | Both resolve exactly to the same keyed Record and one `keyLayouts` entry; the carrier table is that Record's table. The table pass emits its own Key and every bound attribute. A bare pair table is a loss, never an implicit substitute. |

Each relationship component gives `keyField` (core endpoint Key component),
`endpointField` (the DDD field paired with it), `endpointColumn`,
`carrierField` (the DDD field storing the reference), `carrierColumn`,
`sqlType`, and `nullable`. The validator checks the ordered mapping against
the authored Key, exclusive core membership, both bound DDD fields, the
declared columns and table policy, target type/comparator compatibility and
NULL behavior. It rejects stale, missing, extra, reordered, duplicated or
cross-table maps before rendering any DDL. `sourceConstraint` and
`targetConstraint` are physical names only. The exact concrete policy and
both relationship choices are pinned in
`fixtures/projections/ddd-authored-relationships/postgresql-layout-proposal.json`;
the fixture is a design input, not a published schema or generator result.
The same directory contains a hand-authored expected PostgreSQL DDL target,
accepted by the pinned PostgreSQL 17.4 catalog oracle and recovered by the
adapter in Chromium. It is a target oracle for later generator comparisons,
not evidence that authored relationships have already been projected.

For `foreign_key`, the carrier table MUST be the single source Record's bound
table, and ordered referencing columns MUST align one-to-one with the single
target Record's named Key components. For `junction`, the policy MUST name a
source Key ID, both ordered endpoint column maps and both FK constraint names.
If `associationRecord` exists, its bound table is the carrier and its own
key/fields are emitted there; reducing it to an anonymous pair table is a
loss, not an implementation shortcut. For `edge`, the policy MUST additionally
name a discriminator column/value and the shared adjacency table. A
heterogeneous endpoint set cannot be asserted type-checked merely because the
discriminator is present. `inline` has no PostgreSQL 17 carrier in the initial
profile and remains an explicit residual. These layout entries are versioned
with the policy and retained in projection receipts.

Every emitted statement maps back to exact logical/binding source paths.
Generated source order is deterministic: dependencies before FKs, tables before
indexes, then constraints requiring prior tables. Cyclic FKs require an explicit
deferred `ALTER TABLE` pass; no invalid partial DDL is returned. Partitioned
tables require a complete strategy/key/bounds policy and native-valid unique
constraints, or the operation blocks. An unsupported index kind cannot vanish:
strict blocks; report may emit the remaining complete DDL with a residual.
Aggregate boundaries, opaque invariants and DDD context/lifecycle distinctions
remain in source with explicit `not-enforced` or `not-expressible` entries,
following CONTRACT-006.

PostgreSQL 17.4 rejects `PRIMARY KEY (id)` on a table partitioned by
`LIST (tenant)`, because the unique constraint omits the partition column;
`PRIMARY KEY (id, tenant)` succeeds but is a different authored Key. The
pinned DDL-only oracle is
`fixtures/projections/ddd-authored-relationships/postgresql-partitioned-key.json`.
The relationship-success fixture therefore uses a separate unpartitioned
PostgreSQL binding for the same logical graph. The original tenant-partitioned
binding remains a valid, separately reported table-stage example; the
generator MUST NOT silently widen `Order.pk` or claim an FK to an unenforced
id-only key.

Result fields are status, copied logical source, copied binding source, policy,
qualified mappings, diagnostics, residuals, optional complete `nativeSource`,
and optional imported target UMF. A blocked result has no target candidate.
`strict` blocks every non-exact requested obligation. `report` may return a
candidate only when target syntax and references are safe, with every loss
source-qualified. The emitted DDL MUST pass `umf.postgresql` parse, deparse
and codec recovery, then the pinned isolated PostgreSQL 17 oracle for the
published subset. The oracle does not execute application queries. A retained
DDD+binding→native→ideal cycle recovers authored assertions or explicit
residuals. Native DDL→UMF→native DDL preserves unclaimed original bytes from
the native adapter archive. Target-only reimport cannot recover DDD intent.

## Precedence and Compatibility

CONTRACT-005 owns DDD meaning, CONTRACT-041 owns association intent,
CONTRACT-042 owns physical choice, and CONTRACT-015 owns native archive
preservation. They are separate sources; a binding mismatch never changes the
logical document. Source and binding package versions are pinned in every
result. A new generator version cannot reinterpret an old result without an
explicit migration; rollback retains both inputs and the original native DDL
archive. The operation never changes `element.references` resolution.
Name-based `umf-binding-1` relationship entries MUST migrate under CONTRACT-042
before relationship DDL can be emitted; the generator never resolves them by
presentation name.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Invalid DDD/relationship/binding or stale model identity | Block with source path, no DDL | Correct input or explicit migration |
| Missing naming/type/partition choice or collision | Block before emission | Complete policy |
| Unsafe identifier/expression or native parse failure | Block even in report mode | Restrict to supported syntax |
| Non-exact but safely emittable choice | Strict block; report complete candidate plus residual | Retain source/report or choose another binding |

## Examples

An Order and Customer with a declared many-to-one relationship and a
PostgreSQL FK binding yield two tables and a checked FK constraint. A separate
OrderProduct association with its own fields yields a junction table. An
unsupported clustering index does not appear silently: strict returns no DDL;
report returns otherwise valid DDL with the retained index declaration and
residual. A DDD invariant remains reported even if the DDL parses.

## Validation Checklist

- [x] Inputs, direction, candidate atomicity and source recovery are explicit.
- [x] Storage, relationship, index and partition lowerings name their limits.
- [x] Native adapter and independent PostgreSQL oracle are required.
- [ ] Published subset/evidence must precede a delivered claim.

### Published relationship layout validation profile (2026-10-01)

`validatePostgresqlRelationshipLayout(logical, binding, policy, lossPolicy)`
publishes the metadata-validation stage of this contract. Its candidate is a
validated policy, never SQL. `postgresql-relationship-layout-1` uses the original
keyed-graph proposal's `keyLayouts` and `relationshipLayouts`, plus mandatory
`fieldLayouts` and explicit collation qualifiers. The added inventory is needed
to validate association attributes and referencing columns without guessing a
core Field from a DDD field name.

Each `fieldLayouts` entry states `coreField:{module,element}`, the exact
`boundField:{module,element,field?}`, `table`, `column`, `sqlType`, `nullable`
and `collation`. A core Field must be a member of the Record bound to that
physical table. A nested DDD field must belong to that same Record and agree
on the declared scalar family and availability. This is an explicit caller
mapping; the validator never derives core identity from naming conventions.
Every bound scalar column requires one unique inventory entry.

Each `keyLayouts` entry retains its exact `record`, stable `key`, `table`,
`constraint` and ordered `components`. Each component names its `keyField`,
`boundField`, `column` and SQL type/NULL/collation qualifiers. All Keys on bound
Records require explicit layouts. The relationship entries preserve the
proposal's exact `relationship:{module,id}`, `storage`, `carrierTable`,
`targetKey`, `targetConstraint` and ordered `targetComponents`; junction/edge
entries additionally require `sourceKey`, `sourceConstraint` and
`sourceComponents`. Endpoint components name both the ordered endpoint Key
Field/bound column and the referencing carrier column with its qualifiers.
Bound Record carriers require a `carrierField`; anonymous junction/edge
carriers explicitly declare new columns. An association Record must retain
its bound table, stable `associationKey`, all authored Keys and every member
Field in the inventory, including attributes beyond endpoint columns.

The initial safe subset permits ASCII identifiers of at most 63 bytes,
canonical bounded builtin scalar SQL types, explicit `C` collation for text
and `null` collation for nontext. Endpoint and referencing SQL types/collations
must agree exactly. A nullable referencing component retains an explicit
`MATCH SIMPLE` residual. Primary Key columns cannot be nullable. Type-domain,
NULL-carrier and comparator equivalence still require native evidence;
accepting policy never proves those meanings equivalent to the ideal.
Partitioned Key layouts are blocked pending a complete partition policy.

An edge requires a non-null `text COLLATE "C"` discriminator. Shared edge
carriers require identical physical shapes, distinct discriminator values and
the same endpoint Keys: a discriminator cannot condition ordinary FK target
identity. Heterogeneous endpoint sets, missing/reordered/extra maps, stale
bindings, name-for-ID substitution, unsafe SQL fragments, physical-column
collisions and table/index/constraint namespace collisions block both modes.
Inline choices remain explicit unsupported residuals. Unknown binding/policy
content blocks interpretation; unknown logical qualifier values remain
source-qualified residuals. Report mode returns a complete safe policy with
all residuals; strict mode blocks every non-exact obligation. Both retain
copied logical, binding and policy sources.

The schemas and Bun/Chromium evidence are documented in
[the layout validation record](../../04-build/evidence/postgresql-relationship-layout.md).
No FK DDL generator, native constraint enforcement or Relationship admission
is claimed by this stage.

## Whole-generator profile (2026-10-01)

`projectDddToPostgresql` implements `ddd-postgresql-1` version `1.0.0` for
PostgreSQL **17.4**, composing the DDD table stage, exact stable-ID layout and
binding index stage. Its complete JSON schemas describe policy and directed
result: copied core 0.7 logical source, stable binding 0.2 source, explicit table
and layout policies, source-qualified residuals, statement mappings, exact SQL
and a PostgreSQL archive. Successful report output contains every supported
bound table, scalar/JSONB column, object CHECK, authored Key, selected carrier
and supported index. Any unsafe or incomplete structural choice blocks the
whole candidate. Strict mode blocks all remaining meaning gaps.

Anonymous junctions and homogeneous edge carriers are real tables. Shared
edges have identical endpoint Keys and columns, distinct discriminator values,
and a CHECK admitting exactly those values; ordinary FKs apply to every row.
Heterogeneous endpoints and discriminator mappings onto an association Record
are refused. Keyed junction association Records preserve their attributes and
all Keys. Inline storage remains a source-linked residual. No additional pair
uniqueness, cascading actions, membership minimum or lifecycle behavior is
inferred. Cyclic FKs are emitted after all tables and Keys exist.

The whole generator extends the metadata-only partition checkpoint with an
explicit LIST/default family: every authored Key on a partitioned table must
already contain the partition column. Otherwise both modes block; no Field is
added to a Key. Default partitions participate in table/backing-Key/index/carrier
namespace collision checks. Text Key and referencing comparator columns use
explicit `pg_catalog."C"`; other text retains table-stage default collation with
a residual. JSONB object checks use `ck-table-column-object-v1`; normalization,
embedded path constraints and DDD aggregate/invariant meaning remain residual.
Every declared index is emitted by the bounded index stage or receives its
original binding-path residual; unsafe predicates block both modes.

`recoverDddPostgresqlIdeal` recomputes the complete receipt and restores logical,
binding and policy sources. `recoverDddPostgresqlNative` verifies the native
archive and restores exact emitted source bytes. Unclaimed native DDL remains
available through the PostgreSQL archive; native import does not infer author
intent. This is generated reviewable schema, not deployed migration support.
See [whole-generator evidence](../../04-build/evidence/ddd-postgresql.md).
