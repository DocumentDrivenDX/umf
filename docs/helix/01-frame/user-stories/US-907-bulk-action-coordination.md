---
ddx:
  id: US-907
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-907: Coordinate bulk jobs with a verifiable control state machine

**Feature:** FEAT-900. **Feature Requirements:** PAP-UMF-04. **PRD Requirements:** PAP-UMF-04. **Priority:** First bulk UPDATE slice. **Status:** Draft.

## Story

As a Schema Integration Maintainer, I want the bulk job control protocol (claim, fence, lease, cancel, reconcile, decision order) specified as a pure, testable state machine, so that executors in other repositories implement the same transitions and cannot treat uncertainty as rollback.

## Context

CONTRACT-904 defines the protocol but until this story no story owned its behavior; US-903 covers only result-union shape. This story owns the portable reference model, shared transition/decision-order fixtures and the correspondence to the bounded formal model. Native custody, authentication and storage remain executor-owned (Truss US-046-049) and are not attested here.

## Walkthrough

1. Take the CONTRACT-904 transition table and decision order as the owner fixture.
2. Apply events to states in the pure reference model and compare with independent expectations.
3. Check the formal model maps to every row and rejects broken mechanisms.
4. Verify native evidence separately before claiming executor support.

## Acceptance Criteria

- [ ] **US-907-AC1** — Given every state/event row of the CONTRACT-904 transition table, when the pure reference model applies each event to each state, then exactly the permitted resulting state is produced with its required durable basis, every other pair refuses, and stopped/completed/cancelled accept no resume, job or manifest mutation.

- [ ] **US-907-AC2** — Given claim, execute and lease-expiry sequences including stale, absent and equal-text fences and a never-effect-admitted versus effect-admitted claim, when the model applies them, then fences are exact unsigned decimal text incremented without wrap, a stale or absent fence yields PAP_FENCE without altering job state, lease expiry alone never permits re-execution, and a higher fence for the same batch is allowed only for an unconsumed claim with independently confirmed no effect admission.

- [ ] **US-907-AC3** — Given reconcile inputs of confirmed original commit, confirmed noncommit after effect admission, noncommit before effect admission, and unavailable or ambiguous evidence (receipt not-found, NULL native status, expired lease, changed session), when the model settles them, then commit restores the original prefix, admitted noncommit with no terminal outcome stops as PAP_ABORT_DISPOSITION_UNKNOWN, never-admitted claims may be re-fenced, and ambiguous evidence leaves the job reconciling without business retry.

- [ ] **US-907-AC4** — Given cancel racing a claim or an admitted batch in both lock orders, when the model serializes them, then cancel-before-admission yields cancelled, an admitted transaction that commits first is retained and blocks later batches, an uncertain admitted attempt yields reconciling or cancel-requested without asserting rollback, and cancelled is reached only after original settlement.

- [ ] **US-907-AC5** — Given a batch whose targets are changed, deleted or rebound, when the decision-order model runs, then the guard pass precedes tx/1 stages 1-7, a guard failure is batch conflict PAP_GUARD with no fabricated item outcome and is never translated to EXPECTED_VERSION or ENTITY_MISSING, a tx/1 terminal decision after guards pass persists the failed item's original outcome with the batch stop, and a worker identity without a valid delegation is denied before tx/1 stage 1.

- [ ] **US-907-AC6** — Given JobRef namespace/id values, batch/item ordinals and attempted outside use of reserved keys, when the model derives and validates item tokens, then namespace and id match [A-Za-z0-9_-]{1,128}, tokens `pap1/<namespace>/<id>/<batch>/<item>` are injective and fit the tx/1 token length, and invocation or replay under a reserved key outside the registered bulk path refuses.

- [ ] **US-907-AC7** — Given the owner-authored transition fixture, when the bounded formal model and the pure reference model each consume it, then every table row and every named refusal/uncertainty rule maps to a model transition or invariant, and a deliberately broken mechanism (resume from stopped, re-execute on expiry, rollback inferred from not-found) is rejected by both.

- [ ] **US-907-AC8** — Given the owner-authored transition and decision-order fixtures with independent expected outcomes, when Bun, actual Chromium and the separately coded Python consumer evaluate them, then each agrees with the independent expected outcome; identical shared-implementation output alone is insufficient.

## Implementation evidence

The pure reference model and shared fixture exist and AC1–AC6 execute; AC7 is partial; AC8 now also runs in Chromium. See [US-907 evidence](../../04-build/evidence/bulk-update/us907-implementation.md). No native execution or release acceptance is claimed.

## Edge Cases

Equal-text and wrapped fences, expiry racing a claim, evidence that is absent versus negative, submit retry in stopped/cancelled/reconciling, and the read-only `review` operation changing no state.

## Test Scenarios

| Scenario | Criterion | State/action | Expected result |
| --- | --- | --- | --- |
| transition_table | US-907-AC1 | Owner fixture cases keyed by this test name with named negative mutation | Every table row has an exact expected next state and durable-basis tag; every other state/event pair is refused; terminal states are absorbing. |
| claim_fence_lease | US-907-AC2 | Owner fixture cases keyed by this test name with named negative mutation | Fence monotonicity and no-wrap, PAP_FENCE with unchanged state, expiry-only never re-executes, re-fence only for never-effect-admitted confirmed-no-execution. |
| reconcile_exits | US-907-AC3 | Owner fixture cases keyed by this test name with named negative mutation | Four evidence classes map to restore-prefix, stopped/PAP_ABORT_DISPOSITION_UNKNOWN, re-fence and reconciling; ambiguous evidence never proves rollback; no automatic retry. |
| cancel_serialization | US-907-AC4 | Owner fixture cases keyed by this test name with named negative mutation | Both interleavings, committed prefix retained, no rollback assertion, cancelled only after settlement. |
| guard_before_tx1 | US-907-AC5 | Owner fixture cases keyed by this test name with named negative mutation | Guard-first ordering, PAP_GUARD without invented item outcome, no code translation, persisted original item outcome after tx/1 terminal decision, pre-stage-1 denial for missing delegation. |
| token_and_ref_grammar | US-907-AC6 | Owner fixture cases keyed by this test name with named negative mutation | Grammar boundaries, injectivity over complete JobRef plus ordinals, length bound, outside-use refusal. |
| formal_correspondence | US-907-AC7 | Owner fixture cases keyed by this test name with named negative mutation | Row-to-transition correspondence, named broken-mechanism controls fail in both the formal model and the reference model. |
| state_oracle_parity | US-907-AC8 | Owner fixture cases keyed by this test name with named negative mutation | Three consumers agree with independent expectations on transition, fence, reconcile, cancel and decision-order cases. |

## Dependencies

US-902, US-903 (result unions and corpus); native custody and the delegation binding belong to Truss US-049/047/048. Contracts CONTRACT-901, CONTRACT-904.

## Out of Scope

Native transaction/lock behavior, authentication, storage, real two-connection concurrency, resume of stopped jobs, parallel batches, whole-job atomicity and compensation. The reference model attests no executor.
