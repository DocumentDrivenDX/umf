---
ddx:
  id: FEAT-005
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-005: Author and project UMF core ideals

**Priority:** P0. **Covered subsystem:** Semantic representation and core.
**Covered PRD requirements:** FR-3, FR-20, FR-21, FR-28, FR-42.
**Cross-subsystem rationale:** FR-42 adds relationship authoring to the core
ideal gate; FEAT-006 covers its physical bindings and generators.

## Overview

Allow a metamodel author to state portable intent before all native systems agree,
and let consumers inspect that intent alongside explicit native refinements.

## Ideal Future State

An author defines fields, availability, containers, facets and keys once, then
inspects exact mappings, approximations and refusals for each priority target.
Native recovery never depends on erasing distinctions to make the ideal fit.

## Problem Statement

The old inclusion gate conflated defining UMF semantics with proving replaceable
native semantics. Nine scalar families are useful but insufficient for useful
table projections, forms or validators. Native counterexamples must qualify
projections rather than prohibit UMF from defining author intent.

## Requirements

- IDEAL-01: Define one concept at a time in order: field, nullability,
  cardinality, author-stated facets, key, relationship. CONTRACT-040 owns the
  first five meanings; CONTRACT-041 owns relationship meaning.
- IDEAL-02: Expose author assertions separately from native classifications;
  preserve disagreement and unknown content, and diagnose stale classifications.
- IDEAL-03: Support strict and report projections to the five priority systems;
  an unenforced target assertion must remain a visible residual.
- IDEAL-04: Verify both ideal/native/ideal and native/ideal/native recovery.
- IDEAL-05: Separate at-least-two-system ideal admission from all-five delivery
  and from native-replacement equivalence with migration and rollback.

## User Stories

US-040 field, US-041 nullability, US-042 cardinality, US-043 facets, US-044 key
and US-045 relationship provide the ordered vertical slices. Each has its own
technical design. Relationship implementation follows the key five-system gate.

## Edge Cases and Error Handling

Native disagreement is retained, not silently resolved. Unknown encoding or
malformed ideals block unsafe operations. Strict mode blocks requested losses;
report mode exposes each loss without certifying enforcement or equivalence.

## Success Metrics

Every requested ideal assertion has a qualified outcome in each priority target;
all supported native archives remain recoverable; all permanent counterexamples
remain failing exact projections. Native support versions and evidence are published.

## Out of Scope

OWL, DDD lifecycle, physical encoding and default execution stay in extensions.
This authoring change does not modify the current envelope or claim implementation.
