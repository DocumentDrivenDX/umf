---
ddx:
  id: US-905
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-901
      kind: derived_from
    - id: umf.prd
      kind: derived_from
    - id: US-906
      kind: informed_by
---

# US-905: Assess saga recovery guarantees

**Feature:** [FEAT-901](../features/FEAT-901-saga-semantics.md)
**Feature Requirements:** SAGA-03–17, SAGA-20–23
**PRD Requirements:** FR-57
**Priority:** P0 within the saga capability.

## Story

**As a** Extension and Translator Author,
**I want** to compare a consumer's recovery histories with the declared saga obligations,
**So that** support claims reveal duplicate-effect, lost-outcome and unsafe-compensation failures.

## Context

A consumer executes the reservation/allocation saga from US-906. UMF describes
the required behavior; the consumer owns execution and independently observable
provider effects. Conformance requires evidence beyond portable validation or
histories produced solely by the coordinator being tested.

## Walkthrough

1. The author selects a pinned saga, action profiles and the consumer's claimed recovery subset.
2. They run fabricated success and failure histories through a separately qualified consumer.
3. They interrupt execution after reservation commits but before its acknowledgement is recorded.
4. They recover the original invocation, then observe allocation's definitive rejection.
5. They observe the separately authorized release and inspect the complete recovery history.
6. They compare outcomes with the independent provider observations and publish qualified claims or failures.

## Acceptance Criteria

- [ ] **US-905-AC1** — Given independently confirmed reservation and allocation success, when the saga terminates, then success includes both original outcomes without a distributed atomicity claim.
- [ ] **US-905-AC2** — Given committed reservation and definitively rejected allocation, when compensation succeeds, then history retains reservation, rejection and release as separate outcomes under compensated termination.
- [ ] **US-905-AC3** — Given several compensated steps and a later definitive failure, when recovery runs, then compensation follows reverse completion order using original retained outputs.
- [ ] **US-905-AC4** — Given a remote reservation commit followed by coordinator acknowledgement loss, when the coordinator recovers, then it reconciles the original invocation before admitting dependent work or compensation.
- [ ] **US-905-AC5** — Given a timeout with unavailable authoritative outcome discovery, when recovery is requested, then the outcome remains indeterminate and later work stays blocked.
- [ ] **US-905-AC6** — Given duplicate delivery of a supported idempotent step, when recovery redelivers it, then independent provider evidence shows the same logical invocation and no additional business effect.
- [ ] **US-905-AC7** — Given an unresolved invocation lacking safe-redelivery support, when retry is requested, then the consumer refuses a fresh effect and exposes the unresolved recovery obligation.
- [ ] **US-905-AC8** — Given exhausted declared retry or time budgets, when automatic recovery would continue, then the consumer stops automatic work and exposes required intervention without fabricating noncommit.
- [ ] **US-905-AC9** — Given failed release compensation, when unwinding reaches that failure, then automatic earlier compensation stops with completed and remaining recovery work visible.
- [ ] **US-905-AC10** — Given lost compensation acknowledgement after remote release, when recovery runs, then it reconciles that original compensation before another release attempt is admitted.
- [ ] **US-905-AC11** — Given cancellation racing an in-flight committed reservation, when cancellation is acknowledged, then subsequent forward admission is fenced while the original reservation is reconciled before declared compensation.
- [ ] **US-905-AC12** — Given revoked forward authority and no separate compensation grant, when recovery requests release, then release is denied without inventing permission from the original grant.
- [ ] **US-905-AC13** — Given another tenant's instance reference or unauthorized history reader, when discovery or control is requested, then trusted scope and disclosure rules prevent cross-scope access or mutation.
- [ ] **US-905-AC14** — Given a retired definition with an active instance, when recovery runs, then its original intent and action interpretations remain authoritative; unavailable required interpretation prevents unsafe continuation.
- [ ] **US-905-AC15** — Given coordinator takeover while an obsolete worker still holds work, when that worker attempts further dispatch, then it cannot admit a new effect under superseded ownership.
- [ ] **US-905-AC16** — Given an irreversible notification followed by failure, when the process terminates, then the retained effect remains visible and the outcome does not claim complete rollback.
- [ ] **US-905-AC17** — Given an agent-generated output used by a later step, when the coordinator restarts, then it reuses the retained original output rather than regenerating a different business result.
- [ ] **US-905-AC18** — Given authorized manual reconciliation backed by provider evidence, when the operator resolves an uncertain outcome, then the attributable resolution retains its evidence and original history without rewriting confirmed facts.
- [ ] **US-905-AC19** — Given expired retained execution data, when the same instance identity is resubmitted, then retained nonreuse protection prevents fresh execution under that identity.
- [ ] **US-905-AC20** — Given producer-authored success histories without independent provider observations, when conformance is assessed, then native execution remains unverified regardless of declaration validity.

- [ ] **US-905-AC21** — Given original admission commits but its reply is lost, when concurrent equal submissions or retries use the same trusted scoped submission identity, then they recover one original instance and its original submission result without another forward effect.
- [ ] **US-905-AC22** — Given a retained submission identity, when definition, inputs or trusted bindings differ, then submission conflicts without changing the original instance, including after completion; reuse after expiry remains refused.
- [ ] **US-905-AC23** — Given retirement of only the saga definition, when an existing instance continues, then supported active actions remain eligible under current authority, while a new submission with a fresh identity is refused.
- [ ] **US-905-AC24** — Given a referenced forward or compensation action retires before its invocation is admitted, when fresh dispatch is requested, then it refuses and exposes intervention with pending obligations; original lookup/replay still works and an already admitted transaction may settle. No newer revision is substituted.

- [ ] **US-905-AC25** — Given authoritative forward rollback after a committed prefix, when recovery runs, then it compensates that prefix in reverse order while retaining failed as the original result; first-step failure completes an empty unwind. Every delayed same-ticket delivery after definitive noncommit recovers that original disposition and produces no late effect; single-attempt rollback or a missing tx/1 outcome cannot establish finality.

- [ ] **US-905-AC26** — Given a settled intervention, when an authorized operator closes it with scoped evidence and the current history sequence, then closed retains the actor, original cause and accepted residual effects without claiming compensation; pending, stale or fabricated evidence refuses.

- [ ] **US-905-AC27** — Given failure-triggered unwind including its reconciliation, when cancel arrives, then it refuses without changing the latched cause or terminal classification.

- [ ] **US-905-AC28** — Given an irreversible step preceding later work, when inspection or assessment runs, then SAGA_PIVOT identifies the barrier and later steps without claiming forward-only recovery support.

- [ ] **US-905-AC29** — Given a host requiring longer automatic execution or incompatible payload erasure, when this profile is selected, then admission refuses; tighter advertised limits persist across restart.

## Edge Cases

- Compensation can conflict with a later legitimate business change; the consumer retains the conflict and requires intervention under the profile.
- An outbox commit proves local intent only; external completion requires the provider's separately qualified outcome evidence.
- Failure before any forward effect creates no fabricated compensation outcome.
- Uncertain compensation is neither a completed release nor a confirmed failure.

## Test Scenarios

| Scenario | AC ID | Input / State | Action | Expected Result |
| --- | --- | --- | --- | --- |
| Release reservation | US-905-AC2 | Reservation R commits; allocation rejects | Recover | Release R commits; original failure remains visible. |
| Lost acknowledgement | US-905-AC4 | Provider holds R; coordinator lacks response | Restart | Recover original R before later work. |
| Provider unavailable | US-905-AC5 | No authoritative response for R | Reconcile | Indeterminate; no guessed failure or release. |
| Release conflict | US-905-AC9 | R's release conflicts with current state | Compensate | Stop automatic unwinding and expose remaining obligations. |
| Cancellation race | US-905-AC11 | Cancel arrives while R commits | Cancel | No new forward dispatch; reconcile R first. |
| Lost permission | US-905-AC12 | Original permission revoked; release grant absent | Compensate | No unauthorized release. |
| Retired worker | US-905-AC15 | New coordinator owns the instance | Old worker dispatches | No new effect admission. |
| Recorded AI result | US-905-AC17 | Original recommendation is retained | Restart | Same result supplies dependent inputs. |

## Dependencies

US-906 supplies the portable declaration journey; FEAT-901 and FR-57 govern
recovery obligations. CONTRACT-900/901/904 retain their existing meanings.
The new saga contract must specify exact protocols and conformance boundaries.
An executor owner must supply native outcome discovery, authority and custody
evidence; a portable UMF fixture cannot substitute for those observations.

## Out of Scope

Implementing or selecting the consumer's orchestrator; broadening tx/1 or bulk/1;
claiming arbitrary external API safety; adding UI, parallel execution or automatic
in-flight definition migration. No execution evidence is claimed by these criteria.
