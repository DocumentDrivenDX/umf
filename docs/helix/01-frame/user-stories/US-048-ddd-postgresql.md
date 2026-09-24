---
ddx:
  id: US-048
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
    - id: US-046
      kind: informed_by
    - id: US-047
      kind: informed_by
---

# US-048: Generate PostgreSQL DDL from DDD and binding

## Story

**As a** model author, **I want** reviewable PostgreSQL DDL from an authored
domain model and physical binding, **So that** target structure follows one
declared source and every missing semantic obligation is visible.

## Context

FR-44 and CONTRACT-043 govern this directed projection. CONTRACT-005 preserves
DDD meaning; CONTRACT-015 preserves native PostgreSQL sources.

## Walkthrough

1. Select the authored model and PostgreSQL binding.
2. Generate tables, relationship storage and indexes under explicit policy.
3. Inspect target DDL and residuals, then import it through the native adapter.
4. Recover authored and native sources independently.

## Acceptance Criteria

- **US-048-AC1:** Given the authored order/customer/product graph, when
  projected, then one bound table per element and declared relationship/index
  structures appear in a complete DDL candidate.
- **US-048-AC2:** Given aggregate boundaries or opaque invariants, when
  projected, then their unenforced meaning is reported separately.
- **US-048-AC3:** Given heterogeneous sources, unsupported index kinds or
  unrepresentable embedded paths, when strict mode runs, then no DDL candidate
  is emitted and the source remains.
- **US-048-AC4:** Given the same safe cases in report mode, when projected,
  then each loss is a source-linked residual beside complete DDL.
- **US-048-AC5:** Given generated DDL, when imported, deparsed and round-tripped
  by `umf.postgresql`, then its declared schema survives within the published
  subset and independent PostgreSQL 17 accepts the supported cases.
- **US-048-AC6:** Given DDD+binding→DDL→retained UMF, when recovered, then
  authored relationship, storage and index meaning returns or is residualized.
- **US-048-AC7:** Given native DDL→UMF→native DDL, when recovered, then
  unclaimed source bytes and unknown content match the retained archive.
- **US-048-AC8:** Given malformed identifiers, stale bindings or unsafe
  expressions, when generation runs, then it blocks atomically with paths.
- **US-048-AC9:** Given generated output in Bun and Chromium, when compared,
  then DDL/report meaning agrees without browser host APIs or network access.
- **US-048-AC10:** Given a version migration and rollback, when replayed,
  then the original authored model, binding and native archives remain recoverable;
  published support names its PostgreSQL version and subset.

## Edge Cases

Partition clauses require an explicit bound family and valid target shape.
Generated SQL is reviewable schema output, not an executed deployment or query.

## Test Scenarios

The checked-in DDL corpus includes a reified association with fields and all
declared PostgreSQL index forms. Native checks run in isolated PostgreSQL 17;
tests cite each `@covers US-048-ACn`.

## Dependencies

FR-44; FEAT-006; CONTRACT-005/015/041/042/043; TD-048; US-045–047.

## Out of Scope

Database migration, per-entity SQL views, query execution and resolver behavior.
