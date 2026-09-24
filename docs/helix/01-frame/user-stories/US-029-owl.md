---
ddx:
  id: US-029
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-029: OWL ontology interchange

As an ontology consumer I need native OWL meaning retained across editable UMF round trips.

## Acceptance Criteria

- AC1: Versioned extension package and JSON Schema; RDF-mapped source recovery,
  copied edits, scoped blank nodes and unknown content retention.
- AC2: Programmatic ontology headers, imports, declarations, axioms and expressions;
  preserve punning, axiom annotations, property chains and exact literals.
- AC3: RDF/XML, Turtle, Functional, Manchester and OWL/XML representations must have
  explicit support inventories and robust independent native round-trip evidence.
- AC4: Qualify OWL 2 DL/Full and EL/QL/RL profiles separately. Reasoning, consistency
  and entailment require versioned native expected-vector evidence and explicit
  import resolution, with no ambient network fetches.
- AC5: Browser parity, metadata consumers and cross-system projections must preserve
  open-world meaning and expose losses; OWL cardinality is not a required form field.

Initial work covers Turtle graph preservation and declared headers only. All other
acceptance work remains required; successful RDF parsing is not OWL conformance.

Implemented portions of AC2 now include local expressions, axiom annotations,
negative/n-ary assertion views and explicit declaration roles. Shared IRIs retain
separate roles, and anonymous type assertions remain distinct from named declarations.
This does not complete structural parsing, declaration/profile consistency or AC2.
