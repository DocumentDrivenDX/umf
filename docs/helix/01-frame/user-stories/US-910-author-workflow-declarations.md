---
ddx:
  id: US-910
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
---

# US-910 Author a portable per-record workflow declaration

## Story

**As a** workflow consumer, **I want** to declare a per-record effect, wait,
branch and exit in UMF. **So that** I can interchange the definition and test
it against my runtime.

## Context

The consumer needs waits and external effects across independent record
enrollments. Core interchange and transactional actions cover different
parts of that workflow.

## Walkthrough

Author a send step, a pause, a predicate branch and an exit. Inspect the
original source and prepare it for the selected workflow profile. Supply
a record and its pinned version to the consumer runtime.

## Acceptance criteria

| Criterion | Outcome | Source |
| --- | --- | --- |
| US-910-AC1 | Type waits and resolve one correlated event or deadline by deterministic rules. | #163 |
| US-910-AC2 | Admit total, explicit and acyclic routing. | #164 |
| US-910-AC3 | Preserve record-local behavior across batches and singleton processing. | #165 |
| US-910-AC4 | Type guards and test optional presence before reading values. | #166 |
| US-910-AC5 | Keep scoped evidence and counterexamples bound to a checked definition. | #167 |
| US-910-AC6 | Preserve unknown source on interchange and identify it at compile refusal. | #168 |
| US-910-AC7 | Pin in-flight work to an identified definition and retain its dependencies through drain. | #169 |
| US-910-AC8 | Declare external effects with typed outcomes, retry identity and await semantics. | #170 |


Given a valid send and wait declaration, when I compile the original bytes,
then the prepared workflow can select a correlated reply or its deadline.

## Edge cases

A previous enrollment's reply cannot choose the current branch. A deadline
wins its exact tie with a matching reply. Unknown provider outcomes remain
explicit even when the workflow holds the record.

## Test scenarios

Use an eight-step follow-up and a 90-fixed-day pause. Permute and duplicate the
input event set. Replay a send with a different body under the same identity.

## Dependencies

CONTRACT-001 source preservation, CONTRACT-065 exact instants, elapsed
duration from CONTRACT-909, and workflow ownership from ADR-007.
