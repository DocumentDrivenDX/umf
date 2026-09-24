---
ddx:
  id: US-046
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

# US-046: Bind one logical model to physical targets

## Story

**As a** model author, **I want** separate versioned physical bindings,
**So that** PostgreSQL and Delta can store the same logical model differently.

## Context

FR-43 keeps storage out of logical DDD and core relationships. CONTRACT-042
owns the exact binding document and fidelity report.

## Walkthrough

1. Author one logical model and two target bindings.
2. Inspect each target's table, partition, field and relationship choices.
3. Project with strict/report policy and inspect losses.
4. Reopen both bindings and recover the original logical and native sources.

## Acceptance Criteria

- **US-046-AC1:** Given one logical model and two bindings, when either is
  inspected, then the model's element IDs and meaning remain unchanged.
- **US-046-AC2:** Given column/embedded field choices and edge/FK/junction/inline
  relationship choices, when inspected, then each is attributable to its target
  binding and version.
- **US-046-AC3:** Given a stale model identity, unresolved path or conflicting
  target choice, when validated, then projection blocks atomically with a path.
- **US-046-AC4:** Given a choice the target cannot express, when strict mode
  runs, then the candidate is absent and the source is retained.
- **US-046-AC5:** Given the same safe choice in report mode, when projected,
  then its physical meaning remains in a source-linked residual.
- **US-046-AC6:** Given binding→native→binding with its report, when recovered,
  then each authored choice or explicit residual returns.
- **US-046-AC7:** Given native→binding→native, when recovered, then unclaimed
  native text or bytes and unknown extension fields match the original archive.
- **US-046-AC8:** Given PostgreSQL, SQL Server, Delta, Iceberg and Parquet
  targets, when support is published, then direction, version, subset and
  exact/approximate/residual outcomes are explicit.
- **US-046-AC9:** Given a binding version change, when migrated and rolled
  back, then old and new physical choices and unknown content are recoverable.
- **US-046-AC10:** Given a consumer asking which fields are filterable or
  sortable, when metadata is selected, then the answer comes from the target
  binding's capabilities and never from a logical field definition.

## Edge Cases

An embedded path is target-specific and does not imply document support in
every target. One binding's edit cannot mutate a sibling binding or model.

## Test Scenarios

Bind order/customer/product to PostgreSQL and Delta with different storage;
exercise stale references, unknown fields, strict/report and both recoveries.
Tests cite each `@covers US-046-ACn`.

## Dependencies

FR-43; FEAT-006; CONTRACT-005/042; TD-046; US-045 where relationship choices apply.

## Out of Scope

Core physical storage, data migration, query execution and inferred indexes.
