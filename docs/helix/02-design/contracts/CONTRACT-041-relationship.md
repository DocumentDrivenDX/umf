---
ddx:
  id: CONTRACT-041
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: US-045
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-041: Authored relationship ideal

**Type:** core schema/library. **Status:** draft semantic authority before a
core schema change. **Version:** the first experimental envelope after key's
versioned implementation; the final number is assigned before publication.

## Purpose

Define a portable, authored schema-level association between element types.
The assertion names allowed endpoint types and multiplicity; it does not
create an instance edge, choose storage, assert a foreign key or prove target
enforcement. Admission is governed by FR-3; FR-28 native replacement remains a
separate gate.

## Scope and Boundaries

The new member is `module.relationships`, an optional array. Existing modules
without it assert no relationships. Existing `element.references` retain their
opaque roles and exact-ID resolution and gain no relationship meaning. DDD
concept references retain their own scoped semantics under CONTRACT-005; an
explicitly authored relationship may bind to one without merging the vocabularies.
Element identity remains the exact `(module.id, element.id)` pair.

## Normative Surface

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `name` | nonempty string | yes | Unique among relationships in its containing module by exact string equality. It is the relationship's local identity and discriminator, not an element ID. |
| `source` | nonempty array of `{module,element}` | yes | Every pair resolves exactly to a core element; duplicates are invalid. |
| `target` | nonempty array of `{module,element}` | yes | Same exact resolution and uniqueness rules. A self-reference is permitted. |
| `sourceCardinality` | `one`, `array`, `map`, `unspecified` | yes | Existing CONTRACT-040 cardinality vocabulary describes source participation as an ideal value shape; `array` is the ordered many form, and `map` requires string keys. It does not assert actual instances exist. |
| `targetCardinality` | same vocabulary | yes | Describes target participation from each source. A target-side `array` maps to a list-capable carrier only under an explicit binding. |
| `directed` | boolean | yes | `true` declares source→target presentation. `false` declares an undirected association with the given source/target labels retained for identity and serialization; a target may require a directed approximation. |
| `inverse` | nonempty string | no | Optional reverse presentation name; it does not create a second relationship or prove bidirectional enforcement. It must not collide with another authored presentation name on the same target element. |

The endpoint sets name allowed **types**, not a union of current instance IDs.
Each endpoint reference MUST resolve by CONTRACT-001 exact IDs; names and
namespaces cannot substitute. A relationship's stable identity is its containing
module ID plus exact `name`. Rename or endpoint reassociation is an explicit
operation with retained old source, never inferred from display-name changes.
An array or map end is not a SQL array or native collection promise. Map-end
string-key identity and ordering obligations are residual unless a target
binding proves them. `unspecified` asserts no multiplicity. Two `one` ends
describe one-to-one, one source to array target describes one-to-many, and
array source to one target describes many-to-one under the declared end view.
Neither cardinality proves uniqueness or FK enforcement.

Every operation MUST retain copied authored source, mapping/provenance,
diagnostics, source-qualified residuals and an optional complete candidate,
as in CONTRACT-040. Outcomes are `exact`, `approximated`, `not-expressible` or
`unknown`. Strict blocks requested non-exact obligations with no candidate;
report may emit only a complete structurally valid target and never hides loss.
Ideal→native→ideal with the retained report MUST recover the assertion or an
explicit non-recovery residual. Native→ideal→native MUST recover unclaimed
original text/bytes and unknown extension content exactly. Native-only reimport
cannot infer authored relationship intent. Classified observations carry native
source/version and refinements, never `authored` provenance.

### Binding obligations

| Target | Initial down-projection | Up-classification and required loss |
| --- | --- | --- |
| TableSpec | Only an explicitly representable declared link may be emitted; otherwise report/refuse the relationship while retaining it. The pinned model must prove any useful carrier before an exact claim. | Native primary-key/context/column references alone do not assert authored association. Preserve original table bundle and unknown metadata. |
| PostgreSQL 17 | For a single source and target with suitable keys, a many-to-one profile may use FK columns; many-to-many may use a junction relation under a declared physical binding. | Catalog/DDL FKs classify as native observations with action, deferrability, match, key and schema refinements. Multiple source types cannot be type-checked by one FK column; report this loss. |
| SQL Server | Same scoped FK/junction profiles with explicit key and schema bindings. | Keep disabled/trust/actions/filtered and catalog-version distinctions native. A captured FK does not establish author intent. |
| Avro | A named reference or nested record can carry a target shape in a declared record context. | No association enforcement, reverse participation or stable cross-record identity follows; residualize them and preserve full native schema/default/name-resolution refinements. |
| Parquet | A checked reference column or nested record may carry selected target identity/shape. | Association enforcement, graph identity and reverse multiplicity remain residual; preserve repetition, field IDs and embedded Arrow/native bytes. |
| GraphQL SDL | Field on a source object; list wrapper for `array` target; inverse target field only when `inverse` exists. | SDL lacks source-end cardinality and association enforcement. An object-returning field may be computed; classify without authored assertion. |
| RDF | Predicate with domain/range for single endpoint classes; multi-element source becomes a declared union-class approximation. | RDF domain/range inference is not cardinality enforcement. Retain predicate and native graph refinements; report union and multiplicity differences. |
| LinkML | Slot with range and `multivalued` for an array target under explicit class/range binding. | Opposite-end cardinality, maps and unsupported unions remain residual; retain native slot facets. |

The admission record MUST contain written meaning, counterexamples, at least
two useful evidenced down-projections to distinct priority systems and
up-classification retaining native refinements. A refusal alone is not useful
down-projection. All five priority systems still require separate scoped
delivery, both recovery directions and native/browser evidence. GraphQL, RDF
and LinkML are additional bindings, not substitutes for TableSpec. No binding
is native-equivalence graduation by default.

## Precedence and Compatibility

CONTRACT-040's provenance, residual, strict/report and recovery obligations
apply. CONTRACT-005's DDD field rules remain authoritative for DDD concepts;
cardinality `many` alone never creates a relationship. A PostgreSQL FK without
authored declaration is observed native refinement; GraphQL object fields may
be computed. Before reserving `module.relationships`, test old unknown-member
collisions. A versioned migration MUST retain original old content and new
assertions in a receipt; rollback restores the old envelope and retains the
new assertion as explicit sidecar/residual, never silently interprets an old
unknown member. Older documents remain readable without gaining associations.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Duplicate name, duplicate endpoint, missing endpoint or malformed cardinality | Invalid document with source path; no candidate | Correct authored model; original untouched |
| Unknown relationship member or future enum | Preserve, mark interpretation incomplete; unsafe edit/projection blocks | Install supported version or use read/write recovery |
| Conflicting authored and native observation | Report both and conflict, no implicit precedence | Explicit author decision; native archive remains |
| Target cannot express requested end/direction | Strict block or report residual and complete candidate | Retain report and source; choose binding/policy |

## Examples

An authored `Order.customer` relationship may use source `one`, target `one`
and direction `true`; a PostgreSQL FK can represent one declared link under a
compatible key binding, while its delete action stays native. An `Order.products`
relationship with source `one` and target `array` can use a junction table;
the target-only DDL cannot recover the author name without the retained report.
A DDD `Order.customer` concept field with cardinality many but no authored
relationship remains a DDD field, not a relationship.

## Validation Checklist

- [x] Meaning, exact endpoint identity, counterexamples and nonimplications are explicit.
- [x] Two-priority admission and all-five delivery are distinct.
- [x] Strict/report, retained recovery and versioned rollback are specified.
- [ ] Native subsets and generated schema evidence must be supplied before implementation claims.
