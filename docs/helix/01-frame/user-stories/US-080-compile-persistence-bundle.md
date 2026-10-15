---
ddx:
  id: US-080
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
---

# US-080: Compile a reviewable persistence bundle

**Feature:** [[FEAT-028]]. **Feature Requirements:** PY-01, PY-03, PY-04, PY-05, PY-06.
**PRD Requirements:** FR-52. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to compile a pinned local UMF selection into a reproducible source bundle,
**So that** I can review every interpreted assertion and regenerate without losing source or hand edits.

## Context

The source archive is the recovery authority. A successful render is not execution admission; unsupported relevant semantics must refuse before code is available. Exact public surfaces belong to CONTRACT-001/040/041/042/049/051 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-080-AC1** — Given identical pinned sources in Bun and Chromium, when I compile twice, then all bundle bytes and diagnostics agree.
- [ ] **US-080-AC2** — Given unknown metadata on selected and unselected records, when I request generation, then selected unknown meaning refuses while unselected content remains recoverable.
- [ ] **US-080-AC3** — Given missing local dependencies or unresolved physical choices, when I compile, then no names or storage meaning are inferred.
- [ ] **US-080-AC4** — Given colliding names, hostile literals or oversized output, when I compile, then unsafe or over-limit generation refuses without executable fragments.
- [ ] **US-080-AC5** — Given an existing generated bundle with a hand edit, when I regenerate, then the edit and previously selected bundle remain intact.
- [ ] **US-080-AC6** — Given a known report-mode approximation, when I compile, then only safe explicit losses can produce a candidate.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| bundle_is_reproducible | US-080-AC1 | identical pinned sources in Bun and Chromium | all bundle bytes and diagnostics agree |
| relevant_unknown_refuses | US-080-AC2 | unknown metadata on selected and unselected records | selected unknown meaning refuses while unselected content remains recoverable |
| unresolved_meaning_refuses | US-080-AC3 | missing local dependencies or unresolved physical choices | no names or storage meaning are inferred |
| unsafe_output_refuses | US-080-AC4 | colliding names, hostile literals or oversized output | unsafe or over-limit generation refuses without executable fragments |
| writer_preserves_user_edits | US-080-AC5 | an existing generated bundle with a hand edit | the edit and previously selected bundle remain intact |
| report_mode_is_conservative | US-080-AC6 | a known report-mode approximation | only safe explicit losses can produce a candidate |

## Dependencies

CONTRACT-001/040/041/042/049/051; CONTRACT-067; scoped compiler boundary scaffold. Feature requirements: PY-01, PY-03, PY-04, PY-05, PY-06; PRD FR-52.
STP-080 owns exact test mapping; TD-080 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
