---
ddx:
  id: FEAT-001
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-001: Extension participation

**Priority:** P0.
**Covered PRD Subsystem(s)**: Extensions and Partial Participation
**Covered PRD Requirements**: FR-2, FR-4, FR-5, FR-15, FR-20, FR-21, FR-22, FR-23, FR-27, FR-31, FR-34, FR-40, FR-41
**Cross-Subsystem Rationale**: This feature owns extension participation and generic kind discovery; adapter fidelity and consuming applications retain their own boundaries. Its first story addresses only the envelope.

## Overview

Allow consumers to register versioned semantics, use what they understand and
retain everything else. Extensions must describe their rules and evidence without
turning arbitrary metadata into executable instructions.

## Ideal Future State

Independent domain and native vocabularies coexist; each consumer can explain
which content it validates, preserves, edits, imports and exports.

## Problem Statement

A fixed shared model cannot capture all native meanings. Treating unknown fields
as disposable, or treating structural validation as semantic understanding,
would prevent reliable native round trips and future independent consumers.

## Requirements

- EXT-01: Discover exact versions, structural rules, semantic rules, scopes,
  declared directions and evidence through extension packages (CONTRACT-001).
- EXT-02: Preserve uninterpreted fields and distinguish interpretation limits.
- EXT-03: Validate installed vocabularies and reject unsafe edits atomically.
- EXT-04: Add third-party and DDD vocabularies without redefining unrelated ones.
  DDD depth and native adapter stories follow the initial foundation.
- EXT-05: An extension may declare its own object kinds. Generic tools discover
  their exact extension/version identity, applicable scopes and descriptions,
  and validate occurrences through the installed extension without a built-in
  list of ecosystem kinds. Classification does not confer core Field/Record
  semantics or native compatibility.
- EXT-06: Reuse core Records and Fields where their meanings fit an extension's
  data shapes. Preserve extension-specific calculations, interactions and native
  refinements; do not infer complete schemas from partial observations.

Non-functional constraints: no silent losses in the declared fixture corpus;
no artifact-directed code execution or implicit network retrieval; bounded inputs
with explicit incomplete/error outcomes. Exact bounds live in CONTRACT-001.

## User Stories

[US-001](../user-stories/US-001-preserve-versioned-documents.md) implements the
initial envelope. Later native/DDD participation stories remain to derive.

[US-904](../user-stories/US-904-extension-defined-kinds.md) covers generic
discovery and validation of extension-defined kinds. Its exact interface is
[CONTRACT-907](../../02-design/contracts/CONTRACT-907-extension-defined-kinds.md).

## Edge Cases and Error Handling

Unknown version/field: preserve and report incomplete interpretation. Conflicting
registration: reject without replacement. Invalid input or unsafe edits: reject
without modifying the original. Future native numeric domains require explicit encoding.

## Success Metrics

100% of supported retention cases survive; 100% of deliberate corruption cases
are detected. No synthetic vocabulary is advertised as native-system support.

## Constraints and Assumptions

The core remains small and versioned; meaning is not inferred from names. The
unknown dependency edit policy is deliberately conservative pending specific rules.

## Dependencies

PRD and NFR-1/2/3/12/14/23/24/25/40. Exact initial surfaces: CONTRACT-001.

## Out of Scope

US-001 does not complete this feature's native adapters, DDD vocabulary, or
operation-specific partial-understanding edits. Those remain implementation work.

## Review Checklist

- [x] Initial story, preservation boundaries and measurable gates identified.
- [ ] Derive remaining extension/DDD stories and execute their native evidence.
