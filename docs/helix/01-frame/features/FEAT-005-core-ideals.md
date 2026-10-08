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

**Priority:** P0.
**Covered PRD Subsystem(s)**: Semantic Representation and Core
**Covered PRD Requirements**: FR-2, FR-3, FR-8, FR-20, FR-21, FR-28, FR-35, FR-39, FR-41, FR-42
**Cross-Subsystem Rationale**: FR-42 adds relationship authoring to the core ideal gate; FEAT-006 covers its physical bindings and generators.

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
- IDEAL-06 (owner direction, 2026-10-04, recorded in CONTRACT-049): Implement CONTRACT-049 shared titles,
  examples, aliases, collection bounds, allowed values, exact numeric ranges,
  minimum length and explicit literal defaults with migration/rollback and
  unknown preservation. Native admission remains separately evidenced.
- IDEAL-07: Separate source format documentation, input parsing, output rendering,
  allowed-value assertions and structural constraints. Legacy format text must
  remain recoverable; interpretation requires explicit provenance and must not
  invent authored constraints. CONTRACT-050 defines the separation boundary.
- IDEAL-08 (owner direction, 2026-10-07): Share browser-compatible JavaScript
  numeric admission and lossless value conversion for Truss, Ashlar and TableSpec.
  Retain exact decimal spelling and convert bigint through integer tokens, checking
  declared Field constraints when supplied. JavaScript number/bigint are runtime
  representations, not additional core scalar families. Database transport and
  storage codecs remain in Truss/Weft. CONTRACT-049 defines the bounded API.

## User Stories

US-040 field, US-041 nullability, US-042 cardinality, US-043 facets, US-044 key
and US-045 relationship provide the ordered vertical slices. Each has its own
technical design. Relationship implementation follows the key five-system gate.

[US-054](../user-stories/US-054-javascript-numeric.md) exercises IDEAL-08's
numeric consumer journey under FR-8/39/41. It adapts runtime values to existing
literal carriers without entering IDEAL-01's semantic-promotion sequence.

## Edge Cases and Error Handling

Native disagreement is retained, not silently resolved. Unknown encoding or
malformed ideals block unsafe operations. Strict mode blocks requested losses;
report mode exposes each loss without certifying enforcement or equivalence.

## Success Metrics

Every requested ideal assertion has a qualified outcome in each priority target;
all supported native archives remain recoverable; all permanent counterexamples
remain failing exact projections. Native support versions and evidence are published.

For IDEAL-08, every admitted value must retain its exact mathematical value,
every refused conversion must be observable, and all nine US-054 acceptance
criteria must have executable traceability. Exact token spelling survives
serialization; successful value conversion does not promise lexical recovery.

## Out of Scope

OWL, DDD lifecycle, physical encoding, computed defaults and native default
execution stay in extensions. CONTRACT-049 defines explicit literal substitution
as a pure consumer operation; it never mutates stored rows.
This authoring change does not modify the current envelope or claim implementation.

## Unplaced temporal-facet proposal

[US-052](../user-stories/US-052-temporal-facets.md) and
[CONTRACT-047](../../02-design/contracts/CONTRACT-047-temporal-facets.md) frame
author-stated instant/civil timestamp meaning, date-free time meaning,
fractional-second precision and original-offset retention. This proposal is
outside IDEAL-01's current ordered delivery gate until the owner places it.
Its candidate core status requires FR-3 admission evidence from two priority
systems; otherwise the semantics stay in a published extension with fidelity
reports. Neither the existing facet implementation nor Key equality gains
temporal meaning from this framing alone.

## Constraint-ideal proposal and core-task placement

[US-053](../user-stories/US-053-constraint-ideals.md) and
[CONTRACT-048](../../02-design/contracts/CONTRACT-048-constraint-ideals.md)
triage allowed-value sets, exact numeric ranges and minimum length as candidate
core value assertions. Pattern and opaque record-level invariants are proposed
for a separately published `umf.constraints` extension with interpretation
status and fidelity reports. Temporal ranges wait for CONTRACT-047's temporal
meaning and a separate ordering decision. None enters IDEAL-01's ordered
delivery or `spec/core/` without owner placement, FR-3 evidence, a versioned
migration and rollback; native CHECK or enum observations do not imply authored
intent or enforcement of existing rows.

The owner selected allowed values, exact numeric bounds and minimum length for
core implementation on 2026-10-04 through CONTRACT-049, together
with descriptive metadata, collection size and literal defaults. This placement
supersedes their unplaced core-task status; two-priority ideal admission and
all-five native delivery remain open and must not be inferred from core tests.

## Format separation

[CONTRACT-050](../../02-design/contracts/CONTRACT-050-format-separation.md)
separates the meanings carried by TableSpec's unstructured format text. Source
documentation and examples remain informational. Directional parsing and
rendering recipes remain versioned extension concerns; allowed-value assertions
follow CONTRACT-048 and, for the core 0.8.0 surface, CONTRACT-049
(allowed values must still be authored explicitly, never split from format
text; ideal admission and all-five delivery stay open), and temporal value meaning follows CONTRACT-047. Structural
patterns require a declared language and interpretation status. The overloaded
source field has no direct core-promotion path. This requirement does not place
new concepts into IDEAL-01's ordered delivery or admit a new core version.
