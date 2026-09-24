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

**As a** data platform engineer, **I want** to declare named primary and alternate
keys with stable identities separately from observed indexes, **So that** records
and future relationships can identify the intended tuple without treating a native
constraint as author intent.

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
- **US-044-AC11:** Given several named keys on one record, when validated and
  selected, then each has a unique stable ID and name, no more than one is marked
  primary, alternate keys retain their own uniqueness assertion, and references
  can target a key by ID across name and key-list order changes. Missing or duplicate key IDs,
  names, field sets, and an ambiguous default selection block with paths.
- **US-044-AC12:** Given exact values for a validated key, when encoded using
  `umf-key-tuple-v1`, then the normative fixture bytes match in Bun and Chromium:
  scale-2 lexical `1.2` and `1.20` agree without rounding; U+00E9 differs from
  U+0065 U+0301; empty string encodes while absence blocks; float and temporal
  components block before any partial bytes escape.
- **US-044-AC13:** Given one primary and multiple alternate keys, when projected
  to PostgreSQL or SQL Server, then each key has a distinct outcome and native
  constraint observation; when projected to TableSpec, Avro or Parquet, any
  unexpressed alternate uniqueness or stable key ID is residualized in report
  mode and blocks strict mode. Reimport without retained author provenance never
  invents these key identities.

## Edge Cases

Require singular present key components and compatible equality. The earlier
singular `Record.key` proposal has no published schema surface; an opaque legacy
`key` or `keys` member requires an explicit migration with rollback. Native
primary/unique observations cannot invent author identity intent; Avro/Parquet
retain a separate residual for every authored key.
Conflicting authored/classified claims are diagnosed, not silently overwritten.
Malformed ideals block; unknown versions remain recoverable without interpretation.

## Test Scenarios

A SQL Server filtered unique index admits rows outside its predicate and a disabled unique index admits duplicates; neither is exact key enforcement.
Each scenario includes strict/report pairs, both UMF serializations, source-copy
isolation, native recovery and browser diagnostics. Existing negative oracles are
regressions to preserve, not new passing ideal-admission evidence.
The design vectors in `fixtures/key/tuple-encoding-v1.json` pin the exact encoding
and refusal cases; core execution evidence is recorded in the Key core acceptance record;
current binding and conformance evidence is linked below.

## Dependencies

FEAT-005 IDEAL-01–IDEAL-05; FR-3/20/21/28; CONTRACT-040; TD-044.
US-043 must complete its five-system gate before this concept implementation.

## Out of Scope

Automatic native replacement, DDD lifecycle, OWL, physical encodings and default
execution. No completion claim is made by authoring this story.

### Ownership prerequisite for AC1/11

Core 0.6.0 uses explicit Record `members` to validate key ownership. A key's
component must resolve to a required singular Field in that Record; unresolved,
shared-owner, cross-record and duplicate membership references reject with paths.
Native columns, DDD properties and generic reference roles cannot supply implicit
ownership. Legacy `key`, `keys` and `members` collisions survive migration and
rollback without being adopted as author assertions.


## Key admission and qualified five-system delivery evidence

Key ideal admission and five-system delivery now pass as separate results.
PostgreSQL and SQL Server provide useful nonempty stored-value enforcement
witnesses; TableSpec, Avro and Parquet retain explicit identity residuals.
The gate covers 118 authored cases, 85 emitted targets, 170 ideal recoveries,
178 native recoveries and twenty shared identity/ownership conflict refusals.
Fresh native/browser qualification, negative evidence checks, core tests,
typechecking and schema/package audits pass. Native equivalence remains
unclaimed; source payloads and unknown semantics remain attached. See the
[Key gate admission record](../../04-build/evidence/key-gate-admission.md) for commands, versions, profiles and limits.
