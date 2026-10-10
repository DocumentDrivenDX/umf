---
ddx:
  id: US-056
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-056: Invoke and reconcile a qualified action

**Feature:** FEAT-008. **Feature Requirements:** ACT-09–13, supporting ACT-01–08.
**PRD Requirements:** FR-51. **Priority:** Owner-directed qualification. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to preview, invoke and reconcile
an explicitly qualified action against a reference store, **So that** I can verify
its promised transaction behavior before another system adopts the action model.

## Context

Portable declarations cannot establish authorization, native identity, atomicity or
durable replay. This story provides one complete reference-consumer journey under
CONTRACT-901. It preserves the library/runtime boundary and exposes unsupported
semantics before executing business changes.

## Walkthrough

1. The maintainer selects an admitted revision and authenticates through the test issuer.
2. The maintainer previews a create-and-link request and sees an advisory explanation.
3. The maintainer submits the request with a fresh replay token.
4. The consumer commits verified effects, audit and visibility evidence atomically.
5. After a lost acknowledgement, the maintainer reconciles the original request.
6. The maintainer reads a projection at the returned receipt or sees an explicit wait/refusal.

## Acceptance Criteria

- **US-056-AC1:** Given an authorized current declaration is selected, when a preview is requested, then the explanation is advisory and creates no business or replay changes, under CONTRACT-901.
- **US-056-AC2:** Given an authorized recipe has valid inputs and state, when it is invoked, then the committed result verifies its ordered effects and net changes, under CONTRACT-901.
- **US-056-AC3:** Given an admitted invocation violates a precondition or concurrency assertion, when it is invoked, then the first applicable stable rejection survives later state changes, under CONTRACT-901.
- **US-056-AC4:** Given a terminal keyed invocation is retained, when the same intent is reconciled, then the original outcome is returned without reexecution, under CONTRACT-901.
- **US-056-AC5:** Given membership changes concurrently with an invocation, when authorization is decided, then the store-qualified ordering prevents a commit authorized after revocation, under CONTRACT-901.
- **US-056-AC6:** Given a previously accepted revision is retired, when a caller requests fresh execution or retained reconciliation, then fresh execution refuses while protected retained interpretation remains usable, under CONTRACT-901.
- **US-056-AC7:** Given a qualified handler attempts business access, when it is invoked, then only the frozen frame is usable through the bounded isolated gateway, under CONTRACT-901.
- **US-056-AC8:** Given selected inputs alias through different Keys or relationships change concurrently, when execution reaches its invariant boundary, then the resulting store preserves identity and relationship constraints, under CONTRACT-901.
- **US-056-AC9:** Given an execution fails before a known commit, when the caller retries, then rollback and the bounded retry rule prevent partial effects, under CONTRACT-901.
- **US-056-AC10:** Given a committed invocation loses its acknowledgement, when the caller reconciles after restart, then the terminal result is recovered without a second business commit, under CONTRACT-901.
- **US-056-AC11:** Given an admitted execution reaches a terminal outcome, when its transaction completes, then the protected audit identity and outcome have the same durability boundary, under CONTRACT-901.
- **US-056-AC12:** Given a receipt is used against a lagging or restored projection, when the consuming read requests its bound visibility, then only matching epoch and complete content through the receipt are accepted, under CONTRACT-901.

## Edge Cases

Unknown semantic dependencies, unsupported native lifecycle/association layouts,
spoofed identities and unavailable retained interpretation refuse. A token belongs
to the trusted human/store/action namespace across calling-service changes.
An ambiguous response permits reconciliation, not an assumed rollback retry.

## Test Scenarios

| Scenario | Criterion | State/action | Expected result |
| --- | --- | --- | --- |
| Create order o1 and link c1/p1 | US-056-AC2 | Qualified create/link revision, fresh token t1 | One verified commit and exact changes |
| Reconcile after acknowledgement loss | US-056-AC10 | Restart consumer, retain t1 and original intent | Same terminal result and one business commit |
| Replay after revocation | US-056-AC5 | Remove approver before protected lookup | Denied without disclosing retained result |
| Projection event 2 arrives before 1 | US-056-AC12 | Read at receipt 2 | Wait until complete prefix and content apply |

## Dependencies

US-900; FEAT-008; CONTRACT-900/053; SD-008; ADR-002. PostgreSQL and an isolated
handler runtime are qualification dependencies, not portable library dependencies.

## Out of Scope

Production deployment, downstream adoption, multiple stores, workflows, bulk or
allocated identity, external business effects and unqualified native cascades.
