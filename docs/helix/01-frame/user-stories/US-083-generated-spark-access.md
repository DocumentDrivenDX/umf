---
ddx:
  id: US-083
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
---

# US-083: Use generated Spark and catalog declarations

**Feature:** [[FEAT-030]]. **Feature Requirements:** SP-01, SP-02, SP-03, SP-04.
**PRD Requirements:** FR-54. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to generate Spark schemas and decode explicitly analyzed materialized results,
**So that** I can reuse typed values while retaining distributed and catalog enforcement limits.

## Context

Spark compute, Delta storage and Unity Catalog service identity are separate profile dimensions. A sampled row or Python annotation does not prove a DataFrame schema or dataset-wide integrity. Exact public surfaces belong to US-080/081 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-083-AC1** — Given an explicitly bound nested schema, when I compare generated and independent native schema, then types, metadata and nested nullability agree.
- [ ] **US-083-AC2** — Given exact values and changed session interpretation, when I decode qualified results, then lossy values or configuration mismatches refuse.
- [ ] **US-083-AC3** — Given an empty result or arbitrary expression projection, when I request typed decoding, then host schema verification remains mandatory.
- [ ] **US-083-AC4** — Given a generated Spark module, when I import and call its schema constructor, then no session, collection, migration or write occurs.
- [ ] **US-083-AC5** — Given local evidence and catalog key declarations, when I assess support, then managed enforcement claims remain separately qualified.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| spark_schema_matches_native | US-083-AC1 | an explicitly bound nested schema | types, metadata and nested nullability agree |
| spark_exact_values_are_qualified | US-083-AC2 | exact values and changed session interpretation | lossy values or configuration mismatches refuse |
| spark_result_type_requires_schema | US-083-AC3 | an empty result or arbitrary expression projection | host schema verification remains mandatory |
| spark_generation_is_passive | US-083-AC4 | a generated Spark module | no session, collection, migration or write occurs |
| catalog_claims_are_separate | US-083-AC5 | local evidence and catalog key declarations | managed enforcement claims remain separately qualified |

## Dependencies

US-080/081; CONTRACT-017/064/067/068; exact Spark/Delta/catalog profile spike. Feature requirements: SP-01, SP-02, SP-03, SP-04; PRD FR-54.
STP-083 owns exact test mapping; TD-083 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
