---
ddx:
  id: STP-905
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-905
      kind: derived_from
    - id: TD-905
      kind: informed_by
    - id: CONTRACT-908
      kind: references
---

# STP-905: saga recovery conformance

## Story Reference

**User Story:** [[US-905-saga-recovery-conformance]]
**Technical Design:** [[TD-905-saga-recovery-conformance]]
**Solution Design:** [SD-901](../../02-design/solution-designs/SD-901-saga-semantics.md)
**Project Test Plan:** [TP-001](../test-plan.md).

## Scope and Objective

Prove the selected sequential profile against CONTRACT-908 using an isolated
coordinator and two native provider stores, original effect/outcome custody,
current authority and independent provider observations. This allocation names
actual executable witnesses; test counts and coverage annotations alone do not
prove an acceptance criterion. The [completed release packet](../../04-build/evidence/sagas/README.md)
remains source-bound historical evidence. The successor
[test-tightening plan](../../04-build/actions-sagas-test-tightening-plan.md)
owns oracle sensitivity, current mappings and test consolidation.

## Acceptance Criteria Test Mapping

Unless explicitly named otherwise, titles below are exact tests in
tests/saga/protocol.test.ts. Public tests own lifecycle composition;
tests/saga/native-recovery.test.ts retains distinct lower-boundary custody
witnesses, not an all-29-criteria certificate. The table is a required assertion
allocation; passing observations require a fresh source/runtime-bound result.

| AC | Retained executable witness | Required assertion / scope |
| --- | --- | --- |
| US-905-AC1 | public success history agrees with independently queried native provider outcomes | Provider result/identity, entity state, ticket and public history agree. |
| US-905-AC2 | a rejected allocation unwinds with the original typed output from its prior commit | Committed reserve, actual business rejection and committed release remain separate original results. |
| US-905-AC3 | five-step recovery compensates the committed prefix in exact reverse order | One combined multi-step unwind must assert reverse order AND each compensation's exact original typed output, independently queried from native custody. |
| US-905-AC4 | an execute crash after provider finality recovers the original outcome without a second effect; live pending case in the ten-operation test | Lost acknowledgement/restart retains original result; dependent admission remains blocked until that original settles. |
| US-905-AC5 | the native adapter validates and dispatches the closed ten-operation protocol; retained issuer evidence resolves after automatic lookup exhaustion without resuming work | Live authoritative pending ticket survives restart; no fabricated noncommit or later dispatch. |
| US-905-AC6 | provider-boundary.test.ts: saga gateway reserves native keys against direct caller execution; native component duplicate delivery witness | Same original key/result, no extra native outcome or effect. |
| US-905-AC7 | live pending case in the ten-operation test; native component unresolved-ticket barrier | No fresh business attempt or later forward/compensation ticket while original finality is unknown. |
| US-905-AC8 | reconciliation consumes the bounded lookup budget across coordinator restart; automatic work expires against a host clock across coordinator restart | Count/time exhaustion stops work and retains unresolved original obligations across restart. |
| US-905-AC9 | a failed compensation stops before earlier committed work is compensated | Failed release latches intervention and prevents earlier unwind. |
| US-905-AC10 | a lost compensation acknowledgement recovers the original release result after coordinator restart | Original release result, exact key and independent outcome/entity count survive lost acknowledgement; no duplicate effect. |
| US-905-AC11 | cancellation during an admitted forward invocation waits for its original result before compensation | Cancellation fences later tickets; admitted original settles before unwind. |
| US-905-AC12 | forward authorization does not imply independent compensation authority | Independently revoked forward and compensation grants do not authorize release; native entity remains unreleased. |
| US-905-AC13 | history pages require current authorization; history cursors are bound to their original instance; ten-operation outsider controls | Tenant/owner/current permission and instance-bound cursor checks refuse disclosure/mutation. |
| US-905-AC14 | an admitted instance keeps its original immutable action binding after host directory replacement | Original binding/interpretation stays pinned; unavailable required custody durably intervenes rather than rebinding. |
| US-905-AC15 | a control-operation crash recovers the exact original claim without renewing its lease; native component stale-fence witness | Takeover advances fence; stale workers cannot admit new work; recovery does not renew original lease. |
| US-905-AC16 | an irreversible committed step remains visible as residual when later work fails | Native irreversible effect/residual remains visible; no complete rollback claim. External notification adapters remain outside actions 0.1.0. |
| US-905-AC17 | a nondeterministic declared output survives execute acknowledgement loss and replay | Original random typed output is retained once, recovered and consumed by later work rather than regenerated. |
| US-905-AC18 | the native adapter validates and dispatches the closed ten-operation protocol; retained issuer evidence resolves after automatic lookup exhaustion without resuming work | Only original issuer-scoped facts resolve; raw history retains actor/service/issuer and original result without rewriting facts or resuming automatic work. |
| US-905-AC19 | expired submission identities remain nonreusable after coordinator restart | Expired identity cannot create a new instance/effect. |
| US-905-AC20 | public success history agrees with independently queried native provider outcomes; history-oracle.test.ts | Independent native observations are mandatory; invented/omitted/duplicate/foreign effects and duplicate expectations fail. |
| US-905-AC21 | a submit acknowledgement lost after durable admission recovers the original response; ten-operation equivalent-submit case | Equal concurrent/retried submit retains one instance and original response across lost acknowledgement/restart. |
| US-905-AC22 | changed revision or trusted binding conflicts after terminal completion; ten-operation changed-input case | Changed intent conflicts before/after terminal state; original nonreuse remains. |
| US-905-AC23 | definition retirement rejects fresh submissions while an admitted instance continues on its snapshot | Fresh refuses while admitted original uses retained active interpretations. |
| US-905-AC24 | retiring an action at the native admission cut prevents a fresh effect; composed native handler retirement tests below | Retired fresh invocation intervenes; an actually admitted transaction may settle, with retained original lookup/replay. |
| US-905-AC25 | a first-step rollback unwinds empty and late delivery returns its original failure without effects; rejected-allocation and five-step tests | Closed whole-ticket noncommit, empty or committed-prefix unwind, and delayed same-ticket delivery yield no fresh effect. |
| US-905-AC26 | operator closure rejects finality evidence for another provider, revision, epoch, or action key; ten-operation close case | Pending/stale/foreign/fabricated evidence refuses; accepted close retains current actor, sequence, first cause, disposition and review ID/digest. |
| US-905-AC27 | cancel is refused during failure unwind without replacing the first cause | Cancel during pending compensation refuses; first failure and compensated classification remain. Source cause guard also applies during reconciliation. |
| US-905-AC28 | irreversible residual test; STP-906 early/terminal irreversible vectors and Rust pivot test | Exact SAGA_PIVOT barrier/later-step diagnostics plus native residual disclosure; no forward-recovery inference. |
| US-905-AC29 | incompatible automatic limits refuse admission and tighter limits persist across restart; lookup/clock tests; control-capacity.test.ts and provider-boundary.test.ts | Incompatible duration/erasure refuses; tighter persisted limits, retained count/bytes and oversized result/input refusal remain explicit. |

AC24's composed admitted-transaction witnesses are
tests/actions-reference/handler-executor.test.ts tests titled
“retirement during an admitted native handler pins its accepted build and fences subsequent fresh admission”
and “native catalog retirement waits for admitted handler commit then refuses fresh work”.
They exercise the same executor/store-lock boundary used by saga providers.
An afterInvoke pause occurs after executor commit and is not a substitute for
those in-flight transaction witnesses.

## Independent Oracle and Consolidation Controls

tests/saga/native-observation.ts queries provider tickets/attempts and native
action outcomes/entity state separately from coordinator history. Missing,
pending, failed and duplicate facts remain explicit; they never default to
committed. Outcome-backed revision/key/correlation come from native original
intent, not substituted gateway declarations. Closed whole-ticket noncommit
requires independent final disposition, zero business outcomes, no live attempts
and the expected unchanged entity state.

tests/saga/history-oracle.test.ts must reject missing/duplicate/invented provider
facts, wrong identity/tenant/provider/epoch/revision/key, duplicate fixture ticket
expectations, changed first cause and hidden pending originals. One observation
cannot satisfy duplicate expected tickets. Keep fixture expectations independent
of observation queries and production projections.

Before deleting an overlapping component flow, name its unique invariant/fault
cut and retained public or lower-boundary witness. Preserve distinct reserved-key,
whole-ticket finality, authority, bounds and actual native admission witnesses.
Remove misleading component-wide all-AC citations; smaller component evidence
does not become full-story proof merely because its suite passes.

## Executable Proof and Setup

Current commands are:

~~~sh
bun run check:rust-boundaries
bun test tests/saga/history-oracle.test.ts
bun test tests/saga/*.test.ts
bun run test:actions
~~~

Build the shared engine/addon first; prepare the pinned PostgreSQL 17.9 and
digest-pinned handler runtime before native execution. Invocation retains
pull-never behavior. The native harness verifies the actual server profile and
cleans up owned sessions/containers. Shared setup may be reused; test state and
trusted actors remain isolated. Use real SQL sessions and barriers for races,
not sleep timing alone.

The integrated saga workflow must select shared executor changes, root manifests
and dependency locks, repair inputs and composed action-test dependencies.
A saga-only change must retain the composed admitted-action retirement witness;
shared executor changes require full native action+saga regression. Keep explicit
action/saga failure attribution even when preparation is shared. Record actual
source/runtime/artifact digests, raw failures and capture limits.

## Formal Evidence and Interpretation Limits

The schema verifier at docs/helix/02-design/examples/saga/verify.py proves
structure only. The source-exact bounded Protocol.tla suite, earlier coordination
and admission models, correspondence and reproduction live under
02-design/experiments/saga. Keep exact model/configuration/tool hashes and
distinguish exploration, expected mutant counterexample and reachability witness.
No model or schema run substitutes for a native AC. Rerun formal analysis for
TD-905 transition/assumption changes; rerun native correspondence for changed
provider/driver/authority/custody code.

This STP's current allocation bytes differ from the historical formal packet's
hashed specification context. Its 43 checks remain evidence at that captured
context; the unchanged verifier must not be described as passing against the
new full context. The test-tightening plan records the original-context
verification disposition without overwriting reports or reinterpreting traces
as a new model run.

All original tickets, first cause and residual obligations survive automatic
stops. Operator resolution/closure imports scoped retained evidence without
renewing automatic budgets or executing business work. The selected qualification
consumer is not a production hosting service or a public portable execution API.
