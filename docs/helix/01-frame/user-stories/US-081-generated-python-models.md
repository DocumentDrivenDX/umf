---
ddx:
  id: US-081
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
---

# US-081: Use generated Python instance models

**Feature:** [[FEAT-028]]. **Feature Requirements:** PY-02, PY-03, PY-04.
**PRD Requirements:** FR-52. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to use generated instance models for complete rows, creation, patches, keys and named results,
**So that** I can catch incorrect field use statically and preserve exact instance meaning at runtime.

## Context

Presence, nullability and server generation are independent. Pydantic strictness alone does not establish exact decimal/timestamp semantics or deep immutability. Exact public surfaces belong to US-080 and
CONTRACT-067–069, not this story.

## Walkthrough

1. The maintainer selects the original source models and exact supported profile.
2. The maintainer invokes generation and inspects its report and retained originals.
3. The maintainer runs this slice's static/native or conformance checks.
4. The maintainer accepts only the explicitly qualified scope, preserving refusals.

## Acceptance Criteria

- [ ] **US-081-AC1** — Given complete rows, create inputs and patch inputs, when I validate and encode them, then omission and null follow explicit view bindings, default declarations remain unexecuted and generated fields follow their declared rules.
- [ ] **US-081-AC2** — Given exact integer/decimal/date/time examples, when I validate and encode, then values retain their qualified meaning or refuse before conversion.
- [ ] **US-081-AC3** — Given generated models with nested mutable values, when I mutate nested state and encode, then the boundary detects invalid state despite prior model construction.
- [ ] **US-081-AC4** — Given valid and deliberately invalid Python clients, when I run the pinned checker, then valid clients pass and invalid uses fail for the intended typing reason.
- [ ] **US-081-AC5** — Given a generated package outside the UMF checkout, when I install its declared dependencies and import it, then models work without compiler, JavaScript or UMF imports.

## Edge Cases

Changed versions, unavailable authority and unrecognized relevant meaning refuse;
no inferred identity or widening fallback supplies a substitute. Partial evidence
must remain visibly incomplete rather than count as the successful journey.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| presence_survives_codecs | US-081-AC1 | complete rows, create inputs and patch inputs | omission and null follow explicit view bindings, default declarations remain unexecuted and generated fields follow their declared rules |
| exact_values_refuse_loss | US-081-AC2 | exact integer/decimal/date/time examples | values retain their qualified meaning or refuse before conversion |
| nested_state_is_revalidated | US-081-AC3 | generated models with nested mutable values | the boundary detects invalid state despite prior model construction |
| static_contract_is_inspectable | US-081-AC4 | valid and deliberately invalid Python clients | valid clients pass and invalid uses fail for the intended typing reason |
| generated_package_is_independent | US-081-AC5 | a generated package outside the UMF checkout | models work without compiler, JavaScript or UMF imports |

## Dependencies

US-080; CONTRACT-068 and exact Python/Pydantic/type-checker profile spike. Feature requirements: PY-02, PY-03, PY-04; PRD FR-52.
STP-081 owns exact test mapping; TD-081 owns story implementation detail.

## Out of Scope

Adjacent backend/engine paths, automatic migrations, universal enforcement and
unexecuted platform qualification. Consumer adoption does not follow from source
compilation or planning review alone.
