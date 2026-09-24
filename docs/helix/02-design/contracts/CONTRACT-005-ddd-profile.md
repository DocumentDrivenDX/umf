---
ddx:
  id: CONTRACT-005
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: US-005
      kind: informed_by
---

# CONTRACT-005: DDD semantic profile

**Profile:** `umf.ddd` 0.1.0. **Native representation:** UMF JSON/YAML with the
DDD package registered. No universal DDD serialization or external tool is claimed.

## Purpose and Structural Schema

Represent domain meaning independently of physical implementation. The complete
payload schema is `spec/extensions/ddd/schema.json`, embedded in `package.json`.
JSON-compatible unknown fields survive but produce incomplete-interpretation
warnings. Core continues to carry qualified identity and neutral modules; no new
DDD meaning is promoted to core by this profile.

## Attachments and Identity

A module payload of kind `bounded-context` establishes DDD context semantics and
contains local ubiquitous-language terms. A module namespace alone does not.
Element payloads are entity, value, domain-event, domain-service or repository.
A document payload of kind `context-map` contains mappings. Wrong attachment scope
is an error. At least one explicit bounded context and the exact vocabulary version
are required for the DDD read/write entrypoints.

Every concept reference is `{module,element}` and resolves to an explicit DDD
payload. Names and field similarity never merge contexts. The module ID is context
identity; namespaces and display names are not identity proofs. Terms and aliases
are unique within their context and may bind only local concepts.

Entity identity specifies nonempty field names and `scope:context|aggregate`.
Identity fields must exist and have cardinality one. Aggregate-scoped identities
require exactly one declared aggregate owner. Roots require context-scoped identity.
These are model consistency rules, not a database uniqueness constraint.

## Fields, Equality and Relationships

Data-bearing definitions have named fields. Each field has a scalar type (string,
boolean, integer, decimal, date-time or bytes), or an explicit concept reference,
and cardinality one, optional or many. Concept field targets denote entities,
values or events, not services/repositories. Cardinality many does not choose list
ordering, set uniqueness, a storage collection or a graph edge implementation.
Concrete value encodings and persistence choices belong to bindings.

Value definitions explicitly list all declared fields in their equality rule.
There is no independent entity identity attached to a value. Domain equality is
not inferred from structural similarity of two definitions. Runtime value objects,
immutability enforcement and business-instance validation are not generated here.

## Aggregates and Domain Operations

An entity's optional aggregate declaration makes it a root and lists members.
Members are non-root entities or value definitions in the same context. Self-
membership and nested roots are errors. An entity definition cannot have conflicting
aggregate owners in this profile. Value definitions may be reused across aggregate
boundaries; reuse of a value type does not mean sharing one mutable entity instance.

Repositories reference local aggregate roots and declare operation names without
choosing persistence or endpoints. Domain services declare named operations with
optional input/output references and explicit emitted events. Events are immutable
domain declarations with fields and a same-context entity/service producer. An event
does not choose a transport, delivery guarantee, topic or event-store implementation.

## Invariants and Mappings

Invariants retain id, definition/aggregate scope, language, version, expression and
qualified references. Aggregate-scoped invariants belong on roots and reference
only the root or declared members. Invariant references may not cross contexts.
Every expression is opaque in this profile: `DDD_INVARIANT_OPAQUE` warns that it
has not been interpreted or enforced. Structural/model validation does not prove
the business rule or a transaction boundary.

Context mappings specify source, target, direction, equivalence description and
limitations. Source/target must be in distinct contexts. Partial mappings require
limitations. Bidirectional direction is an authored intent, not proof of inverse
functions. `asserted-equivalent` adds `DDD_EQUIVALENCE_UNPROVEN`; matching names or
structure never validates the assertion. An anti-corruption layer names its owner
among the participating contexts and describes translation responsibility.

## API and Failure Semantics

`dddRegistry()` installs structural and model-consistency validation.
`inspectDdd(document)` returns ordinary validation diagnostics. `readDddDocument`
and `writeDddDocument` use the same core JSON/YAML profile and reject invalid known
DDD declarations. Unknown fields and opaque rules remain serializable with warnings.
`getDddDefinition` returns a copy. `editDddDefinition` uses core atomic editing and
requires complete interpretation before and after the change. Opaque invariants
therefore conservatively block this edit API; no unchecked edit is described as safe.

Known semantic violations are errors, named by the relevant DDD diagnostic code.
Unknown fields, opaque expressions and unproven equivalence are warnings. No source
artifact directs executable code or network lookup. Core bounds still apply.

## Evidence and Follow-On Work

The original fixture `fixtures/ddd/sales.json` exercises all declared concept
families. Authored expected assertions and twelve semantic corruptions cover the
model rules. Browser checks use the same library. There is no independent external
DDD tool oracle or universal interoperability claim. DDD-to-document projection,
then SQL/OpenAPI/Axon/Palantir bindings, must report unexpressed aggregate, lifecycle,
identity and invariant semantics separately from structural target validation.
