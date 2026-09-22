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


### Qualified TableSpec facet binding

The [acceptance record](../../../../fixtures/validation/tablespec-facets-acceptance-evidence.json) covers experimental core 0.5.0 TableSpec facet
classification, authored projection, strict/report loss handling and verified
native/ideal recovery. It supersedes the earlier classification/projection
checkpoints' full-refresh limitation; their original evidence remains historical.

All 80 compatibility-refresh steps pass, including 438 priority tests,
47,122 assertions across 139 files, type checks,
264 schemas, 43 extension packages, browser build and qualified native/browser
checks for existing Field, Nullability and Cardinality bindings. Their three
separate conformance gates pass after evidence revalidation. This is the core and
five-priority-system scope, not a new full-repository baseline.

TableSpec evidence uses commit 647e8e566ad78b864282ec65c0b0b2237aa63084,
Pydantic 2.11.10, JSONSchema 4.25.1, Spark 4.0.1, GX 1.15.1, Java 21.0.2 and
Chromium 148. The browser matrices cover 1,216 native classification cases,
80 explicit-suite cases and 540 authored projection cases. Native checks validate
331 emitted documents and 104 facet representation claims; 11 emitted suite
rules undergo 63 value checks and two tolerance controls. Recovery preserves
native text/archives and full authored ideals, including unknown qualifiers.

Profiles keep declarations, raw/normalized generated schemas, baseline GX,
explicit GX suites and ingest casts separate. Explicit suites support zero length
and canonical widths within the signed-32-bit Spark carrier. Decimal precision
and scale remain consumer-specific. Missing facets do not inherit native defaults.
The binary64-to-binary32 narrowing counterexample remains an exact-input failure.
Unknown detail, unsupported encodings, shape conflicts and conversion losses
remain explicit. This does not qualify whole-pipeline execution or write policy.

This closes the TableSpec facet binding only. PostgreSQL, SQL Server, Avro and
Parquet facet bindings, the distinct facet ideal admission/five-system delivery
gate, and Key remain required. Native-equivalence graduation is not claimed.


### Qualified PostgreSQL facet binding

The [acceptance record](../../../../fixtures/validation/postgresql-facets-acceptance-evidence.json) qualifies experimental core 0.5.0 PostgreSQL
facet classification, authored projection, strict/report residuals and retained
native/ideal recovery. It supersedes the earlier checkpoints' full-refresh
limitation; their original counts and fingerprints remain historical.

All 82 compatibility-refresh steps pass, including 466 priority tests,
49,198 assertions across 148 files, type checks,
268 schemas, 44 extension packages, browser builds and existing five-system
Field/Nullability/Cardinality native/browser workflows. Accepted TableSpec facets
are revalidated. The three prior concept gates pass after evidence refresh.
The initial PostgreSQL aggregate failed after its native stages passed because
its metadata reader expected the constraint proof's server version at the wrong
path. The reader was corrected; typechecking and the affected aggregate were
rerun. Earlier successful commands were retained because their implementation
inputs were unchanged. The failed attempt and adjustment are archived in the
acceptance record. This is the core and five-priority-system scope, not a
full-repository baseline.

Five native workflow stages use PostgreSQL 17.4/UTF8 and the qualified
little-endian Datum64 layout. The projector matrix has 232 cases: 145 emitted
schemas and 87 blocks. Emitted schemas pass 479 independent native value probes
with 166 expected rejections under an adversarial operator search path. All 145
schemas undergo composed classification and both retained recoveries; 66 recover
the authored facets and 79 retain explicit residuals. Inferred native refinements
remain separate from author intent.

All six Chromium 148 workflows pass against the public bundle and optional pinned
PostgreSQL WASM runtime. Public classification covers 231 cases with 157 exact
native recoveries and 74 blocks; projection covers 232 cases with 290 ideal
recoveries plus comment controls. Browser execution has no host globals or
external requests. Typed operation and extension schemas cover both directions.

Qualification is limited to supported direct scalar carriers and verified CHECK
expressions with explicit stored/new non-null scope. NOT VALID, unknown/custom
predicates, scalar-family conversion, character NUL/padding and input rounding
remain native refinements or residuals. Binding ceilings are length 10485760,
checked integer width 1024 and decimal precision 1000. Arbitrary SQL expression
conversion, source authentication and composition with earlier nullability or
cardinality operations are not claimed. The float-narrowing case remains an
exact-input failure. Native payloads are never removed by core labels.

This closes the PostgreSQL facet binding only. SQL Server, Avro and Parquet facet
bindings, the separate facet ideal admission/five-system delivery gate, and Key
remain required. No native-equivalence graduation is claimed.


### Qualified SQL Server facet binding

The [acceptance record](../../../../fixtures/validation/sqlserver-facets-acceptance-evidence.json) qualifies experimental core 0.5.0 SQL Server
2022 16.0.4295.3 facet classification, authored projection, strict/report losses
and both retained recovery directions. It supersedes earlier checkpoints' pending
refresh status; their counts and fingerprints remain historical.

All 84 refresh steps pass, including 492 core/priority tests with
51,613 assertions across 156 files, typechecking,
271 schemas, 45 packages, browser builds and five-system native/browser checks.
Field, Nullability and Cardinality gates pass after evidence revalidation; accepted
TableSpec and PostgreSQL facets remain qualified. A metadata-only browser evidence
label was corrected before its stage ran, with a separate typecheck. Runtime
behavior and assertions were unchanged; the adjustment is archived.

Four native stages and six Chromium 148 workflows cover discovery, CHECK
association, 238 projection cases (145 emitted, 93 blocked), 27 projection value
probes, and composed native/ideal recovery. The 145 emitted cases recover authored
facets directly in 57 cases and retain explicit residuals in 88. Browser composition
passes 290 ideal and 290 native-view recoveries, two full-catalog recoveries and
24 scoped association cases. Extra native refinements do not become author intent.

Qualification covers direct supported scalar carriers, bounded CHECK expressions,
explicit non-null stored/ordinary-checked-write scopes and separately identified
logical Fields. Disabled, untrusted, replication-exempt, cross-column, Unicode,
padding, alias/computed and input-conversion distinctions stay explicit. The only
exact string bound inferred is the qualified zero-byte variable-string domain.
Arbitrary SQL conversion, complete inventory, source authentication and composition
with earlier native availability/container operations are not claimed.

This completes the SQL Server facet binding only. Avro, Parquet, the separate
facet ideal admission/delivery gate and Key remain required. Native equivalence
is unclaimed; native payloads and unknown content remain recoverable.
