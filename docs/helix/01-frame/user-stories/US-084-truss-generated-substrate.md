---
ddx:
  id: US-084
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
---

# US-084: Qualify a generated Truss storage substrate

**Feature:** [[FEAT-029]]. **Feature Requirements:** PG-04, PG-03, PG-05.
**PRD Requirements:** FR-53. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to evaluate a bounded generated storage path against original Truss behavior,
**So that** I can remove duplicated mappings without changing protected graph execution.

## Context

Truss stores domain types in fixed generic tables. Its current accepted native layout and protected admission must be supplied independently; a compiler output cannot supply missing semantic routines or authority. Exact public surfaces belong to US-082 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-084-AC1** — Given physical and domain models for one Truss operation, when I generate the two surfaces, then generic storage and document-qualified identities remain unchanged.
- [ ] **US-084-AC2** — Given original protected admission and invalid authority, when I substitute generated access, then the same authorized/refused operations reach the original boundary.
- [ ] **US-084-AC3** — Given an admitted property/edge mutation, when I compare isolated original/generated executions, then actual state, journal, feed, receipt and ACK outcomes agree.
- [ ] **US-084-AC4** — Given concurrent writers or injected failure before commit, when I execute the selected operation, then locking, rollback, savepoint and ordinal semantics remain unchanged.
- [ ] **US-084-AC5** — Given missing installed semantics or a changed profile, when I assess qualification, then substitution refuses and the original path remains selected.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| truss_does_not_create_domain_tables | US-084-AC1 | physical and domain models for one Truss operation | generic storage and document-qualified identities remain unchanged |
| truss_admission_cannot_be_bypassed | US-084-AC2 | original protected admission and invalid authority | the same authorized/refused operations reach the original boundary |
| truss_mutation_witness_matches | US-084-AC3 | an admitted property/edge mutation | actual state, journal, feed, receipt and ACK outcomes agree |
| truss_failure_and_concurrency_match | US-084-AC4 | concurrent writers or injected failure before commit | locking, rollback, savepoint and ordinal semantics remain unchanged |
| truss_incomplete_proof_blocks_switch | US-084-AC5 | missing installed semantics or a changed profile | substitution refuses and the original path remains selected |

## Dependencies

US-082; CONTRACT-069; consumer-local adopted Truss design and original complete native operation. Feature requirements: PG-04, PG-03, PG-05; PRD FR-53.
STP-084 owns exact test mapping; TD-084 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
