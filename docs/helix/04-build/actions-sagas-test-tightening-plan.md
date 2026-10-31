---
ddx:
  id: umf.actions-sagas-test-tightening-plan
  type: implementation-plan
  activity: build
  status: active
  authoring:
    home: repo
  links:
    - {id: FEAT-900, kind: informed_by}
    - {id: FEAT-901, kind: informed_by}
    - {id: CONTRACT-900, kind: references}
    - {id: CONTRACT-901, kind: references}
    - {id: CONTRACT-908, kind: references}
    - {id: ADR-006, kind: references}
    - {id: STP-900, kind: informed_by}
    - {id: STP-901, kind: informed_by}
    - {id: STP-905, kind: informed_by}
    - {id: STP-906, kind: informed_by}
---

# Tighten action and saga qualification

## Scope

Implement all six findings from the owner-authorized actions/sagas alignment
review, including consolidation of overlapping tests. This is a successor to the
completed [saga implementation plan](saga-implementation-plan.md); it does not
rewrite the released 0.10.0 SDK / 0.10.4 Python cohort or its historical evidence.
The owner authorizes Sol planning/review and parallel Luna implementation.

Governing sources are [FEAT-900](../01-frame/features/FEAT-900-declarative-actions.md),
[FEAT-901](../01-frame/features/FEAT-901-saga-semantics.md),
[SD-900](../02-design/solution-designs/SD-900-declarative-actions.md),
[SD-901](../02-design/solution-designs/SD-901-saga-semantics.md),
[CONTRACT-900](../02-design/contracts/CONTRACT-900-declarative-actions.md),
[CONTRACT-901](../02-design/contracts/CONTRACT-901-transactional-action-profile.md),
[CONTRACT-908](../02-design/contracts/CONTRACT-908-saga-semantics.md),
[TD-905](../02-design/technical-designs/TD-905-saga-recovery-conformance.md),
[TD-906](../02-design/technical-designs/TD-906-author-and-assess-sagas.md), and
[STP-900](../03-test/test-plans/STP-900-declarative-actions.md),
[STP-901](../03-test/test-plans/STP-901-transactional-actions.md),
[STP-905](../03-test/test-plans/STP-905-saga-recovery-conformance.md),
[STP-906](../03-test/test-plans/STP-906-author-and-assess-sagas.md).

| Finding | Required result |
| --- | --- |
| F1 — insensitive portable oracle | A no-op edit, wrong diagnostic severity/path and unexpected diagnostics fail the verifier. |
| F2 — self-derived support claims | Representative positive action and saga assessment uses independently authored complete obligation inventories, with omission/addition/duplicate/source/identity negative controls. |
| F3 — incomplete CI impact | Shared source, root dependency locks, repair lock and action witnesses select qualification; full native action regression protects the executor used by saga AC24. |
| F4 — incomplete binary custody | Every retained host artifact is bound to the exact bytes tested, with stale/replaced-artifact refusal controls. |
| F5 — native oracle holes | Provider failures remain explicit; duplicate expected tickets refuse; one multi-step unwind consumes original outputs in reverse order. |
| F6 — executable allocation drift | Current STP mappings name actual retained witnesses and their limits; component-wide labels do not imply all-AC proof. |

## Shared Constraints

ADR-006 retains shared Rust semantics. This work strengthens qualification, not
the declaration language or execution profile. Portable assessment stays
`executionVerified:false`. No production host, new provider profile, release or
database migration is included. Unknown content, original identities and source
preservation remain required. Native assertions query provider truth separately
from coordinator history; common observation plumbing must not turn expected
values into projections of the system under test.

The existing module map and `bun run check:rust-boundaries` are the baseline
gate. New shared helpers stay in scripts/tests; no host APIs enter browser-facing
semantics. Preserve allowed/forbidden import controls and existing baselines.
Inspect the existing qualified boundary baseline at source `96230e0e` and its
docs-only successor `f98d650a5`; this is not a fresh run against the concurrent
test edits. Refresh the inventory and run the full boundary command after all
changes at integration; use the same command in CI. Existing formal
model/transition evidence remains historical;
this test-only work does not change formal transition semantics. A discovered
runtime correction requires impact review under TD-905's recheck triggers.

Formal context disposition: `formal/publish_protocol.py` includes STP-905 and
STP-906 in its exact specification-source hash roster. Updating these test
allocations therefore invalidates verification of the old report against the
current full working-tree context, even though no model, contract, configuration,
property or scheduling assumption changes. The historical 43 checks remain
qualified at their recorded source context; do not claim the old complete packet
reverifies against these new STP bytes. No automatic TLC rerun is required for
test-location/oracle-allocation edits alone. Preserve the original report,
compressed traces and verification records unchanged. If a consumer requires
historical packet verification, reconstruct the captured original source context
from its qualified revision and run the unchanged verifier there. A separately
identified successor context may be recorded if needed; never weaken the
verifier, overwrite the old evidence, or describe reused traces as a new run.

## Implementation Slices

| Slice | Area / findings | Depends on | Owner and files | Validation gate |
| --- | --- | --- | --- | --- |
| T0 | Inspect qualified boundary baseline and retained-witness inventory | None | Sol plan; native Luna inventories component/public witnesses; root refreshes integration gate | Existing qualified baseline is identified, without claiming a fresh dirty-tree pass; every proposed deletion has a named retained witness and distinct invariant/fault-cut inventory. |
| T1 | Independent portable expectations, F1/F2 | T0 | Engine Luna: `scripts/saga-portable/verify.ts`, portable fixtures and oracle sensitivity tests; relevant action corpus/assessment tests | Unmodified engine passes; no-op edit, wrong diagnostic and missing-obligation mutants fail; exact independently expected positive action+saga support claims qualify without asserting execution. |
| T2 | Independent native observation and consolidation, F5 | T0 | Native Luna: saga provider observation helpers, history oracle/tests, protocol/component fixtures | Missing/failed/pending provider observations cannot become committed; duplicate expected tickets refuse; combined reverse unwind verifies original outputs and independent native effects. Retained-witness map precedes removals. |
| T3 | Receipt-to-artifact custody, F4 | T1 | Engine Luna after T1: collector and focused custody tests | Current complete cohort passes; stale CLI/addon/WASM/resource identities, missing or substituted receipts/artifacts refuse. No same-corpus shortcut establishes freshness. |
| T4 | Shared CI impact and execution, F3 | T2 | Native Luna after T2: workflow/impact tests and shared preparation | One impact roster selects shared executor changes for full native action+saga regression, root manifests/locks and exact repair inputs for packaged qualification, saga-only work for saga plus composed AC24 retirement witnesses. Pure documentation/unrelated scripts do not launch heavy gates; full native action regression once is acceptable if narrower selection is not dependable. |
| T5 | Executable mappings and final review, F6 | T1/T2/T3/T4 | Sol: STP-905/906 and this plan; root integration | Actual current test identifiers and assertions map 29 native +16 portable ACs; limitations remain explicit; final source review and required integration checks pass. |

T1 and T2 proceed in parallel. T3 and T4 follow their respective agents' first
slices, avoiding concurrent ownership of the same files. Root owns shared
integration, execution, evidence capture and git operations. Sol owns this plan,
STP-905/906 and independent milestone review; Sol edits no runtime, fixture,
workflow or test source. Agents communicate shared-file handoff before editing.

## Consolidation Decisions

Keep three proof layers: independent portable semantic expectations exercised
through the host bindings; native lifecycle/finality/authority schedules with
independent provider observations; exact built/installed artifact custody.
Share build, container preparation, fixture constructors and observation queries.
Keep static expected values and oracle checks independent of production helpers.

Public protocol tests own externally observable lifecycle composition. Component
tests retain lower-boundary guarantees not independently established there:
whole-invocation closure, reserved namespaces, current authority, result/input
bounds, byte retention and race cuts. Keep native in-flight action retirement
tests used by composed AC24. Do not remove a provider-only refusal merely because
a public happy path calls that provider. Do not remove all-host conformance
because implementations share Rust: transport/resource/loading boundaries differ.

Before deletion, record old scenario, invariant/fault cut, retained exact witness,
and unique assertions moved. Compare assertion meaning, not totals. Measure test
runtime/setup counts when available; reductions are beneficial only while the
retained fault cuts, independent observations and host boundaries remain covered.

The reviewed component-removal map is:

| Prior component label | Retained public witness / assertion |
| --- | --- |
| success; component-28 | Public success history plus shared independent provider/entity observer; rejected-unwind also observes native effects. |
| component-4 | Public execute-crash-after-finality/restart and original issuer resolution. |
| component-8; component-21 | Public bounded lookup budget across coordinator restart. |
| component-9 | Public failed-compensation stop before earlier work. |
| component-18 | Public equivalent/changed submit in ten-operation protocol and lost-submit acknowledgement. |
| component-19 | Public original control response replay and changed-request token conflict in ten-operation protocol. |
| component-20 | Public expired submission identity/restart. |
| component-23 | Public injected-clock automatic expiry/restart. |
| component-27 | Public pending-close refusal in ten-operation protocol. |

These removals are reviewed against the existing saga workflow's complete test
glob. They do not authorize removing the distinct component scenarios retained
above or changing public assertions. Final results must establish the resulting
suite, rather than reuse pre-consolidation assertion counts.

## Validation Plan

- Run focused oracle-sensitivity tests against the actual verifier: requested
  edit absent, diagnostics omitted/added or wrong severity/path, and action/saga
  obligation omission must each fail a named assertion.
- Use independently authored complete obligation IDs/kinds/status/provenance for
  representative positive support claims. Wrong source/identity, missing,
  duplicate and unsupported claims must not qualify; unknown syntax remains
  unknown and `executionVerified` remains false.
- Exercise provider observation helpers with no outcome, pending, failed and
  duplicate rows. Reject duplicate fixture expectations before reconciliation.
  In one multi-step case, assert compensation order and exact original output
  values in each original compensation input against independent provider rows.
- Execute collector negative controls after valid receipts exist, replacing
  binaries/resources without changing the corpus. Bind the retained CLI itself,
  not merely its filename. Verify unchanged exact artifacts still pass.
- Check CI impact controls against root manifests/locks, repair inputs, executor,
  action tests, saga tests and binding/resource paths, with pure-documentation and
  unrelated-script negative selections. Do not reactivate unrelated disabled
  workflows. Run full native actions
  and sagas, portable host corpus, installed SDK/Python checks and required
  boundary/type/package gates at integration. Preserve environmental failures.
- Update STP mappings from actual retained tests after consolidation; preserve
  deliberate composed proofs, historical receipts and explicit profile limits.

## Execution Contract

Execute all slices through their gates under the owner's authorization; do not
stop after planning or substitute inventory counts for passing assertions. No
tracker is selected. Root owns runtime state and git/release decisions. Ordinary
debugging and reversible test refactoring remain within scope. Stop for a material
authority conflict or an action outside the authorized scope, not routine choices.

Comparable token usage and enforced runtime metering are unavailable. Estimate
is unknown; use a provisional administrative ceiling of 80,000 aggregate tokens
for this bounded change, including planning, implementation and review, unless
the root runtime already imposes a lower ceiling. This is not an enforced cap.
Root reconciles available usage at slice checkpoints; exhaustion requires a
remaining-work disposition, never an unverified completion claim.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| A stronger oracle exposes runtime divergence | High | Keep failure visible; inspect governing clause before fixing code or expectation | Retain the exposing test; revert only the faulty implementation change. |
| Deduplication deletes a distinct race/finality witness | High | Require before/after retained-witness map and independent review before removal | Restore the removed scenario. |
| Static expectations become engine snapshots | High | Author from source fixtures/contracts; test omission and diagnostic mutants | Reject generated expectations and restore reviewed fixtures. |
| Receipt schema changes strand historical evidence | Medium | Apply stricter checks to newly generated cohorts; preserve immutable releases | Restore historical reader separately without admitting stale new custody. |
| Shared CI setup obscures failure ownership | Medium | Keep separately named action/saga/portable gates and raw results | Split execution steps while retaining shared preparation. |

## Continuation Evidence

Revision 1: six findings allocated; engine Luna owns T1 then T3, native Luna owns
T2 then T4, Sol owns T5 documentation/review, root owns execution/integration.
T1's focused source review accepts complete independent diagnostic tuples,
requested-edit/full-source assertions and representative complete action/saga
obligation inventories. Root observed 63 portable action tests/513 assertions
and three oracle-sensitivity tests/12 assertions passing in the tightening run;
the final all-host/integration gate remains pending. These observations are
invalidated by changes to their verification inputs, not unrelated documentation.
T2 source review accepts the shared native observer, duplicate/disposition
controls, reviewed component-removal map, and combined five-step original-output
unwind using one completed immutable Document installed in both providers.
Its final native run remains required. T4 source review accepts the actual-path
impact closure and separately named conditional gates; nine selector controls
are reported passing. Package qualification deliberately also runs both native
suites once; native-only saga changes avoid wheel builds. T3 remains in progress:
producer start/end input/artifact stability and the actual collector integration
must pass before exact-cohort custody is accepted. T5's current STP mappings are
drafted; final source/evidence review remains pending.
Root also observed 125 native action tests/1,990 assertions across 41 isolated
files and 45 native saga tests/697 assertions across six files passing locally.
Those campaigns preceded the final verification-input freeze and are integration
feedback, not the final source-bound qualification. The frozen hosted CI run is
the authoritative integration gate for this change.
On continuation reconcile actual diffs, named test results and retained-witness
map before advancing claims.

## Exit Criteria

- All F1–F6 changes exist with passing positive and named refusal/mutant controls.
- Independent expected action/saga obligations and native output-consuming
  reverse unwind are exercised, not inferred from annotations or test totals.
- Consolidation preserves every required AC witness and distinct boundary cut.
- Changed-source CI executes the shared action/saga regression and exact-artifact
  custody checks; final required integration gates pass without skips.
- STP-905/906 name actual retained executable witnesses with honest limitations;
  independent source/evidence review is complete and results are recorded here.
- Historical saga release, formal and component evidence packets remain byte
  unchanged; new runtime observations write to ignored cache output rather than
  overwriting tracked historical receipts. The final diff explicitly checks this.
