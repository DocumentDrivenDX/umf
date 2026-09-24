---
ddx:
  id: US-047
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
    - id: US-046
      kind: informed_by
---

# US-047: Declare physical indexes in a binding

## Story

**As a** metadata consumer, **I want** declared indexes and their target
limitations visible in a physical binding, **So that** I can reason about
filter and sort capabilities without changing logical field meaning.

## Context

FR-43 and CONTRACT-042 own the physical-only rule. An observed PostgreSQL
catalog index under CONTRACT-015 is native evidence, not authored intent.

## Walkthrough

1. Declare indexes against ordered storage columns or embedded paths.
2. Inspect target-specific capabilities, predicate language/version and losses.
3. Generate or refuse target indexes under strict/report policy.
4. Recover the binding and original native archive.

## Acceptance Criteria

- **US-047-AC1:** Given a declared index, when inspected, then its name,
  kind, ordered targets, uniqueness, optional includes and opaque predicate
  provenance are available only through the binding.
- **US-047-AC2:** Given a logical field alone, when queried for index
  capability, then no filterability or sortability is inferred.
- **US-047-AC3:** Given a document path index, when projected to PostgreSQL,
  then the selected expression and path are checked and retained in the report.
- **US-047-AC4:** Given an unsupported index kind, when strict mode runs,
  then projection blocks without a partial candidate.
- **US-047-AC5:** Given the same safe binding in report mode, when projected,
  then every unsupported kind, predicate or include receives a residual.
- **US-047-AC6:** Given binding→native→binding with report, when recovered,
  then authored index intent or an explicit residual returns.
- **US-047-AC7:** Given native→binding→native, when recovered, then untouched
  index syntax, native refinements and unknown bytes match the archive.
- **US-047-AC8:** Given PostgreSQL, SQL Server, Delta, Iceberg and Parquet,
  when tested, then each index kind has a versioned exact/approximate/residual
  outcome; catalog observation never invents author intent.
- **US-047-AC9:** Given invalid ordered targets or predicate metadata, when
  validated, then the binding is rejected with paths and no target output.
- **US-047-AC10:** Given a binding migration and rollback, when replayed,
  then index declarations and unknown content remain recoverable.

## Edge Cases

The `unique` kind and uniqueness flag cannot conflict. Partial predicates are
opaque and unenforced by UMF; generated target checks determine scoped claims.

## Test Scenarios

Use a PostgreSQL corpus covering btree/hash/gin/gist/expression/partial/unique
and a clustering residual. Check filtered SQL Server indexes and Delta/Iceberg/
Parquet losses. Tests cite each `@covers US-047-ACn`.

## Dependencies

FR-43; FEAT-006; CONTRACT-015/042; TD-047; US-046.

## Out of Scope

Logical-field index flags, query planning, performance guarantees and predicate execution.
