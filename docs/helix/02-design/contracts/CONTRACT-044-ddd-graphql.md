---
ddx:
  id: CONTRACT-044
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: US-049
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
---

# CONTRACT-044: DDD and relationship to GraphQL SDL

**Type:** directed schema projection. **Initial target:** GraphQL SDL under
CONTRACT-009's pinned schema-mode profile. **Status:** draft.

## Purpose

Generate complete, parseable SDL from authored DDD entities, core field ideals
and explicitly declared relationships, while retaining every source assertion
and reporting semantics that GraphQL SDL cannot express or enforce.

## Scope and Boundaries

The caller supplies the logical document, selected entity set, explicit
type/field/scalar naming map, schema-root policy and `strict`/`report` loss
policy. Physical `umf.binding` storage does not affect this projection. The
result is SDL only: no resolver, query, argument, pagination, budget or API
execution behavior is generated.

## Normative Surface

`projectDddToGraphql(logical,policy)` returns copied source, target profile,
policy, exact source-to-SDL mappings, diagnostics, residuals and an optional
complete SDL plus imported `umf.graphql` target. All selected entity names,
scalar names, field names and inverse names MUST be valid unique GraphQL names
under an explicit deterministic policy. Names alone never merge distinct
module/element IDs. The root policy MUST supply an existing named query root
with at least one valid field or explicitly choose a separately contracted
schema-mode-safe synthetic root; a list of object types without a root is not
a successful complete schema.

| Source assertion | SDL lowering | Required loss account |
| --- | --- | --- |
| Selected DDD entity | One GraphQL object type | Identity, lifecycle, aggregate ownership and equality are not enforced. |
| Supported scalar Field | Explicit scalar mapping | Width, decimal/date-time encoding, coercion and facets not expressible in SDL remain residual. |
| Field nullability | Supported non-null wrapper for required value; nullable form for allowed absence | Present-null versus omission, defaults and input/output distinction remain explicit. |
| Relationship `targetMultiplicity` | Field on each selected source type; list wrapper when `max > 1` or `*`, singular otherwise | SDL cannot express the named target Key ID, source-end participation, `min > 0` list membership, lifecycle, association Record identity or referential enforcement. This is distinct from a Field's `one`/`array`/`map` container cardinality. |
| Declared `inverse` | Reverse field on each selected target type; list wrapper follows `sourceMultiplicity.max` under naming policy | No inverse field is inferred when absent; an emitted pair does not enforce inverse consistency or `sourceMultiplicity.min`. |
| Heterogeneous endpoint set | Explicit union/interface policy only when the GraphQL profile proves a valid output type | Otherwise report or refuse; never flatten to the first endpoint. |

An undirected relationship requires an explicit orientation/display policy;
the emitted directed SDL fields are an approximation with residual. Self
references are allowed when schema-mode validation succeeds. A native object
field may be computed, so importing SDL classifies its AST and never creates
authored relationship intent. DDD aggregates, invariants, services,
repositories, event behavior and context maps remain in retained source with
separate `not-enforced`/`not-expressible` entries under CONTRACT-006.

`strict` blocks non-exact requested obligations and returns no SDL. `report`
may emit only complete valid SDL with source-linked residuals. Even in report
mode, malformed names, unresolved types and invalid root policy block. The
candidate MUST pass `umf.graphql` schema-mode import, GraphQL.js validation
and the pinned GraphQL-core oracle for the declared subset. Browser execution
uses the same portable operation with no host APIs or network calls.
Ideal→SDL→ideal with retained report recovers authored meaning or explicit
non-recovery residual. Native SDL→UMF→native SDL recovers unclaimed original
bytes and unknown content via the native archive. Target-only SDL reimport
cannot reconstruct DDD intent, source-end participation or physical storage.

## Precedence and Compatibility

CONTRACT-005 governs DDD, CONTRACT-040 fields/nullability/cardinality,
CONTRACT-041 relationships, CONTRACT-009 native AST/source. Existing generic
core references retain their old meaning. Generated SDL does not replace the
logical model. Every result pins source core/DDD versions and GraphQL.js/
GraphQL-core versions/subset. Migration or rollback of a generator profile
retains old source, report and native SDL archive; it cannot reinterpret an
older unknown declaration as an authored relationship.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Invalid logical declaration, missing type or name collision | Block with paths and no SDL | Correct model/policy |
| Invalid or missing schema root | Block even in report mode | Supply valid root policy |
| Unsupported but safely lowerable meaning | Strict block; report SDL plus residual | Keep report/source |
| Native schema-mode or independent oracle rejection | Block, retain source and candidate diagnostics | Narrow subset or correct lowering |

## Examples

With an authored `Order.customer` relationship whose target multiplicity is `1..1`,
the Order type receives a Customer field. Declaring inverse `orders` adds a
list-capable field to Customer only when the authored reverse multiplicity and
policy support it. Without that inverse, no reverse field appears. An Order
aggregate invariant remains visible in the report but is not enforced by SDL.

## Validation Checklist

- [x] Source, root policy, SDL lowering and non-execution boundary are explicit.
- [x] Strict/report, both retained recoveries and target-only limits are explicit.
- [x] Existing adapter and two qualified GraphQL engines are required.
- [ ] Native/browser results and pinned subset must precede a delivered claim.
