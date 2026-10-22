---
ddx:
  id: US-090
  type: user-story
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
---

# US-090: Preserve semantic references alongside exact UUID models

**Feature:** FEAT-005 SEM-01–SEM-06. **PRD:** FR-3, FR-39, FR-41 and the
2026-10-17 owner integration amendment. **Priority:** owner-selected consolidation.

## Story

As a programmatic schema consumer, I want exact external semantic references on
my existing exact-value model, so that metadata can express competing meanings
without losing UUID values, native content or the ability to recover my source.

## Context

The historical semantic profile and current UUID profile both allocated core0.9.
The owner selects a new composed core0.10 profile under CONTRACT-078.

## Walkthrough

1. The consumer validates an existing core0.9 UUID model.
2. An explicit upgrade preserves it, archiving opaque field collisions.
3. The consumer declares references, selects metadata and supplies exact validators.
4. JSON/YAML recovery and verified rollback preserve original and subsequent content.

## Acceptance Criteria

- [ ] **US-090-AC1** — Given current core0.9 UUID/128-bit content, composing core0.10 preserves its value constraints and rejects the same invalid literals.
- [ ] **US-090-AC2** — Given an explicit declaration, copied reads and exact registry checks preserve competing/unknown meaning without automatic lookup.
- [ ] **US-090-AC3** — Given opaque fields or prototype annotations, migration archives collisions and refuses lossy implicit conversion.
- [ ] **US-090-AC4** — Given an edited successor or forged/stale receipt, rollback retains both versions and verification refuses inconsistent claims.
- [ ] **US-090-AC5** — Given versioned models, older schemas remain unchanged and unsupported authoring/receipts refuse explicitly.
- [ ] **US-090-AC6** — Given the public browser bundle, metadata selection and semantic operations agree with Bun without host APIs or network requests.

## Edge Cases

Unknown qualifiers remain incomplete; missing validators never certify validity.
Extension callbacks receive the complete actual source. Prototype-to-core
conversion cannot overwrite an opaque collision.

## Test Scenarios

UUID plus a semantic reference survives both serializations; an invalid UUID
literal still rejects. An old well-shaped semanticTypes value becomes a residual
unless explicit supported prototype conversion is selected. Altered receipts fail.

## Dependencies

CONTRACT-076, CONTRACT-078, SD-005, TD-090 and STP-090.

## Out of Scope

Native semantic equivalence, remote catalogs, automatic inference and expanding
other version-specific authoring APIs beyond their separately declared profiles.
