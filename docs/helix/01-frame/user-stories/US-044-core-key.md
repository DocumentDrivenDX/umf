---
ddx:
  id: US-044
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

# US-044: Core key ideal

## Story

**As a** data platform engineer, **I want** to assert record identity separately from observed indexes,
**So that** I can inspect what each target preserves before using its output.

## Context

FEAT-005 IDEAL-01–IDEAL-05 apply to this one concept. CONTRACT-040 owns the
meaning, binding rules and residual contract. Existing native archives and
scalar classifications remain evidence inputs, not proof of this new ideal.

## Walkthrough

1. Author this ideal on a retained model and inspect its meaning as a consumer.
2. Choose a priority target and inspect the strict projection outcome.
3. Where loss exists, choose report mode and inspect the retained assertion.
4. Reimport the target with its report; recover the ideal or its explicit residual.
5. Recover the original native archive and verify unknown content remains intact.

## Acceptance Criteria

- **US-044-AC1:** Given an authored key ideal, when the consumer reads the
  model, then it obtains the CONTRACT-040 meaning without decoding native payloads.
- **US-044-AC2:** Given native input with unknown refinements, when classified,
  then the original native content remains recoverable without author intent being invented.
- **US-044-AC3:** Given a non-exact binding, when strict mode is selected, then
  the projection blocks with a path-qualified reason and no partial candidate.
- **US-044-AC4:** Given the same binding, when report mode is selected, then
  every lost obligation is an explicit residual associated with retained source.
- **US-044-AC5:** Given an ideal/native round trip, when reimported with its
  retained report, then the authored ideal is recovered or explicitly residualized.
- **US-044-AC6:** Given a native/ideal round trip, when recovered, then native
  text or bytes outside the ideal's claim match the retained archive exactly.
- **US-044-AC7:** Given SQL Server filtered and disabled unique indexes accepting duplicate rows,
  when exactness is requested, then neither index can satisfy unconditional ideal key enforcement.
- **US-044-AC8:** Given all five priority bindings, when verified, then Bun,
  native oracles and Chromium agree within published versions/subsets and limitations.
- **US-044-AC9:** Given admission evidence from two priority bindings, when
  status is published, then it does not claim all-five completion or native equivalence.
- **US-044-AC10:** Given a legacy document or colliding unknown member, when
  migrated and rolled back, then no old assertion is silently reinterpreted or lost.

## Edge Cases

Require singular present key components and compatible equality. Native primary-key observations cannot invent author identity intent; Avro/Parquet retain key residuals.
Conflicting authored/classified claims are diagnosed, not silently overwritten.
Malformed ideals block; unknown versions remain recoverable without interpretation.

## Test Scenarios

A SQL Server filtered unique index admits rows outside its predicate and a disabled unique index admits duplicates; neither is exact key enforcement.
Each scenario includes strict/report pairs, both UMF serializations, source-copy
isolation, native recovery and browser diagnostics. Existing negative oracles are
regressions to preserve, not new passing ideal-admission evidence.

## Dependencies

FEAT-005 IDEAL-01–IDEAL-05; FR-3/20/21/28; CONTRACT-040; TD-044.
US-043 must complete its five-system gate before this concept implementation.

## Out of Scope

Automatic native replacement, DDD lifecycle, OWL, physical encodings and default
execution. No completion claim is made by authoring this story.
