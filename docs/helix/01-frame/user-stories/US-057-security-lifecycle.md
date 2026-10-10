---
ddx:
  id: US-057
  type: user-story
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-057: Preserve authority across writes and history

**Feature:** FEAT-008. **Feature Requirements:** SEC-09–12. **PRD Requirements:** FR-45. **Priority:** P0.

## Story

**As a** Schema Integration Maintainer
**I want** to preserve authority across writes and history
**So that** I can reuse policies with evidence of zero unauthorized disclosure in the admitted corpus.

## Context

The shared security slice separates logical policy from native enforcement.
CONTRACT-062/063 own exact semantics, outcomes and evidence; a declared profile
is insufficient to qualify an actual storage installation.

## Walkthrough

1. I select the Clients/Projects/Staff ontology and a versioned policy.
2. I select complete trusted facts and the intended storage profile.
3. I run validation and the story-specific conformance scenarios.
4. I inspect refusals, counterexamples and qualified evidence before admission.

## Acceptance Criteria

- [ ] **US-057-AC1** — Given an ownership-changing update, when I attempt the mutation, then original-state, proposed-state and ownership-change authority are all required.
- [ ] **US-057-AC2** — Given an admitted read and a concurrent assignment revocation, when revocation acknowledges, then no older admitted operation remains before its final release boundary.
- [ ] **US-057-AC3** — Given acknowledged assignment removal, when a later read begins, then that assignment cannot authorize it.
- [ ] **US-057-AC4** — Given historical resource data, when I read it, then current subject authority and retained historical resource ownership govern access.
- [ ] **US-057-AC5** — Given a cursor or cached result from older authority, when policy or membership changes, then it cannot bypass fresh admission.
- [ ] **US-057-AC6** — Given a history, feed, serving copy or export, when access is requested, then its declared propagation and completeness contract is enforced.
- [ ] **US-057-AC7** — Given absent retained ownership, stale authority or unavailable required guards, when I request access, then it refuses without effects or hidden disclosure.
- [ ] **US-057-AC8** — Given a failed profile migration or rollback, when recovery occurs, then ordinary access cannot become broader than the prior admitted policy.

## Edge Cases

Incomplete facts refuse access; equal labels do not imply equal identity.
Unsupported native behavior cannot be downgraded to a successful translation.

## Test Scenarios

| Scenario | State | Expected |
| --- | --- | --- |
| Assigned Staff | Alice active on Project A; resource owned by A | Read permitted after all obligations |
| Sibling Project | Alice assigned A; resource owned by B in same Client | Read denied |
| Revoked assignment | Alice has no current active assignment to A | Later read denied |
| Incomplete facts | Assignment provider has incomplete coverage | No authorized disclosure |

## Dependencies

FEAT-008, FR-45, CONTRACT-062/063, SD-008, TD-057. US-056 and US-057 depend on US-079 interpretation.

## Out of Scope

Production administration, arbitrary policy code and recursive inheritance.
