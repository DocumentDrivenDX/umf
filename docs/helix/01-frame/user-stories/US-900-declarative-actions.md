---
ddx:
  id: US-900
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-900: Author and inspect a declarative action

**Feature:** FEAT-900. **Feature Requirements:** ACT-01–08; ACT-09–13 add profile metadata
obligations, while runtime behavior is allocated to separate executor witnesses.
**PRD Requirements:** FR-51; supporting FR-4/5/22/27/34/39/41.
**Priority:** Design selected; build ordering unselected. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to author and inspect a
versioned action contract, **so that** clients and executors see its claimed
change and unresolved obligations before deciding to invoke it.

## Context

A create-and-link action needs more than a DDD operation name. This slice
provides portable declaration tooling and conservative capability comparison.
It invokes no handler, evaluates no state predicate and mutates no stored data.
CONTRACT-900 owns exact fields, diagnostics and executor obligations.

## Walkthrough

1. Select an existing keyed Record and two related keyed Records.
2. Declare an action creating one Record and linking it to the inputs, including
   a condition, role policy, attribution and replay obligations.
3. Inspect reference/type errors and unchecked rules and capabilities.
4. Serialize and recover the declaration with unfamiliar content intact.
5. Compare with a supplied executor profile; unsupported or unknown obligations
   block eligibility while the complete source remains inspectable.

## Acceptance Criteria

- **US-900-AC1:** Given a current keyed model, when an action is authored and
  inspected, then stable identity, typed parameters and declared targets resolve
  without substituting names or DDD identity.
- **US-900-AC2:** Given conditions and a named handler, when inspected, then their
  metadata/failure reasons survive, unchecked meaning is visible and no code,
  network call or state evaluation runs.
- **US-900-AC3:** Given create/link effects and property changes, when checked,
  then contract read/write frames and postconditions remain distinct from recipe
  execution; a handler binding can express a conditional no-op without pretending
  every permitted write is required. Recipe references resolve only to earlier
  creates, property targets
  belong to their Records and no cascade, default or extra effect is inferred;
  invalid ordering or membership refuses.
- **US-900-AC4:** Given authorization, attribution, replay and result obligations,
  when inspected, then all are discoverable and missing declarations refuse
  without treating metadata as enforcement evidence; role/policy variants,
revision requirements and advisory preview metadata remain distinct.
- **US-900-AC5:** Given an executor profile, when assessed, then every condition,
  effect and mandatory obligation receives a supported, unsupported or unknown
  outcome; unsupported/unknown relevant meaning blocks eligibility.
- **US-900-AC6:** Given future action members and unrelated extension content,
  when read/written in JSON/YAML, then all content survives; relevant unknown
  meaning blocks safe action edits while unrelated extensions survive.
- **US-900-AC7:** Given a DDD operation alongside an action, when inspected, then
  only an explicit binding associates them and meanings remain independent;
  DDD/API names never manufacture an action.
- **US-900-AC8:** Given invalid input, duplicate IDs, unsupported versions or
  limit excess, when a public operation runs, then stable code/path/severity
  diagnostics or atomic refusal occurs without source mutation/partial output.
- **US-900-AC9:** Given the public bundle, when the corpus runs in Chromium and
  Bun, then scoped outputs/diagnostic sets agree without host-only dependencies
  or a mandatory transformation server.

## Edge Cases

Composite keys may be declared even when an executor refuses them. Temporal/float
value evaluation and arbitrary expressions remain unchecked. Association Records
can distinguish links sharing endpoints. Report mode cannot waive obligations.

## Test Scenarios

| Scenario | AC | Outcome |
| --- | --- | --- |
| Create order, link customer/product | AC1/3/4 | Three inspectable effects; no write. |
| Generated endpoint before create | AC3/8 | Refuse at endpoint path; source unchanged. |
| Unknown predicate engine | AC2/5 | Preserve; unknown capability and ineligible. |
| Same name in two modules | AC1/7 | Exact identities remain distinct. |
| Unknown effect member | AC5/6 | Preserve; safe edit and eligibility refuse. |

## Dependencies

FEAT-900, CONTRACT-900, SD-900, TD-900, STP-900; core 0.8.0 and existing registry
and serialization. US-050 is not required for this local-only slice. Planned
STP-900 tests are not executed evidence.

## Out of Scope

Store execution of the acceptance sketch, event publication, downstream adoption,
independent Python action validators and cross-document references. Each requires
separate profile/version evidence before a support claim.

## Iteration 2 boundary

CONTRACT-901 defines the first executable profile. Public-library AC2/4/5/8
must exercise its declaration/profile metadata without implementing runtime
execution. EX-01–EX-05 in STP-900 allocate ACT-09–13 runtime witnesses separately.
Their passing results cannot be inferred from US-900 or the earlier SQL harness.
