---
ddx:
  id: STP-907
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-907
      kind: informed_by
    - id: TD-907
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# STP-907: Verify the bulk coordination state machine

## Story Reference

[US-907](../../01-frame/user-stories/US-907-bulk-action-coordination.md), [TD-907](../../02-design/technical-designs/TD-907-bulk-action-coordination.md), SD-900.

## Scope and Objective

Prove the pure CONTRACT-904 reference model and its fixtures. All rows are planned; no historical pass is allocated. This plan attests no native executor.

## Acceptance Criteria Test Mapping

| Criterion | Planned test | Asserted behavior | Canonical citation | Layer | Planned file |
| --- | --- | --- | --- | --- | --- |
| US-907-AC1 | `transition_table` | Every table row has an exact expected next state and durable-basis tag; every other state/event pair is refused; terminal states are absorbing. | `@covers US-907-AC1` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC2 | `claim_fence_lease` | Fence monotonicity and no-wrap, PAP_FENCE with unchanged state, expiry-only never re-executes, re-fence only for never-effect-admitted confirmed-no-execution. | `@covers US-907-AC2` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC3 | `reconcile_exits` | Four evidence classes map to restore-prefix, stopped/PAP_ABORT_DISPOSITION_UNKNOWN, re-fence and reconciling; ambiguous evidence never proves rollback; no automatic retry. | `@covers US-907-AC3` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC4 | `cancel_serialization` | Both interleavings, committed prefix retained, no rollback assertion, cancelled only after settlement. | `@covers US-907-AC4` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC5 | `guard_before_tx1` | Guard-first ordering, PAP_GUARD without invented item outcome, no code translation, persisted original item outcome after tx/1 terminal decision, pre-stage-1 denial for missing delegation. | `@covers US-907-AC5` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC6 | `token_and_ref_grammar` | Grammar boundaries, injectivity over complete JobRef plus ordinals, length bound, outside-use refusal. | `@covers US-907-AC6` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC7 | `formal_correspondence` | Row-to-transition correspondence, named broken-mechanism controls fail in both the formal model and the reference model. | `@covers US-907-AC7` | portable-contract | `tests/actions-bulk-state.test.ts` |
| US-907-AC8 | `state_oracle_parity` | Three consumers agree with independent expectations on transition, fence, reconcile, cancel and decision-order cases. | `@covers US-907-AC8` | portable-contract | `tests/actions-bulk-state-oracle.py` |

## Executable Proof

Primary planned command: `bun test tests/actions-bulk-state.test.ts`; independent consumer `python3 tests/actions-bulk-state-oracle.py`; actual Chromium via `scripts/actions-bulk-state-browser.ts`. Create targets before implementation; every test cites its AC and must be capable of failing. Record results under `docs/helix/04-build/evidence/bulk-update/` with versions, owner hashes, negative controls and residuals.

## Initial implementation execution

AC1–AC6 execute in `tests/actions-bulk-state.test.ts` against `src/extensions/actions/bulk-state.ts`; `tests/actions-bulk-state-oracle.py` is the independent consumer. AC7 is partial (fixture and reference-model controls; the Truss formal model is not yet wired) and AC8 is partial (Chromium parity run recorded in the evidence file). [Execution evidence](../../04-build/evidence/bulk-update/us907-implementation.md) records results and residuals; allocation rows stay `planned` until every part of a criterion has run.

## Data and Setup

Owner fixture: `docs/helix/03-test/fixtures/bulk-update/transitions.json` (US-907) plus the US-902 `cases.json`/`model.json`. Each negative control mutates one rule at a time (resume from stopped, re-execute on expiry, rollback inferred from not-found, guard code translated to EXPECTED_VERSION).

## Edge Cases and Failure Modes

Fence wrap/equality, expiry racing claim, absent versus negative evidence, retry in non-active states, read-only review.

## Build Handoff

US-902/903; native custody belongs to Truss US-046-049. Done requires every AC's executed cited test with independently authored expectations. This plan allocates tests; it reports no executed coverage.
