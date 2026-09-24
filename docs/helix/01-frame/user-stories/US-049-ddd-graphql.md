---
ddx:
  id: US-049
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: US-045
      kind: informed_by
---

# US-049: Generate GraphQL SDL from DDD and relationships

## Story

**As a** model author, **I want** GraphQL SDL from the authored model,
**So that** clients can inspect entity shapes and declared associations while
the report exposes what SDL cannot guarantee.

## Context

FR-44 and CONTRACT-044 govern this directed projection. CONTRACT-009 owns
native SDL preservation; GraphQL schema validity is distinct from execution.

## Walkthrough

1. Select the model, relationships and explicit schema-root policy.
2. Generate entity types, fields, list and nullability wrappers.
3. Inspect residuals and import the SDL in schema mode.
4. Recover authored meaning and independent native source archives.

## Acceptance Criteria

- **US-049-AC1:** Given an authored entity graph, when projected, then each
  selected entity has an object type and each declared relationship has a
  source field with the specified target-side multiplicity.
- **US-049-AC2:** Given an inverse name, when projected, then a target field
  appears; without one, no inverse field is invented.
- **US-049-AC3:** Given authored scalar and nullability ideals, when
  projected, then field wrappers reflect only supported mappings and all
  unsupported distinctions are reported.
- **US-049-AC4:** Given source-end participation bounds or heterogeneous endpoints,
  when strict mode runs, then non-exact obligations block without partial SDL.
- **US-049-AC5:** Given the same safe mapping in report mode, when projected,
  then every unexpressed obligation is residualized with source paths.
- **US-049-AC6:** Given generated SDL, when imported by `umf.graphql` in
  schema mode, then GraphQL.js and GraphQL-core accept the declared subset.
- **US-049-AC7:** Given ideal→SDL→ideal with its report, when recovered,
  then authored meaning returns or an explicit residual records the gap.
- **US-049-AC8:** Given native SDL→UMF→native SDL, when recovered, then
  unclaimed syntax bytes and unknown content match the retained archive.
- **US-049-AC9:** Given aggregate boundaries and invariants, when projected,
  then they are reported as unenforced; no resolver or query behavior is claimed.
- **US-049-AC10:** Given migration/rollback and Bun/Chromium execution, when
  verified, then originals remain recoverable, browser results agree and support
  claims name SDL/GraphQL.js/GraphQL-core versions and subsets.

## Edge Cases

Object fields may be computed in native SDL; import classification does not
invent association intent. A schema-root policy is needed for schema-mode
validation. Undirected associations require an explicit lowering rule.

## Test Scenarios

Use order/customer/product and a reified association, inverse/no-inverse,
list/nullability and heterogeneous-source cases. Tests cite each
`@covers US-049-ACn`.

## Dependencies

FR-44; FEAT-006; CONTRACT-005/009/041/044; TD-049; US-045.

## Out of Scope

Resolvers, arguments, pagination, budgets, GraphQL queries and execution.
