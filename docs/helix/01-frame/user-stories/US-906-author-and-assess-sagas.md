---
ddx:
  id: US-906
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-901
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-906: Author and assess a saga

**Feature:** [FEAT-901](../features/FEAT-901-saga-semantics.md)
**Feature Requirements:** SAGA-01–06, SAGA-18–23
**PRD Requirements:** FR-57
**Priority:** P0 within the saga capability.

## Story

**As a** Schema Integration Maintainer,
**I want** to author, exchange and assess a saga against declared executor capabilities,
**So that** application teams can identify unsupported recovery obligations before deployment.

## Context

The fabricated equipment-allocation model has reserve, allocate and release
actions. Reservation and allocation commit independently. The maintainer must
express the intended recovery and distinguish a valid definition from an
executor qualified to run it. The saga contract will own exact shared surfaces.

## Walkthrough

1. The maintainer supplies exact model/action artifacts and profiles.
2. They declare reservation followed by allocation, with release as reservation's compensation.
3. They bind the reservation's typed output into later forward and recovery inputs.
4. The inspector explains intended effects, compensation order and execution limits.
5. The maintainer exchanges the definition as JSON and YAML and assesses a consumer's claims.
6. They receive supported and unsupported obligations without any business invocation.

## Acceptance Criteria

- [ ] **US-906-AC1** — Given a complete sequential reservation/allocation definition, when inspected, then exact action identities and forward order are recoverable independently of display names.
- [ ] **US-906-AC2** — Given allocation consuming reservation's typed output, when assessed, then compatible earlier-output bindings are accepted while missing, later-step and incompatible bindings prevent eligibility.
- [ ] **US-906-AC3** — Given missing or cyclic dependencies, when inspected, then diagnostics locate the invalid references without publishing an eligible partial composition.
- [ ] **US-906-AC4** — Given forward actions with explicit release compensation, when inspected, then the compensation action and its retained-input dependencies are recoverable in reverse completion order.
- [ ] **US-906-AC5** — Given an irreversible notification step, when inspected, then its irreversible effect remains explicit and no inverse action is inferred.
- [ ] **US-906-AC6** — Given a step with no declared compensation disposition, when assessed, then eligibility refuses rather than assuming the step is reversible or harmless.
- [ ] **US-906-AC7** — Given a valid saga with unfamiliar recovery content and an unrelated native extension, when exchanged as JSON and YAML, then both payloads retain their original meaning and the recovery obligation remains unchecked.
- [ ] **US-906-AC8** — Given relevant unknown recovery meaning, when execution eligibility or a dependent semantic edit is requested, then it refuses without losing the retained source content.
- [ ] **US-906-AC9** — Given a consumer supporting transactional actions but no saga coordination, when assessed, then action support is distinguished from unsupported saga obligations and unverified execution.
- [ ] **US-906-AC10** — Given an external-effect step claiming only single-store transactional support, when assessed, then the unsupported effect profile prevents eligibility without changing the referenced action's semantics.
- [ ] **US-906-AC11** — Given supplied declarations naming code or remote resources, when portable inspection runs, then it loads no artifact-supplied executable code, fetches no resources and performs no business effects.
- [ ] **US-906-AC12** — Given inputs at and beyond the selected profile's finite bounds, when inspected, then admitted complete inputs and explicit limit refusals are distinguishable without truncated eligible results.
- [ ] **US-906-AC13** — Given the same versioned declaration corpus and independently specified expected diagnostics, when Bun and Chromium inspect it, then their results agree with the oracle for the declared subset without claiming host execution support.
- [ ] **US-906-AC14** — Given all required steps with confirmed successful outcomes or a later failure followed by completed compensation, when completion meaning is inspected, then forward success and compensated termination remain distinct without asserting distributed atomicity.

- [ ] **US-906-AC15** — Given an external notification or agent effect assigned only a different handler/profile on actions 0.1.0, when assessed, then the single-store declaration prevents eligibility; only a separately versioned compatible declaration contract plus qualified executor profile may establish support.
- [ ] **US-906-AC16** — Given a saga referencing a supported recipe action, when assessed, then recipe binding alone does not disqualify it; typed output availability and all remaining obligations are checked independently.

## Edge Cases

- A compensation with a wrong input type fails assessment even if its display name matches a forward action.
- Missing exact dependencies remain unresolved; no newest-version or network fallback is inferred.
- Known malformed content is invalid; unfamiliar retained semantics remain separately incomplete.
- Parallel branches and loops retain unfamiliar content but gain no first-profile execution eligibility.

## Test Scenarios

| Scenario | AC ID | Input / State | Action | Expected Result |
| --- | --- | --- | --- | --- |
| Explain reservation | US-906-AC1 | Reserve then allocate | Inspect | Exact identities and order retained. |
| Wrong binding | US-906-AC2 | Allocation expects a reservation Key; binding supplies display text | Assess | Type mismatch prevents eligibility. |
| Missing release input | US-906-AC4 | Release refers to original reservation output | Inspect | Original output retention obligation visible. |
| Irreversible message | US-906-AC5 | Notification explicitly irreversible | Inspect | No invented unsend action. |
| Unknown recovery | US-906-AC7 | Future compensation annotation and native source payload | Round trip | Both retained; unknown recovery remains unchecked. |
| Incomplete consumer | US-906-AC9 | tx/1-only consumer claims | Assess | Saga execution unsupported. |
| Profile overflow | US-906-AC12 | Definition exceeds its selected step bound | Inspect | Explicit refusal with no eligible prefix. |

## Dependencies

FEAT-901 and FR-57 govern this story. FEAT-900, CONTRACT-001/040/041/049 and
CONTRACT-900/901/904 constrain envelope, types and unchanged action semantics.
The exact saga contract and profile bounds must precede implementation.
US-905 addresses consumer recovery evidence separately.

## Out of Scope

Executing a saga, selecting a datastore or workflow engine, native provider
qualification, generating UI, and implementing a general-purpose process language.
