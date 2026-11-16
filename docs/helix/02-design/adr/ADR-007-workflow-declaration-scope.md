---
ddx:
  id: ADR-007
  type: adr
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: CONTRACT-908
      kind: informed_by
---

# ADR-007 Workflow declaration scope

## Problem

Consumer workflows need portable external effects, waits and branching. The
existing Saga contract allocates sequential transactional action coordination.

## Decision

UMF defines versioned workflow declarations, their offline interchange,
static semantics, portable transition obligations and scoped evidence. Consumer
runtimes supply the authorized record snapshot, stable record and enrollment
identity, logical clock, state storage, scheduling, event ingestion, provider
execution and recovery. Pure decision helpers can operate over explicit inputs.
This allocation follows NFR-50. [#169](https://github.com/DocumentDrivenDX/umf/issues/169)

The initial profile has an acyclic graph, single record scope, external effect
declarations, guarded steps and correlated waits. Saga remains the sequential
transactional-action and compensation profile under CONTRACT-908. Registry or
provider configuration cannot reinterpret a workflow definition version.

## Why we chose this

The profile has explicit preparation semantics and leaves operational decisions
to a consumer with custody of the authorized record. This allows independent
implementations to check the same declarations.

## Consequences

The reuse bar is unchanged input bytes and shared vectors consumed by two
independent implementations, including a workflow runtime or interpreter
exercising the complete trace and a separately implemented validator or
compiler. Static schema acceptance alone is insufficient. Claims name the exact
profile, implementations, properties, failed findings and test bounds. The
consumer model and interpreter cited in the issue set have unconfirmed custody.
