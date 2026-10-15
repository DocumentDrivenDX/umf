---
ddx:
  id: US-082
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
---

# US-082: Use generated PostgreSQL access declarations

**Feature:** [[FEAT-029]]. **Feature Requirements:** PG-01, PG-02, PG-03, PG-05.
**PRD Requirements:** FR-53. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to generate typed PostgreSQL declarations from explicit physical bindings,
**So that** I can reuse schema meaning without introducing hidden transactions or value conversions.

## Context

SQLAlchemy constructors do not validate Pydantic DTOs. Existing UMF PostgreSQL generation remains DDL authority, and installed native correspondence needs independent proof. Exact public surfaces belong to US-080/081 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-082-AC1** — Given a complete PostgreSQL binding, when I generate and compare native declarations, then exact types, names, key order and constraint choices correspond.
- [ ] **US-082-AC2** — Given a table without qualified ORM identity, when I generate access, then no identity is invented.
- [ ] **US-082-AC3** — Given native exact-value/default counterexamples, when I encode and execute within an owned fixture, then supported values agree and lossy values refuse.
- [ ] **US-082-AC4** — Given generated declarations without a host session, when I import and inspect them, then no connection, transaction, cascade or lazy load is initiated.
- [ ] **US-082-AC5** — Given DDL or schema changed independently of the source bundle, when I assess adoption, then generation alone cannot establish installed compatibility.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| postgresql_binding_matches_native | US-082-AC1 | a complete PostgreSQL binding | exact types, names, key order and constraint choices correspond |
| no_fake_orm_identity | US-082-AC2 | a table without qualified ORM identity | no identity is invented |
| postgresql_codec_matches_native | US-082-AC3 | native exact-value/default counterexamples | supported values agree and lossy values refuse |
| postgresql_has_no_execution_authority | US-082-AC4 | generated declarations without a host session | no connection, transaction, cascade or lazy load is initiated |
| schema_drift_blocks_adoption | US-082-AC5 | DDL or schema changed independently of the source bundle | generation alone cannot establish installed compatibility |

## Dependencies

US-080/081; CONTRACT-042/043/067/068; exact SQLAlchemy/driver/PostgreSQL profile spike. Feature requirements: PG-01, PG-02, PG-03, PG-05; PRD FR-53.
STP-082 owns exact test mapping; TD-082 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
