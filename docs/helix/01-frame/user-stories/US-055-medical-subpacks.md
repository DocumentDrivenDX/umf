---
ddx:
  id: US-055
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# US-055: Compose medical carrier, epidemiology, imaging and terminology samples

**PRD Requirements:** FR-45. **Priority:** P0. Architecture is the direct design
parent; this slice expands the existing portable-pack contract.

## Story

As a metadata consumer, I want independently versioned medical subpacks with
source-qualified rows and retained originals, so that I can exercise clinical,
carrier, population and imaging models without conflating their meaning.

## Context

Medical 1.0.0 has only clinical examples. Public sources have differing rights,
units of analysis and terminology releases. Public carrier examples are not a
coherent patient history; missing scenarios need separately authored provenance.

## Walkthrough

1. Select a medical-family pack and inspect its versions, sources and qualification.
2. Export pinned local schemas/sources through the existing exporter.
3. Ingest tabular rows through TableSpec, retaining original resources and binaries.
4. Bind a licensed terminology source explicitly when available; preserve unknowns.

## Acceptance Criteria

- **US-055-AC1:** Given carrier examples and fabricated supplements, projection
  preserves coverage, eligibility, claims/lines, adjudication, payments, plan,
  enrollment, authorization, coordination and appeal records with distinct sources.
- **US-055-AC2:** Given exact numeric/time tokens, nested codings, unknown content
  and unresolved references, projections retain their meanings and original bytes.
- **US-055-AC3:** Given CDC aggregate mortality data, projections retain measure,
  population/time/geography, adjusted-rate metadata and unavailable denominators;
  supplemental suppression and zero cases remain distinguishable.
- **US-055-AC4:** Given DICOM JSON and retained synthetic native objects, projection
  preserves study/series/instance identity, value representations, ordered sequences,
  private tags and explicit binary references without claiming pixel interpretation.
- **US-055-AC5:** Given terminology references and locally supplied releases,
  exact systems/releases/codes stay distinct; missing licensed sources do not become
  invalid codes, and source export refuses uncleared rights or changed bytes.
- **US-055-AC6:** Given each pack, browser metadata/recovery and TableSpec
  ingestion/archive readback work within the declared subset without implicit fetch.

## Edge Cases

FHIR references may resolve only within one source namespace. Published sample
amounts need not reconcile; preserve rather than repair them. Population rates
cannot reconstruct absent denominators. Synthetic DICOM objects prove metadata
preservation, not deidentification of real images or PACS interoperability.

## Test Scenarios

| Scenario | Criteria | Outcome |
| --- | --- | --- |
| ClaimResponse amount `10.00` | AC1/2 | Exact text and original bytes retained. |
| Mortality denominator absent | AC3 | Unknown, never derived from an adjusted rate. |
| Private DICOM sequence | AC4 | Ordered nested values retained. |
| Missing CPT dictionary | AC5 | Code remains unresolved, not invalid. |
| Pack export and ingest | AC6 | Hashes, rows, schemas and original attachments recover. |

## Dependencies

CONTRACT-001, CONTRACT-052, ADR-002, architecture, TD-055 and STP-055.

## Out of Scope

Production carrier processing, clinical validation, patient identity matching,
terminology equivalence, pixel codecs, live PACS and native graph-engine adoption.
These retain separate FR-45 requirements and qualification gates.

## Integrated family delivery

Owner direction extends AC1/AC4/AC6 to qualified public samples and complete
family discovery/export. Medical's clinical overview links each independently
versioned subpack; each subpack links back. Exact public CMS CSV excerpts remain
historical synthetic claims, distinct from the FHIR examples. A selected TCIA
DICOM object keeps collection citation, rights and unchanged bytes. The explorer
offers local source and CSV downloads and all four subpack ontology views.
One explicit family export preserves separate pack directories and inventories;
composition never invents patient linkage or combines populations.
