---
ddx:
  id: FEAT-004
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-004: Independent DDD semantics

**Priority:** P0. **PRD:** FR-40; supports FR-41.

## Problem and Outcome

Preserve domain meaning across physical projections. A bounded context is explicit
semantic intent attached to a module, not just a namespace. Aggregates, identities,
events and repositories must not acquire table, graph-node or endpoint semantics
merely because one consumer uses those representations.

## Requirements

- DDD-01: Represent contexts, entities, value equality, identities, relationships,
  aggregate boundaries, events, services, repositories and invariant declarations.
- DDD-02: Keep same-named concepts distinct across contexts. Represent directional,
  partial context mappings, anti-corruption-layer ownership and local terminology.
- DDD-03: Reject broken references, ownership and boundary contradictions; preserve
  unknown content and opaque rules without claiming enforcement or equivalence.
- DDD-04: Expose copied semantic metadata and atomic edits; use explicit bindings
  and fidelity reports for physical projections.

## Stories and Boundaries

US-005 implements the versioned semantic profile. CONTRACT-005 defines the native
UMF-authored format; no external DDD tool compatibility is claimed. Document, SQL,
OpenAPI, Axon and Palantir projections are separate work. General concepts remain
extension-owned until independent bidirectional evidence justifies core promotion.
