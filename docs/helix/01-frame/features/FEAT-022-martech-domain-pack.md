---
ddx:
  id: FEAT-022
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

# FEAT-022: MarTech domain pack

**Feature ID:** FEAT-022. **Status:** Draft. **Priority:** P0 under FR-45; roadmap order is proposed. **Owner:** UMF schema maintainers; TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One domain-pack capability under FR-45. FR-29/41 consumer reuse and FR-4/8/26/30/39/42 representation/fidelity constrain the workflow without adding separate product capabilities.

## Overview

Provide a versioned martech reference pack for customer journeys and campaign attribution inspection. Users select its declared scope and reuse the same UMF schema meaning for TableSpec datasets and later graph consumers.

## Ideal Future State

A maintainer can inspect the domain schemas, identify their source and support limits, generate a chosen dataset through TableSpec, and use the published scenarios to judge whether ingestion and queries preserve meaning.

## Problem Statement

Independent examples can disagree about domain identities, constraints and native vocabulary. A large generated dataset alone cannot establish whether those meanings survive loading or whether its distribution resembles a real population.

## Requirements

- DOMAIN-01: Cover the initial conceptual inventory: Profiles; source identities; campaigns; channels; touchpoints; sessions; conversions; consent history; optional ad auctions.
- DOMAIN-02: Preserve the domain distinctions below in authored meaning and expose unsupported consumer behavior.
- DOMAIN-03: Include the positive and negative scenario in US-073, with attributable ground truth separated from ordinary data.
- DOMAIN-04: Describe scale dimensions for profiles, campaigns, touches per profile, conversion density, event span and traffic skew; TableSpec implements dataset generation and measures resource usage.
- DOMAIN-05: Ground native fixtures in identified source releases with reuse terms and preserved originals; generated supplemental content has a distinct origin.
- DOMAIN-06: Demonstrate customer journeys and campaign attribution inspection through a documented consumer question and independently computed expected outcome for a small corpus.

### Domain distinctions

- Source identities and proposed profile merges retain evidence and uncertainty.
- Touchpoints and attributed conversions are separate; attribution names its rule.
- Consent has effective time, purpose and source; an absent consent record is not consent.

### Non-Functional Requirements

Apply FEAT-009 PACK-01–PACK-06 and the selected fidelity, identity, reproducibility, bounded-processing, conformance, review and runtime-boundary concerns. Published evidence must identify schema/generator versions, subset, scale and actual engine. Zero unexplained source-content loss and zero unlabeled injected anomalies are required on the accepted corpus. Schema tooling remains browser-compatible under ADR-002.

## User Stories

- [US-073: Exercise the martech pack](../user-stories/US-073-martech-domain-pack.md).

## Edge Cases and Error Handling

Unknown source terms remain retained and marked uninterpreted. Missing references, unsupported required meanings and unresolved identity matches block dependent operations or yield explicitly incomplete reports. A conversion outside the selected attribution window remains unattributed.

## Success Metrics

The small accepted corpus answers the documented domain question with the expected identities, multiplicities and exact values. All declared domain distinctions have positive and counterexample evidence; all published fixtures have source and reuse records.

## Constraints and Assumptions

Customer behavior is illustrative; programmatic auction semantics form a later profile. The first release is a bounded reference pack, with scientific/business realism qualified independently from structural correctness.

## Dependencies

[FEAT-009](FEAT-009-domain-pack-catalog.md) owns shared catalog behavior. CONTRACT-052 supplies the shared draft manifest/schema-tooling surface; the integrated `umf.domain-pack` and `umf.dataset-source` 1.0.0 interfaces are reused; domain-specific extensions require separate design before build. Core/native schemas and independent bindings remain separately versioned. Source candidates: [Adobe Experience Data Model](https://github.com/adobe/xdm); [IAB Tech Lab OpenRTB](https://iabtechlab.com/standards/openrtb/).

## Open Questions

Pinned XDM profile, identity-matching policy, attribution scenario and consent vocabulary. Source candidates require release/snapshot pinning and reuse review before inclusion; website availability alone is not a redistribution grant.

## Out of Scope

Ad delivery, legal consent compliance, and calibrated marketing effectiveness.
