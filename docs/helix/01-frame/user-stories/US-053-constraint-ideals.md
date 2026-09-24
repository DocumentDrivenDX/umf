---
ddx:
  id: US-053
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
    - id: CONTRACT-040
      kind: informed_by
---

# US-053: Describe portable value bounds without claiming native enforcement

**Feature:** FEAT-005 unplaced proposal. **Requirements:**
FR-3, FR-20, FR-21, FR-28; NFR-50. **Priority and backlog position:** owner decision
pending. **Status:** design proposal; no admission or implementation claim.

## Story

**As a** data platform engineer, **I want** to declare allowable values, bounds
and record rules with visible interpretation status, **So that** a downstream
constraint engine can distinguish portable author intent from native evidence
before deciding what it can enforce.

## Context

CONTRACT-040 gives fields maximum length and numeric width/precision, but no
minimum length, value set or range. A graph engine may enforce those declarations;
UMF only describes and projects them. CONTRACT-048 proposes the semantic split and
the evidence needed before any candidate is admitted to core. It does not change
the existing facet meaning or turn DDD invariants into generic core assertions.

## Walkthrough

1. The author declares a bounded string or numeric value and, separately, an
   expression rule where the portable value vocabulary cannot state the rule.
2. The consumer inspects each declaration's meaning and whether it is interpreted
   or preserved without interpretation.
3. The author chooses a native target. Strict projection blocks lost obligations;
   report projection returns source-qualified residuals.
4. The consumer reimports the candidate with its report and verifies both
   authored-intent recovery and recovery of the original native archive.

## Acceptance Criteria

- **US-053-AC1:** Given a proposed allowed-value set, numeric range or minimum
  length, when inspected, then CONTRACT-048 meaning is available independently of
  any native CHECK, enum annotation or statistics.
- **US-053-AC2:** Given a range over a temporal value whose order has not been
  defined, when validated, then the declaration is refused without inventing a
  timezone or comparator.
- **US-053-AC3:** Given a pattern with an unrecognized dialect or version, when
  inspected, then its source is retained and its interpretation status is unknown,
  not a portable pattern assertion.
- **US-053-AC4:** Given a record-level expression rule, when inspected, then its
  language/version and preserved-but-uninterpreted status are visible without
  claiming UMF executed the rule.
- **US-053-AC5:** Given a target unable to carry an authored obligation, when
  strict projection is requested, then it blocks without a partial candidate.
- **US-053-AC6:** Given the same input in report mode, when a candidate is safe,
  then every lost obligation has a path-qualified residual and retained source.
- **US-053-AC7:** Given an ideal/native/ideal round trip with its report, when
  reimported, then authored intent is recovered or explicitly residualized.
- **US-053-AC8:** Given a native/ideal/native round trip, when exported, then
  all native bytes and unknown refinements outside the ideal claim are recoverable.
- **US-053-AC9:** Given an Avro enum or Parquet ENUM annotation, when classified,
  then Avro symbol order/default and Parquet's missing symbol list remain native
  distinctions; neither observation invents authored allowed values.
- **US-053-AC10:** Given a PostgreSQL `NOT VALID` or SQL Server disabled/untrusted
  CHECK, when classified, then it cannot be reported as proof that existing rows
  satisfy the author's rule.
- **US-053-AC11:** Given at least two useful, independently evidenced priority
  mappings for a candidate, when admission is recorded, then it is distinguished
  from all-five delivery and native-equivalence graduation.
- **US-053-AC12:** Given a legacy document or colliding unknown member, when a
  future version migration and rollback run, then no old content is silently
  reinterpreted or lost.

## Edge Cases

An absent or null value follows Nullability; a value bound applies only to a
present value. Numeric strings that round at the host boundary cannot be used as
exact bounds. Regex equivalence across dialects is never inferred. Native CHECK
expressions may depend on collation, casts, functions and three-valued logic;
classification must retain these refinements and may decline interpretation.

## Test Scenarios

| Scenario | Criteria | Expected result |
| --- | --- | --- |
| String `""` with minimum length 1 | AC1, AC5–7 | Present empty value fails the ideal; a target without a proved bound blocks or reports residual. |
| Integer 10 with exclusive upper bound 10 | AC1, AC5–7 | Value fails; native CHECK candidate needs a separately qualified comparator and value oracle. |
| Temporal `2026-09-24T10:00` without a declared temporal ordering | AC2 | Refusal before projection. |
| Avro symbols `['z','a']`, default `a` | AC9 | Ordered symbols and resolution default remain in Avro; an unordered authored set cannot replace them. |
| Parquet UTF-8 ENUM annotation | AC9 | No allowed-symbol list is inferred. |
| PostgreSQL CHECK `NOT VALID`; SQL Server CHECK `is_disabled=1` | AC10 | Observations remain visible and cannot certify old rows. |
| POSIX regex and opaque versioned row predicate | AC3–4 | Preserved with language/version; no cross-dialect or UMF execution claim. |

## Dependencies

FEAT-005 amendment and owner placement; CONTRACT-040 facet and scalar semantics;
CONTRACT-048 proposal; the temporal-facet decision for temporal ranges. An
implementation story should be scheduled only after candidate admission evidence
and a versioned migration decision. The physical `umf.binding` index vocabulary
does not supply logical value constraints.

## Out of Scope

UMF evaluation of row values, constraint-engine execution, SQL data validation,
general SQL expression parsing, regex translation and core promotion by this
proposal alone.
