---
ddx:
  id: FEAT-900
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

# FEAT-900: Declarative action contracts

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
executable profile and protocol; SD-900,
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

## Portable action plans and frozen-manifest UPDATE — owner direction, 2026-10-13

- PAP-UMF-01: Portable plans must reference immutable, registered `umf.actions` declarations and typed invocations. No parallel mutation vocabulary or core action primitive is introduced.
- PAP-UMF-02: Plan/manifest inspection must retain exact model/action/profile pins, selection basis, ordered unique target identities, typed proposed values and conflict assertions. Relevant unknown semantics block execution eligibility while unknown content remains preserved.
- PAP-UMF-03: Capability assessment must distinguish declaration validity, executable action support, selection support, batch/replay support and independently qualified execution. Plan metadata never grants authority.
- PAP-UMF-04: Frozen manifests define exact queued work; batch atomicity and whole-job partial completion must be explicit. The existing transactional profile is not widened silently.

Governing requirement amendment: `umf.prd`, portable action plans section. Reuse ACT-01 through ACT-12; new story allocation remains required.

## Bulk UPDATE contract and story allocation — 2026-10-13

Contracted first slice: `umf.actions.plan/1`, `umf.actions.manifest/1`, `umf.actions.bulk/1`, built against core0.8.0/actions0.1.0 and the existing tx/1 invocation. The first executable subset is required one-valued boolean/integer/string Fields; null/nullable, decimal and other scalar mutation domains are explicit refusals for this proof, not losses of preserved UMF meaning.

| Story | Owned output | Design/test allocation |
| --- | --- | --- |
| [US-902](../user-stories/US-902-portable-action-plans.md) | 7 planned criteria including local profile pairing: bulk-update-portable-action-plans | [TD-902](../../02-design/technical-designs/TD-902-portable-action-plans.md) / [STP-902](../../03-test/test-plans/STP-902-portable-action-plans.md) |
| [US-903](../user-stories/US-903-frozen-action-manifests.md) | 8 planned criteria including construction/local companion: bulk-update-frozen-action-manifests | [TD-903](../../02-design/technical-designs/TD-903-frozen-action-manifests.md) / [STP-903](../../03-test/test-plans/STP-903-frozen-action-manifests.md) |

The [machine-readable bulk allocation](../../03-test/bulk-update-story-allocation.json) is a separate new-slice inventory; planned rows are not passed coverage. Every story/criterion has one primary test allocation and retains its original canonical citation.

## Browser-local profile addition — 2026-10-15

PAP-UMF-05: Keep the static website and execute local sample work through a separately named local-owner profile over original action/model/Key/manifest meanings. Old native/human semantics and producer pins remain unchanged. Exact actor+policy+invocation pairing, independent local bulk claims, relevant unknown/mixed-profile refusal, genuine Truss storage and original Weft lowering are mandatory. Public activation depends on actual browser storage/atomicity/recovery tests; metadata validity is not runtime support. CONTRACT-905 governs this branch, allocated to US-902-AC7 and US-903-AC8.
