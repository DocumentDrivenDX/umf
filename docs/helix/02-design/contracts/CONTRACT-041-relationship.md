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

Define a portable, authored schema-level association between independently
identified record types. The assertion names allowed endpoint types, the
target key used to resolve a record reference, and participation multiplicity; it does not
create an instance edge, choose storage, assert a foreign key or prove target
enforcement. Admission is governed by FR-3; FR-28 native replacement remains a
separate gate.

**Admission decision:** this is a core ideal, conditional on the Key ideal's
named, stable key identities and two evidenced useful priority down-projections.
Record identity, referential resolution and participation have meaning in both
relational and graph models without importing physical FK or DDD aggregate rules.
PostgreSQL and SQL Server offer qualified FK/junction down-projections, while
Avro and Parquet retain the assertion as a reported residual. Native import
classifies observed constraints separately and retains their refinements. This
design decision does not claim the admission gate has passed or that the ideal
is implemented. If useful two-system evidence fails, publish the shape as a
`umf.*` extension with fidelity reports instead of reserving core syntax.

## Scope and Boundaries

The new member is `module.relationships`, an optional array. Existing modules
without it assert no relationships. Existing `element.references` retain their
opaque roles and exact-ID resolution and gain no relationship meaning. DDD
concept references retain their own scoped semantics under CONTRACT-005; an
explicitly authored relationship may bind to one without merging the vocabularies.
Element identity remains the exact `(module.id, element.id)` pair. A record-valued
Field under CONTRACT-040 describes containment by value; it does not declare a
relationship. The endpoint types below MUST be Records with authored Key ideals.

## Normative Surface

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `id` | nonempty opaque string | yes | Stable relationship identity, unique within its containing module. `(module.id, id)` identifies the assertion across renames and revisions; it is distinct from an Element ID and from the presentation name. Reusing an ID for a different association is a conflicting change. |
| `name` | nonempty string | yes | Unique among relationships in its containing module by exact string equality. It is the authored presentation name and may change while `id` remains stable. |
| `source` | nonempty array of `{module,element}` | yes | Each pair resolves exactly to a keyed core Record; duplicates are invalid. A heterogeneous source set is allowed but may be residual on a native carrier. |
| `target` | nonempty array of `{module,element,key}` | yes | Each pair resolves exactly to a keyed core Record. `key` is the stable ID of one authored named Key on that target Record, including an alternate key; duplicates are invalid. A self-reference is permitted. |
| `sourceMultiplicity` | `{min,max}` | yes | For each target record, number of source records that may participate; `min` is a nonnegative integer and `max` is a positive integer or `*`, with `max >= min`. |
| `targetMultiplicity` | `{min,max}` | yes | For each source record, number of target records that may participate, under the same bounds. `min: 1, max: *` means one or more. |
| `targetLifecycle` | `owned`, `independent`, or `unspecified` | yes | `owned` asserts that the target record's lifecycle depends on its source record; `independent` asserts no such dependency. This is distinct from DDD aggregate membership and does not prescribe cascade actions. `owned` requires a directed relationship. |
| `associationRecord` | `{module,element}` | no | A separately keyed Record that carries this association's attributes and identity; one association instance corresponds to one instance of that Record. It does not imply that endpoint-pair values are unique unless the association Record's key says so. |
| `directed` | boolean | yes | `true` declares source→target presentation. `false` declares an undirected association with the given source/target labels retained for identity and serialization; a target may require a directed approximation. |
| `inverse` | nonempty string | no | Optional reverse presentation name; it does not create a second relationship or prove bidirectional enforcement. It must not collide with another authored presentation name on the same target element. |

The endpoint sets name allowed **record types**, not a union of current instance
IDs. Each reference MUST resolve by CONTRACT-001 exact IDs; names and namespaces
cannot substitute. The serialized `target[].key` value is the exact stable
`Record.keys[].id` on the named target Record under CONTRACT-040, not a key
display name or native UNIQUE index. The stable Key ID survives a
display-name edit; replacement or reassignment of the Key ID is an explicit
identity migration. A relationship's stable local identity is its
containing module ID plus exact `id`; cross-document stability and revision
pinning await the separate CONTRACT-001 successor. The current resolver stays
within one document.

Multiplicity counts distinct associated record instances, not field values,
container items or stored rows. It does not assert existing data satisfy a
minimum, even when `min > 0`; that requires a separate data check. For `Order`
→ `Line` with each Order having at least one Line and each Line having one
Order, `targetMultiplicity={min:1,max:*}` and
`sourceMultiplicity={min:1,max:1}`. An unbounded maximum says nothing about
ordering or duplicate sequence entries. Neither end proves native uniqueness,
referential enforcement or a physical join layout. An owned target is a logical
lifecycle assertion only. A foreign key, including `ON DELETE CASCADE`, does
not establish it, and a DDD aggregate remains governed by `umf.ddd`.

An association Record such as `Enrollment` can have `grade` and its own named
key, with `associationRecord` pointing to it while Student and Course remain
the endpoint types. The association key identifies an Enrollment, not
necessarily a unique Student/Course pair. Projection MUST report any inability
to carry that identity or attributes; it may not reduce Enrollment to a bare
junction row silently. A model may instead express two ordinary relationships
from Enrollment to Student and Course; those are distinct authored assertions.

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
| PostgreSQL 17 | For a single source and target with compatible named keys, a scoped FK may carry target-key columns, including a compatible UNIQUE alternate key; many-to-many needs a junction or association table under a declared physical binding. | Catalog/DDL FKs classify as native observations with action, deferrability, match, validation state, referenced key and schema refinements. `NOT VALID` does not vouch for old rows; default `MATCH SIMPLE` exempts a composite FK when any referencing component is NULL. Multiple source types cannot be type-checked by one FK column. A FK never proves `targetLifecycle: owned` or minimum participation. Report these losses. |
| SQL Server | Same scoped FK/junction profiles with explicit named-key and schema bindings; an alternate UNIQUE constraint may be the target. | Keep `NOCHECK`/trust state, actions and catalog-version distinctions native. Disabled or untrusted constraints do not vouch for existing rows. A captured FK does not establish author intent, lifecycle ownership or minimum participation. |
| Avro | A named reference or nested record can carry selected target shape only under an explicit qualified carrier. | Avro has no referential enforcement; nested records are by-value unless a binding says otherwise. Target-key resolution, opposite-end multiplicity and association identity/attributes are residual unless retained out of band. Preserve full native schema/default/name-resolution refinements. |
| Parquet | A checked reference column or nested record may carry selected target identity/shape under an explicit qualified carrier. | Parquet has no referential enforcement; repetition does not establish participation, record identity or lifecycle. Preserve repetition, field IDs and embedded Arrow/native bytes; report all unsupported obligations. |
| GraphQL SDL | Field on a source object; list wrapper for `targetMultiplicity.max > 1`; inverse target field only when `inverse` exists. | SDL cannot express target-key resolution, source-end multiplicity, lifecycle, association identity or referential enforcement. A list wrapper does not enforce `min > 0`; an object-returning field may be computed. Classify without authored assertion. |
| RDF | Predicate with domain/range for single endpoint classes; multi-element source becomes a declared union-class approximation. | RDF domain/range inference is not cardinality enforcement. Retain predicate and native graph refinements; report union and multiplicity differences. |
| LinkML | Slot with range and `multivalued` for `targetMultiplicity.max > 1` under explicit class/range binding. | Opposite-end multiplicity, named target key, association identity and unsupported unions remain residual; retain native slot facets. |

Native counterexample evidence is pinned at
`fixtures/relationship-native/oracle-results.json`; Chromium 148 codec recovery
for the same source hashes is in `fixtures/relationship-native/browser-results.json`.
The TableSpec 1.0 model
accepts `relationships.foreign_keys` with source column, referenced table and
column, and confidence; the current adapter archives it exactly. This proves a
native carrier exists, but not an authored Relationship down-projection or Key
resolution. RDF domain/range and LinkML slot/range/multivalued are likewise
classified native observations. These fixtures do not count toward the
two-priority-system admission gate until directed projection and recovery are
tested.

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
| Duplicate ID or name, duplicate endpoint, missing/non-Record endpoint, unresolved target key, invalid association Record, or malformed multiplicity | Invalid document with source path; no candidate | Correct authored model; original untouched |
| Unknown relationship member or future enum | Preserve, mark interpretation incomplete; unsafe edit/projection blocks | Install supported version or use read/write recovery |
| Conflicting authored and native observation | Report both and conflict, no implicit precedence | Explicit author decision; native archive remains |
| Target cannot express requested key/end/lifecycle/association/direction | Strict block or report residual and complete candidate | Retain report and source; choose binding/policy |

## Examples

An authored `Order.customer` relationship may use target multiplicity `{1,1}`
and source multiplicity `{0,*}`, naming Customer's alternate `account_number`
key; a PostgreSQL FK can represent selected target-key columns under a compatible
binding, while its delete action stays native. An `Order.products` relationship
with target multiplicity `{0,*}` can use a junction table; target-only DDL cannot
recover the author name, opposite minimum or lifecycle without the retained
report. `Enrollment` may be an association Record with `grade` and its own key.
A DDD `Order.customer` concept field with cardinality many but no authored
relationship remains a DDD field, not a relationship.

The target-key spelling and physical-binding identity transition are settled:
`target[].key` names `Record.keys[].id`, and the relationship-capable binding
profile resolves `{module,id}`. CONTRACT-042 specifies migration from its
published name-based profile. Neither decision asserts that the Key delivery
gate has passed.

## Open Decisions Before Core Publication

- Reconcile `(module.id,id)` relationship lineage with the revision-qualified
  identity proposed by CONTRACT-045 before cross-document references ship.
- Specify how a physical binding ties an `associationRecord` to endpoint-key
  columns and whether its own key is surrogate or endpoint-derived. The core
  assertion does not dictate that layout.
- Determine exact versus residual SQL profiles for `min > 0`, ownership,
  undirected links and heterogeneous endpoint sets using pinned native oracles.

## Validation Checklist

- [x] Meaning, exact endpoint identity, counterexamples and nonimplications are explicit.
- [x] Two-priority admission and all-five delivery are distinct.
- [x] Strict/report, retained recovery and versioned rollback are specified.
- [ ] Native subsets and generated schema evidence must be supplied before implementation claims.
