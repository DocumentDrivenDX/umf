---
ddx:
  id: FEAT-025
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

# FEAT-025: Archaeology domain pack

**Feature ID:** FEAT-025. **Status:** Draft. **Priority:** P0 under FR-45; catalog scheduling is proposed. **Owner:** UMF domain/schema maintainers; TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One archaeological reference-pack capability. FR-29/41 constrain consumer reuse; FR-4/8/26/30/39/42 constrain representation and evidence.

## Overview

Provide linked excavation, documentation, media and specialist-analysis schemas grounded in Madaba Plains Project material where available. A consumer can follow a find or sample from excavation context through field documentation and analysis to attributable, revisable interpretation.

## Ideal Future State

A maintainer selects a site/season/square, inspects its contexts, finds and samples, opens associated reports/photos/maps/drawings, and compares pottery, soil and fauna results without losing source terminology, uncertain dating or alternative interpretations.

## Problem Statement

Flattened excavation tables and detached images lose the connection between context, recorded evidence and scholarly interpretation. Public availability of a publication does not prove every asset/table is downloadable or covered by the same reuse terms.

## Requirements

- DOMAIN-01: Cover projects, sites, seasons, excavation areas/fields, squares, contexts/loci, excavation activities, stratigraphic relationship assertions, finds/baskets/lots, objects/fragments, material samples/subsamples, specialist analyses, observations, interpretations, field reports, photos, maps, square/top-plan and section drawings, object drawings, document/media links and provenance.
- DOMAIN-02: Keep excavation observations, stratigraphic relationships, phase/date interpretations and subsequent scholarly revisions distinct. Preserve project-native square/locus numbering and coordinate/date conventions.
- DOMAIN-03: Include a documented positive evidence chain and negative stratigraphic/dating scenario in US-076, with synthetic scenario labels separate from archaeological records.
- DOMAIN-04: Describe scale by sites, seasons, squares, context depth, relationship density, finds per context, analyses per sample and media/document density. TableSpec owns record generation and resource measurement.
- DOMAIN-05: Retain source originals, publisher IDs, citations, reuse terms and transformation lineage. Separate real Madaba Plains records from synthetic supplemental excavations.
- DOMAIN-06: Demonstrate a context-to-evidence consumer question with independently expected results and explicit uncertainty.
- ARCH-01: Represent field reports, photos, maps, square/section drawings and object drawings as identified evidence assets with many-to-many subject associations; retain captions, creator/date, versions, scale/orientation and document-region anchors where supplied.
- ARCH-02: Preserve pottery, soil/sediment and fauna analyses as distinct typed profiles tied to physical sample/find provenance and method. Counts, weights, taxonomic/typological identifications and derived estimates do not become interchangeable quantities.

### Non-Functional Requirements

Apply FEAT-009 PACK-01–PACK-06 and the existing selected concerns. Schema tooling remains browser-compatible under ADR-002. Accepted archives must retain every admitted reference and source qualifier without unexplained loss; every synthetic anomaly is labeled. CSV value fidelity and media-content integrity are separately qualified claims.

## User Stories

- [US-076: Trace an archaeological context through its evidence and analyses](../user-stories/US-076-archaeology-domain-pack.md).

## Edge Cases and Error Handling

An observed stratigraphic cycle is exposed without deleting the source assertions. A phase/date interpretation can conflict with another author's conclusion without replacing it. A missing or external media file retains its citation/location and availability state; it must not be presented as included archive content.

## Success Metrics

A small corpus answers the context-evidence question with correct finds, samples, assets and analysis lineage. Native numbering, unresolved dates and alternative interpretations remain recoverable. Every released asset has attributable source and reuse metadata, with checksums for included bytes.

## Constraints and Assumptions

The first source candidate is Madaba Plains Project–Tall al-ʿUmayri. Its Open Context project metadata declares CC BY 4.0 and references a lithics table; individual records/assets and complete downloadable coverage still need inventory. The requested pottery, soil and fauna profiles are planning scope, not a claim that all have been fetched as structured Madaba Plains datasets.

## Dependencies

FEAT-009; shared CONTRACT-052 baseline; source inventory; archaeology profile Contract; TD-076 and STP-076. [SD-025](../../02-design/solution-designs/SD-025-archaeology-domain-pack.md) proposes the linked model. Source notes: [Madaba Plains/Open Context](../../00-discover/resources/archaeology-mpp-open-context.md), [manual](../../00-discover/resources/archaeology-mpp-manual.md), [publications](../../00-discover/resources/archaeology-mpp-publications.md), [CRMarchaeo](../../00-discover/resources/archaeology-crmarchaeo.md).

## Open Questions

Select the first site/season/record subset, actual downloadable specialist tables, asset-level terms, chronology and spatial profiles, and the initial review question. Pin native records and project-specific terminology before defining mappings. Broader Madaba Plains sites and other excavation methods remain independently selectable profiles.

## Out of Scope

New historical conclusions, automated pottery/species identification, universal stratigraphic inference, unrestricted republication of source media, production excavation management and mandatory ontology adoption.
