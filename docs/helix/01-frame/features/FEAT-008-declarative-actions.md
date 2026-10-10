---
ddx:
  id: FEAT-008
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
    - id: umf.cross-cutting-requirements
      kind: informed_by
---

# FEAT-008: Declarative action contracts

**Priority:** Requirements/design selected by owner on 2026-10-08; implementation
release order remains unselected.
**Covered PRD Subsystem(s):** Extensions and Partial Participation.
**Covered PRD Requirements:** FR-51; supporting FR-4/5/22/27/34.
**Cross-Subsystem Rationale:** One extension capability; browser metadata access
uses FR-39/41 without owning the broader consumer requirements.

## Overview

An action is an authored, discoverable declaration of a permitted change to a
logical model. UMF must preserve its inputs, conditions, effects and executor
obligations without executing a business system. Source: section 1 of the
[consumer proposal](../../00-discover/consumer-requirements-input.md).

## Ideal Future State

A client can explain what an action asks for and claims to change. An executor
can compare that declaration with its exact supported profile and refuse an
unsupported obligation before a write. Authors can exchange the same contract
without losing unfamiliar content or claiming equivalent execution.

## Problem Statement

Existing domain-driven design (DDD) service operations name inputs, outputs and
events but do not describe mutation semantics. Consumers otherwise invent
incompatible rules for effects, failures and replay. Structural validity cannot
establish that a transaction or permission check will occur.

## Requirements

- ACT-01: Authors must declare stable action identity, presentation, typed inputs
  and exact model references. Entity inputs must identify a declared Key rather
  than infer identity from a display name or DDD field list.
- ACT-02: Actions must declare preconditions and postconditions with explicit
  pre/post-state binding and stable
  failure identities and explanations. Uninterpreted rules remain preserved and
  visibly unchecked; declaration validation must not imply rule evaluation.
- ACT-03: Actions must distinguish semantic pre/postconditions and bounded
  reads/permitted writes from execution bindings. The first graph profile supports
  ordered create/set/delete/link/unlink recipes or an exact handler implementing
  the same bounded contract. Later recipe effects may reference earlier creates.
  Implicit cascades and cross-store atomicity must not be inferred. A write frame
  permits changes; it does not require them or imply branch behavior.
- ACT-04: Contracts must state result identity/version and freshness-receipt
  obligations, optional caller-key idempotency, attribution and an exact authorization
  profile. The first graph profile requires a human and invocation roles. Stable
  keyed replay identity must survive deployment; revision/input/expected-version
  are checked payload. Executor support must be declared separately.
- ACT-05: Named handler hooks must remain discoverable and inert in UMF. Their
  read/write and postcondition obligations must have declared boundaries; a handler's presence verifies no effect.
- ACT-06: Inspection must distinguish invalid declarations, unknown meaning,
  unsupported capabilities and unverified execution claims. Reports retain source
  and identify each condition/effect by stable identity.
- ACT-07: JSON/YAML recovery and independent versioning must preserve unknown/native
  content. Relevant unknown meaning blocks safe semantic edits and execution
  eligibility; unrelated extensions must not vanish.
- ACT-08: DDD operations and native API descriptions coexist with actions through
  explicit references. Operation names, endpoints and events infer no action.

- ACT-09: An executable profile must define type-checked rule/selector semantics,
  pre/post-state access (including qualified association membership), numeric/null
  behavior and dependency coverage. Missing
  semantics or undeclared reads must block qualification, never infer execution.
- ACT-10: Authorization declarations must distinguish role profiles from general
  policy bindings. Current permission must gate protected replay/preview details;
  a profile must declare its authorization decision point and consistency limits.
- ACT-11: Invocation, revision activation/retirement, outcome lookup and replay
  expiry must have explicit protocols. Retained interpretation and authenticated
  durable result lookup must survive handler retirement.
- ACT-12: Executors must canonicalize cross-Key aliases, distinguish invariant-validation
  dependencies from handler reads, qualify concurrency/invariant boundaries and enforce
  handler data access. Audit must link actor/service, exact declaration/handler/
  policy versions and terminal decision without exposing unauthorized details.
- ACT-13: Preview must report its state/profile basis and limits without reserving
  a future commit. Schema evolution must distinguish new revisions from proven
  caller compatibility; bulk, workflow and external effects require separate
  profiles rather than inherit single-action guarantees.

## User Stories

[US-900](../user-stories/US-900-declarative-actions.md) owns the library journey:
author, inspect, serialize and assess a declaration. Runtime execution is a
separate consumer-owned qualification gate, not a UMF runtime story.

## Edge Cases and Error Handling

Unknown conditions, handler semantics and effect kinds retain content but cannot
be certified for execution. Missing targets, duplicate IDs, forward references
to generated entities and property changes outside Record membership refuse.
Executor replay, authorization races and atomic failures require consumer evidence.

## Success Metrics

All US-900 criteria must have exercising, cited Bun and scoped Chromium proof
where allocated. The declaration corpus must have zero unreported serialization
loss. Execution claims must name executor version, profile/subset and evidence;
metadata validation earns no execution claim. Resource-limit cases must publish
no partial result; no throughput/latency claim is selected.

## Constraints and Assumptions

Retain existing concerns: ADR-002 TypeScript/Bun, fidelity, identity/composition,
portable bounded processing, conformance, composability and durable runtime
separation. No new datastore, authentication provider or UI concern is selected:
UMF is a library. Roles/person identifiers describe obligations, not an identity
service. Initial references stay within one core 0.8.0 document.

## Dependencies

CONTRACT-001/040/041/049 own envelope, Record/Field/Key, relationships and values.
CONTRACT-005 owns DDD independently. CONTRACT-056 owns the action surface; CONTRACT-057 owns the proposed first
executable profile and protocol; SD-008,
TD-900 and STP-900 own realization and verification. Cross-document action
references await US-050 and a separate action extension revision.

## Out of Scope

Storage/query execution, workflow orchestration, sagas, compensation, distributed
transactions, native Palantir equivalence, automatic CRUD generation, new core
scalar semantics, general constraint evaluation and authority/routing vocabulary.

## Decisions and Open Questions

Design choice: an extension rather than core syntax; no useful native action
admission evidence exists. First delivery is declaration tooling. The first executable design now selects bounded rules/selectors and a
transactional protocol in CONTRACT-057. Store deployment, handler implementations
and production policy bindings remain unselected and unqualified; assessment
refuses absent exact profiles and evidence. This does not block the library design.
Release scheduling and downstream integrations remain owner decisions.
