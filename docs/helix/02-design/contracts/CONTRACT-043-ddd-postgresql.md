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
The table-stage report retains every index choice, relationship choice, DDD
identity and unsupported scalar/path obligation as a residual. A separate
table-plus-index stage has pinned PostgreSQL 17.4 evidence for four supported
indexes and explicit residuals for four unsupported choices. Neither stage is
the complete projection defined below; relationship and Key composition still
require their dependent beads.

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
