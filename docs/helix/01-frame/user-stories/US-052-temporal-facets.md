---
ddx:
  id: US-052
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: US-043
      kind: informed_by
---

# US-052: Author temporal value meaning

**Feature:** FEAT-005. **PRD requirements:** FR-3, FR-20, FR-21, FR-28.
**Priority:** unplaced by owner. **Status:** design proposal, not implemented.

## Story

**As a** schema author serving a data engine, **I want** to state whether a
timestamp is an instant or civil value, how a time of day is interpreted, and
its fractional precision and offset-retention obligation, **so that** a
consumer can choose storage without treating a type name as complete meaning.

## Context

CONTRACT-001's `time` and `timestamp` scalar families leave zone, UTC
conversion and comparison open. CONTRACT-040's current facets carry no
temporal parameters. The engine executes storage and comparisons under
NFR-50; UMF describes meaning and reports native loss. CONTRACT-047 proposes
the semantics and qualified bindings. This story does not move the existing
field → nullability → cardinality → facets → key → relationship gate.

## Walkthrough

1. The author declares a temporal facet on a `time` or `timestamp` Field.
2. A reader inspects that authored meaning without inferring it from a native
   column type or its scalar-family label.
3. The author chooses a target and receives an exact, approximate or residual
   outcome for each temporal obligation.
4. Strict mode blocks a lossy candidate; report mode retains the assertion and
   source-qualified losses. Reimport recovers the authoring receipt or residual.

## Acceptance Criteria

- **US-052-AC1:** Given a timestamp Field with authored instant or civil
  meaning, when read by a consumer, then the two meanings remain distinct and
  no timezone is inferred from `scalarType: timestamp` alone.
- **US-052-AC2:** Given a time-of-day Field, when projected, then civil,
  UTC-adjusted and offset-bearing time are distinct; no date-free time is
  reported as an instant.
- **US-052-AC3:** Given a declared fractional-second precision and required
  original offset, when a native carrier rounds or discards either, then strict
  mode blocks with no partial candidate and report mode names each loss.
- **US-052-AC4:** Given PostgreSQL, SQL Server, Avro, Parquet and TableSpec
  bindings, when each is assessed against its pinned version and subset, then
  actual native semantics and refinements determine exactness; a type spelling
  alone does not establish an authored facet.
- **US-052-AC5:** Given an authored ideal projected to native and reimported
  with its retained report, then the exact authored facet is recovered or each
  unrecovered obligation is explicit; original native text or bytes and unknown
  content remain recoverable in the reverse direction.
- **US-052-AC6:** Given two evidenced useful priority-system bindings, when
  admission is assessed, then it is recorded separately from all-five delivery
  and native-equivalence graduation; without that evidence the proposal remains
  extension-owned and no core member is reserved.
- **US-052-AC7:** Given a legacy document with unknown content at the proposed
  facet path, when migration and rollback are exercised, then no preexisting
  content is silently reinterpreted or lost.
- **US-052-AC8:** Given a temporal Field in a Key, when evaluated, then
  CONTRACT-040's temporal-key block still applies until a separate equality
  and canonical-encoding decision is approved.

## Edge Cases and Test Scenarios

| Scenario | AC IDs | Expected outcome |
| --- | --- | --- |
| Same wall-clock timestamp at two offsets | 1, 3 | Instant and civil meanings differ; an original-offset requirement cannot project exactly to PostgreSQL `timestamptz`. |
| `time` at 23:30 with `+02:00` | 2 | UTC-adjusted clock time is 21:30, but no date or unique instant follows. |
| Seven fractional digits | 3, 4 | SQL Server `datetime2(7)` can carry the declared precision; PostgreSQL 17 `timestamp(p)` cannot carry all digits. |
| SQL Server legacy `datetime` | 3, 4 | Its stepped rounding is reported; the label does not imply millisecond-exact values. |
| TableSpec `DATETIME` and `TIMESTAMP` | 4 | Both labels remain native; no instant/civil distinction is inferred without an explicit checked profile. |
| Classified native temporal type | 5 | Provenance is observed, never authored; all native qualifiers and unknown fields survive. |

## Dependencies and Scope

FEAT-005 IDEAL-02–IDEAL-05, CONTRACT-001, CONTRACT-040, CONTRACT-047,
US-043 and the owner-managed core backlog. Temporal-key equality, executable
data conversion, timezone databases, SQL query behavior, and schema/runtime
enforcement are outside this story.
