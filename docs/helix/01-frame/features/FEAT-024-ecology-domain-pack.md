---
ddx:
  id: FEAT-024
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

# FEAT-024: Ecology and water management domain pack

**Feature ID:** FEAT-024. **Status:** Draft. **Priority:** P0 under FR-45; roadmap order is proposed. **Owner:** UMF schema maintainers; TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One domain-pack capability under FR-45. FR-29/41 consumer reuse and FR-4/8/26/30/39/42 representation/fidelity constrain the workflow without adding separate product capabilities.

## Overview

Provide a versioned ecology and water management reference pack for watershed, river-quality and aquatic-biodiversity investigation. Users select its declared scope and reuse the same UMF schema meaning for TableSpec datasets and later graph consumers.

## Ideal Future State

A maintainer can inspect the domain schemas, identify their source and support limits, generate a chosen dataset through TableSpec, and use the published scenarios to judge whether ingestion and queries preserve meaning.

## Problem Statement

Independent examples can disagree about domain identities, constraints and native vocabulary. A large generated dataset alone cannot establish whether those meanings survive loading or whether its distribution resembles a real population.

## Requirements

- DOMAIN-01: Cover the initial conceptual inventory: Watersheds; catchments; reaches; network links; monitoring sites; projects; sampling events; samples; methods; observed properties; observations; taxa; identifications; occurrences; effort; habitat metrics; management interventions; fishing-event profile.
- DOMAIN-02: Preserve the domain distinctions below in authored meaning and expose unsupported consumer behavior.
- DOMAIN-03: Include the positive and negative scenario in US-075, with attributable ground truth separated from ordinary data.
- DOMAIN-04: Describe scale dimensions for watersheds, reaches, site density, history span, sensor frequency, survey effort and taxon richness; TableSpec implements dataset generation and measures resource usage.
- DOMAIN-05: Ground native fixtures in identified source releases with reuse terms and preserved originals; generated supplemental content has a distinct origin.
- DOMAIN-06: Demonstrate watershed, river-quality and aquatic-biodiversity investigation through a documented consumer question and independently computed expected outcome for a small corpus.

### Domain distinctions

- Catchment, upstream watershed and monitoring-site geometry are separate meanings.
- Observations retain units, matrix, method, detection/censoring, quality, event time and source lineage.
- Biological detections retain taxonomy concept, life stage, identification and effort; no record is not absence.
- Fishing catches remain separate from scientific abundance surveys; derived indexes retain algorithm and input provenance.

### Non-Functional Requirements

Apply FEAT-009 PACK-01–PACK-06 and the selected fidelity, identity, reproducibility, bounded-processing, conformance, review and runtime-boundary concerns. Published evidence must identify schema/generator versions, subset, scale and actual engine. Zero unexplained source-content loss and zero unlabeled injected anomalies are required on the accepted corpus. Schema tooling remains browser-compatible under ADR-002.

## User Stories

- [US-075: Exercise the ecology and water management pack](../user-stories/US-075-ecology-domain-pack.md).

## Edge Cases and Error Handling

Unknown source terms remain retained and marked uninterpreted. Missing references, unsupported required meanings and unresolved identity matches block dependent operations or yield explicitly incomplete reports. A below-detection nitrate result remains censored; a nearby unverified site match remains unresolved.

## Success Metrics

The small accepted corpus answers the documented domain question with the expected identities, multiplicities and exact values. All declared domain distinctions have positive and counterexample evidence; all published fixtures have source and reuse records.

## Constraints and Assumptions

Comparable place/time does not establish comparable sampling methods, causal effects or population abundance. The first release is a bounded reference pack, with scientific/business realism qualified independently from structural correctness.

## Dependencies

[FEAT-009](FEAT-009-domain-pack-catalog.md) owns shared catalog behavior. CONTRACT-052 supplies the shared draft manifest/schema-tooling surface; the integrated `umf.domain-pack` and `umf.dataset-source` 1.0.0 interfaces are reused; domain-specific extensions require separate design before build. Core/native schemas and independent bindings remain separately versioned. Source candidates: [USGS Water Data APIs](https://api.waterdata.usgs.gov/); [Water Quality Portal](https://www.waterqualitydata.us/); [TDWG Darwin Core](https://dwc.tdwg.org/terms/); [EPA StreamCat](https://www.epa.gov/national-aquatic-resource-surveys/streamcat-dataset).

## Open Questions

First watershed/region, versioned hydrography product, source snapshots, taxonomic authority, biological method and fishing-data source. Source candidates require release/snapshot pinning and reuse review before inclusion; website availability alone is not a redistribution grant.

## Out of Scope

Hydrologic simulation, ecological prediction, causal impact claims, fishing recommendations and management-system execution.
