---
ddx:
  id: US-085
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
---

# US-085: Qualify a generated Ashlar storage substrate

**Feature:** [[FEAT-030]]. **Feature Requirements:** SP-05, SP-03, SP-04.
**PRD Requirements:** FR-54. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to evaluate generated declarations inside Ashlar publication-bound execution,
**So that** I can reuse mappings while preserving immutable reads and durable source acknowledgement.

## Context

Ashlar owns full native publication vectors and source/destination custody. Schema-equivalent latest reads and independently successful table writes do not establish a publication. Exact public surfaces belong to US-083 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-085-AC1** — Given an original resolved publication, when I read through generated decoding, then full native snapshot and graph identity remain attached.
- [ ] **US-085-AC2** — Given an expired, replaced or unauthorized snapshot, when I read, then the original resolver refuses without latest fallback.
- [ ] **US-085-AC3** — Given a partial table commit or exact replay, when I execute publication, then previous visibility and original replay outcomes remain unchanged.
- [ ] **US-085-AC4** — Given uncertain ACK and concurrent publication/fencing, when I reconcile and execute, then custody and advancement match the original protocol.
- [ ] **US-085-AC5** — Given only local Delta evidence or changed compiler/runtime pins, when I assess qualification, then managed and production claims remain blocked until independently proved.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| ashlar_reads_preserve_vector | US-085-AC1 | an original resolved publication | full native snapshot and graph identity remain attached |
| ashlar_stale_read_refuses | US-085-AC2 | an expired, replaced or unauthorized snapshot | the original resolver refuses without latest fallback |
| ashlar_publication_is_not_table_commit | US-085-AC3 | a partial table commit or exact replay | previous visibility and original replay outcomes remain unchanged |
| ashlar_ack_and_fencing_match | US-085-AC4 | uncertain ACK and concurrent publication/fencing | custody and advancement match the original protocol |
| ashlar_support_scope_is_honest | US-085-AC5 | only local Delta evidence or changed compiler/runtime pins | managed and production claims remain blocked until independently proved |

## Dependencies

US-083; CONTRACT-069; consumer-local adopted Ashlar design and original resolver/publication implementation. Feature requirements: SP-05, SP-03, SP-04; PRD FR-54.
STP-085 owns exact test mapping; TD-085 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
