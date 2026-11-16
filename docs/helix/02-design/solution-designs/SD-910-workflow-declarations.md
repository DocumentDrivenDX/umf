---
ddx:
  id: SD-910
  type: solution-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-910
      kind: informed_by
    - id: ADR-007
      kind: informed_by
    - id: CONTRACT-910
      kind: informed_by
---

# SD-910-workflow-declarations

## Scope

Feature scope includes workflow interchange and preparation. A consumer authors a per-record workflow, interchanges the exact declaration
and selects an offline preparation profile. ADR-007 allocates provider
execution and durable state to the consumer.

## Requirements mapping

US-910-AC1–AC8 cover timing, routing, admission, guards, evidence, preservation,
drain and external effects. STP-910 assigns the observable proof.

## Solution approaches

An independently versioned workflow artifact composes the core 0.10 extension
envelope with a closed profile. The existing Saga profile describes
transactional steps and compensation. The companion external-action profile
covers asynchronous provider results and ambiguous delivery.

## Domain model

A definition owns a version, unique steps, named effects and explicit outcomes.
It retains the original source and produces a canonical prepared definition.
A consumer supplies authorized snapshots, enrollment pins and logical time.
Evidence names the definition digest, property, bounds and result.

## System decomposition

The common Rust engine admits source and checks graph and value semantics.
Bindings expose preparation. Consumer code owns clocks, persistence,
execution and audit. Interchange accepts and preserves unchecked members.

## Traceability

[US-910](../../01-frame/user-stories/US-910-author-workflow-declarations.md),
[CONTRACT-910](../contracts/CONTRACT-910-workflow-declarations.md),
[TD-910](../technical-designs/TD-910-workflow-declarations.md) and
[STP-910](../../03-test/test-plans/STP-910-workflow-declarations.md)
