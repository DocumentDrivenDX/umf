# Frame

Translate the product vision into requirements, features, user stories,
and project concerns using the installed HELIX templates.

The [draft vision](../00-discover/product-vision.md) now provides product
direction. [Discovery input](../00-discover/vision-input.md) records candidate
capabilities, boundaries, serialization direction, and open decisions.

The three primary product documents are:

- [Product Vision](../00-discover/product-vision.md): direction and positioning.
- [Product Requirements](prd.md): 33 original functional requirements plus
  five bootstrap additions and FR-39–FR-41 for browser execution, DDD, and
  programmatic metadata consumers, with stable IDs and acceptance sketches.
- [Cross-Cutting Requirements](cross-cutting-requirements.md): all 50 original
  constraints, preserving their numbering and mandatory/advisory wording.

[Project Concerns](concerns.md) maps the constraints to downstream areas without
duplicating their normative text. TypeScript/browser and Bun tooling direction
is recorded in architecture and ADR-002; semantic implementation neutrality remains.

The owner selected the JSON Schema + Protobuf vertical slice as the first
spike. Exact versions, feature subsets, contracts, feature specs, and story-level
acceptance criteria remain to be developed. See the
[design phase](../02-design/README.md) and [test phase](../03-test/README.md).

The latest core amendment is [FEAT-005](features/FEAT-005-core-ideals.md), with
US-040–US-044 for field, nullability, cardinality, facets and key. FR-3 ideal
admission is separate from FR-28 native-equivalence graduation.


The [domain-pack roadmap](domain-pack-roadmap.md) maps owner-selected domain
schemas into FEAT-009 shared catalog behavior, FEAT-010–FEAT-025 domain outcomes,
and US-060–US-076 acceptance journeys. The artifacts remain draft planning;
exact contracts, per-story designs/test plans and evidence govern build readiness.
