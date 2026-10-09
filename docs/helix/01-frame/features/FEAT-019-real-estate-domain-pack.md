---
ddx:
  id: FEAT-019
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: FEAT-009
      kind: informed_by
---

# FEAT-019: Real estate and property operations domain pack

**Feature ID:** FEAT-019. **Status:** Draft. **Priority:** P0 under FR-45; roadmap order is proposed. **Owner:** UMF schema maintainers; TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One domain-pack capability under FR-45. FR-29/41 consumer reuse and FR-4/8/26/30/39/42 representation/fidelity constrain the workflow without adding separate product capabilities.

## Overview

Provide a versioned real estate and property operations reference pack for listing history and property lifecycle inspection. Users select its declared scope and reuse the same UMF schema meaning for TableSpec datasets and later graph consumers.

## Ideal Future State

A maintainer can inspect the domain schemas, identify their source and support limits, generate a chosen dataset through TableSpec, and use the published scenarios to judge whether ingestion and queries preserve meaning.

## Problem Statement

Independent examples can disagree about domain identities, constraints and native vocabulary. A large generated dataset alone cannot establish whether those meanings survive loading or whether its distribution resembles a real population.

## Requirements

- DOMAIN-01: Cover the initial conceptual inventory: Properties; listings; members/agents; offices; media; optional leases; maintenance requests.
- DOMAIN-02: Preserve the domain distinctions below in authored meaning and expose unsupported consumer behavior.
- DOMAIN-03: Include the positive and negative scenario in US-070, with attributable ground truth separated from ordinary data.
- DOMAIN-04: Describe scale dimensions for properties, listings per property, history span, media density and maintenance activity; TableSpec implements dataset generation and measures resource usage.
- DOMAIN-05: Ground native fixtures in identified source releases with reuse terms and preserved originals; generated supplemental content has a distinct origin.
- DOMAIN-06: Demonstrate listing history and property lifecycle inspection through a documented consumer question and independently computed expected outcome for a small corpus.

### Domain distinctions

- Property identity is separate from listing identity and listing history.
- Listing states and prices retain effective periods.
- Leasing and property operations are explicit supplemental profiles.

### Non-Functional Requirements

Apply FEAT-009 PACK-01–PACK-06 and the selected fidelity, identity, reproducibility, bounded-processing, conformance, review and runtime-boundary concerns. Published evidence must identify schema/generator versions, subset, scale and actual engine. Zero unexplained source-content loss and zero unlabeled injected anomalies are required on the accepted corpus. Schema tooling remains browser-compatible under ADR-002.

## User Stories

- [US-070: Exercise the real estate and property operations pack](../user-stories/US-070-real-estate-domain-pack.md).

## Edge Cases and Error Handling

Unknown source terms remain retained and marked uninterpreted. Missing references, unsupported required meanings and unresolved identity matches block dependent operations or yield explicitly incomplete reports. A withdrawn listing does not become a sold property without a sourced transition.

## Success Metrics

The small accepted corpus answers the documented domain question with the expected identities, multiplicities and exact values. All declared domain distinctions have positive and counterexample evidence; all published fixtures have source and reuse records.

## Constraints and Assumptions

Public schema availability does not make actual listing records freely redistributable. The first release is a bounded reference pack, with scientific/business realism qualified independently from structural correctness.

## Dependencies

[FEAT-009](FEAT-009-domain-pack-catalog.md) owns shared catalog behavior. CONTRACT-052 supplies the shared draft manifest/schema-tooling surface; the integrated `umf.domain-pack` and `umf.dataset-source` 1.0.0 interfaces are reused; domain-specific extensions require separate design before build. Core/native schemas and independent bindings remain separately versioned. Source candidates: [Real Estate Standards Organization Data Dictionary](https://www.reso.org/data-dictionary/).

## Open Questions

Pinned RESO release, published fixture rights and supplemental leasing scope. Source candidates require release/snapshot pinning and reuse review before inclusion; website availability alone is not a redistribution grant.

## Out of Scope

Valuation accuracy, brokerage execution, and production lease administration.
