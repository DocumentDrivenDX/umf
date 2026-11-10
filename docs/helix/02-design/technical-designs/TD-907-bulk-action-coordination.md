---
ddx:
  id: TD-907
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-907
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# TD-907: Bulk coordination reference model

**User Story:** [US-907](../../01-frame/user-stories/US-907-bulk-action-coordination.md). **Feature:** FEAT-900. **Solution Design:** SD-900.

## Scope

A pure, host-I/O-free reference model of CONTRACT-904's job/batch state machine and decision order, plus the shared fixture and formal correspondence. It performs no native I/O, clock reads or authentication.

## Technical Approach

Encode the transition table as data (`docs/helix/03-test/fixtures/bulk-update/transitions.json`, owned by US-907) and implement `applyBulkEvent(state, event)` and `bulkDecisionOrder(batch, context)` as total functions returning the next state or a source-qualified refusal. Time and native evidence are inputs, never read. Reuse CONTRACT-903/`validateBulkOutcome` result shapes unchanged.

## Component Changes

Planned: `src/extensions/actions/bulk-state.ts`, `tests/actions-bulk-state.test.ts`, `tests/actions-bulk-state-oracle.py`, `scripts/actions-bulk-state-browser.ts`.

| AC | Component realization |
| --- | --- |
| US-907-AC1 | table-driven transition function and exhaustive refusal of unlisted pairs |
| US-907-AC2 | decimal-text fence arithmetic and claim/lease/effect-admission predicates |
| US-907-AC3 | evidence-class classifier for reconcile exits |
| US-907-AC4 | two-order cancel serialization cases |
| US-907-AC5 | guard-first decision-order function with delegation precheck |
| US-907-AC6 | JobRef grammar and `pap1/` token codec |
| US-907-AC7 | fixture-to-formal-model mapping check against the shared transition fixture |
| US-907-AC8 | Bun/Chromium plus independent Python consumers |

## API/Interface Design

Exports follow CONTRACT-904; no signatures are defined independently. Event and evidence vocabularies are those named in the contract.

## Data Model Changes

Add `transitions.json` and its schema beside the existing action fixtures; preserve existing package/schema identities.

## Integration Points

Truss US-048-AC7 formal model (`experiments/bulk-actions/BulkUpdate.tla`) consumes the same transition fixture for correspondence. UMF's existing `experiments/actions/formal` model covers action history and is not the bulk job model.

## Security

No principal is authenticated here. The model only evaluates whether a presented delegation precheck result is present before tx/1 stage 1.

## Performance

Pure and bounded by the fixture; no throughput claim.

## Testing

[STP-907](../../03-test/test-plans/STP-907-bulk-action-coordination.md) allocates each criterion once. Command: `bun test tests/actions-bulk-state.test.ts`.

## Initial implementation execution

`bulk-state.ts` implements `applyBulkEvent`, `bulkDecisionOrder`, `nextBulkFence`, `bulkItemToken`, `parseBulkItemToken`, `isReservedBulkKey` and `checkBulkKeyUse`, exported from the public index. See the [execution evidence](../../04-build/evidence/bulk-update/us907-implementation.md); the Truss formal correspondence and the Chromium consumer remain open.

## Migration & Rollback

Additive and opt-in; no existing behavior changes.

## Implementation Sequence

1. Author the transition and decision-order fixtures with independent expectations.
2. Write red tests with canonical citations.
3. Implement the pure model.
4. Wire the formal correspondence and the independent consumers; retain results and residual gaps.

## Risks

The model can drift from the contract table; the fixture is therefore the single owned source and both models must consume it. A passing model attests no executor.
