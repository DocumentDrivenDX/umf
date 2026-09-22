---
ddx:
  id: US-040
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
---

# US-040: Core field ideal

## Story

**As a** data platform engineer, **I want** to identify fields and structured definitions,
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

- **US-040-AC1:** Given an authored field ideal, when the consumer reads the
  model, then it obtains the CONTRACT-040 meaning without decoding native payloads.
- **US-040-AC2:** Given native input with unknown refinements, when classified,
  then the original native content remains recoverable without author intent being invented.
- **US-040-AC3:** Given a non-exact binding, when strict mode is selected, then
  the projection blocks with a path-qualified reason and no partial candidate.
- **US-040-AC4:** Given the same binding, when report mode is selected, then
  every lost obligation is an explicit residual associated with retained source.
- **US-040-AC5:** Given an ideal/native round trip, when reimported with its
  retained report, then the authored ideal is recovered or explicitly residualized.
- **US-040-AC6:** Given a native/ideal round trip, when recovered, then native
  text or bytes outside the ideal's claim match the retained archive exactly.
- **US-040-AC7:** Given a group named Order with children and a scalarType-like annotation,
  when exactness is requested, then a record definition cannot be inferred from its name, children or scalar annotation.
- **US-040-AC8:** Given all five priority bindings, when verified, then Bun,
  native oracles and Chromium agree within published versions/subsets and limitations.
- **US-040-AC9:** Given admission evidence from two priority bindings, when
  status is published, then it does not claim all-five completion or native equivalence.
- **US-040-AC10:** Given a legacy document or colliding unknown member, when
  migrated and rolled back, then no old assertion is silently reinterpreted or lost.

## Edge Cases

Field selection must distinguish a scalar member from a record definition and preserve unknown native types without inventing scalar families.
Conflicting authored/classified claims are diagnosed, not silently overwritten.
Malformed ideals block; unknown versions remain recoverable without interpretation.

## Test Scenarios

A TableSpec column named id and an Avro record member id are fields; their tables/records are structured definitions, and an organizational group is not a record.
Each scenario includes strict/report pairs, both UMF serializations, source-copy
isolation, native recovery and browser diagnostics. Existing negative oracles are
regressions to preserve, not new passing ideal-admission evidence.

## Dependencies

FEAT-005 IDEAL-01–IDEAL-05; FR-3/20/21/28; CONTRACT-040; TD-040.
This is the first new concept; contract publication precedes schema changes.

## Out of Scope

Automatic native replacement, DDD lifecycle, OWL, physical encodings and default
execution. No completion claim is made by authoring this story.

## Field acceptance evidence

US-040 passes within the binding subsets recorded in CONTRACT-040's Field
admission decision. General native-language conformance and native replacement
remain outside this story's claim.

| Criteria | Evidence |
| --- | --- |
| AC1, AC7 | Typed kind access; explicit group refusal in `tests/core-ideals/field-conformance.test.ts`; source names/opaque annotations do not assert a record |
| AC2, AC6 | Five native classification receipts, exact archive recovery and unchanged extension payload checks in the conformance suite; independent native/browser acceptance records |
| AC3, AC4 | Five paired strict/report cases retain path-qualified unknown author obligations; blocked candidates remain absent |
| AC5 | Thirty JSON/YAML ideal recoveries across five bindings, including report-mode residuals |
| AC8 | All five scoped binding acceptance records pass native and Chromium checks; the gate checks their source fingerprints |
| AC9 | CONTRACT-040 records ideal admission, qualified five-system delivery and no native equivalence as separate decisions |
| AC10 | Explicit envelope upgrade/rollback and legacy opaque kind collision recovery; core transition tests and Chromium evidence |

The gate is executable through `bun test tests/core-ideals/field-conformance.test.ts`
and `bun scripts/core-ideals/field-conformance.ts`. Its evidence is a qualified
Field result, not a completion claim for the other core ideals.
