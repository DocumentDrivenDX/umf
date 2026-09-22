---
ddx:
  id: US-043
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
    - id: US-042
      kind: informed_by
---

# US-043: Core facets ideal

## Story

**As a** data platform engineer, **I want** to state value bounds without hiding native approximation,
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

- **US-043-AC1:** Given an authored facets ideal, when the consumer reads the
  model, then it obtains the CONTRACT-040 meaning without decoding native payloads.
- **US-043-AC2:** Given native input with unknown refinements, when classified,
  then the original native content remains recoverable without author intent being invented.
- **US-043-AC3:** Given a non-exact binding, when strict mode is selected, then
  the projection blocks with a path-qualified reason and no partial candidate.
- **US-043-AC4:** Given the same binding, when report mode is selected, then
  every lost obligation is an explicit residual associated with retained source.
- **US-043-AC5:** Given an ideal/native round trip, when reimported with its
  retained report, then the authored ideal is recovered or explicitly residualized.
- **US-043-AC6:** Given a native/ideal round trip, when recovered, then native
  text or bytes outside the ideal's claim match the retained archive exactly.
- **US-043-AC7:** Given binary64 1.0000000000000002 narrowed to binary32 1.0,
  when exactness is requested, then the changed value cannot satisfy exactness despite both scalar families being float.
- **US-043-AC8:** Given all five priority bindings, when verified, then Bun,
  native oracles and Chromium agree within published versions/subsets and limitations.
- **US-043-AC9:** Given admission evidence from two priority bindings, when
  status is published, then it does not claim all-five completion or native equivalence.
- **US-043-AC10:** Given a legacy document or colliding unknown member, when
  migrated and rolled back, then no old assertion is silently reinterpreted or lost.

## Edge Cases

Test supplementary Unicode against SQL Server UTF-16 bounds, decimal rounding, signedness and width boundaries; unknown qualifiers survive.
Conflicting authored/classified claims are diagnosed, not silently overwritten.
Malformed ideals block; unknown versions remain recoverable without interpretation.

## Test Scenarios

The value 1.0000000000000002 narrows to 1.0 through binary32; a request for exactness must fail despite matching float families.
Each scenario includes strict/report pairs, both UMF serializations, source-copy
isolation, native recovery and browser diagnostics. Existing negative oracles are
regressions to preserve, not new passing ideal-admission evidence.

## Dependencies

FEAT-005 IDEAL-01–IDEAL-05; FR-3/20/21/28; CONTRACT-040; TD-043.
US-042 must complete its five-system gate before this concept implementation.

## Out of Scope

Automatic native replacement, DDD lifecycle, OWL, physical encodings and default
execution. No completion claim is made by authoring this story.


### Facet core-task acceptance

The [core acceptance record](../../../../fixtures/validation/facet-core-acceptance-evidence.json) supersedes the candidate-only checkpoint's
public-runtime limitations. Core 0.5.0 now validates declared facets, explicitly
migrates/rolls back 0.4.0 collisions, authors/inspects known and partial bounds,
verifies source-bound receipts and follows faceted item/value metadata in selection.
Kind/record-type v4, Nullability v3 and Cardinality v2 operations retain prior
receipt versions. Existing Cardinality native bindings explicitly refuse 0.5.0
rather than apply their 0.4.0 representation rules to facet declarations.

All 78 refresh steps pass: 420 priority tests / 39,482
assertions across 135 files, typechecking, 261 schemas, 42 extension
packages, browser build and qualified native/browser checks for existing Field,
Nullability and Cardinality bindings. Their three separate gates subsequently pass.
The scope is core plus the five priority systems, not a new full-repository baseline.

Chromium 148 checks 99 public validation cases, 62 valid-document recoveries,
18 migration/rollback recoveries, eight facet-author receipts, eight versioned
prior-operation receipts, four selection receipts and 15 refusals, with no host
globals or external requests. The separate facet-local matrix retains 198 metadata
recoveries and 18 exact-token checks. Reproduce with `bun scripts/core-facet-operations-browser.ts`
and `bun scripts/core-facet-browser.ts` using the configured Chromium executable.

This closes only the facet core task. All five native facet bindings, useful ideal
admission, the facet delivery gate and key remain required. No native facet
enforcement, general row conversion or native equivalence is claimed. The next
binding is TableSpec under the declared schema/runtime profiles; native refinements
and unknown numeric tokens must stay attached to any classification/projection.
