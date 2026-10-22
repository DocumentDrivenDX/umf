---
ddx:
  id: US-078
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-027
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-078: Trace a public-company deal signal to retained evidence

**Feature:** FEAT-027 PCI-01–PCI-06. **PRD:** FR-45; FR-29/41 constrain consumers.

## Story

**As a** Schema Integration Maintainer, **I want** to load and inspect a pinned company-research corpus, **So that** I can reproduce a deal-signal screen and audit each result against its original evidence.

## Context

The first corpus uses 25 explicitly selected SEC issuers and a twelve-month filing-date window. Inclusion is a research selection, not licensed index membership. SEC is the U.S. Securities and Exchange Commission; EDGAR is its public filing system. The scenario uses filing item metadata; it does not infer deal terms from unseen text.

## Walkthrough

1. Select the versioned pack and inspect its source, universe and coverage qualifications.
2. Inspect tabular schemas and the linked ontology in the explorer.
3. Explicitly export and locally ingest pinned CSV projections through TableSpec.
4. Screen acquisition/disposition and restructuring item metadata; follow an accession back to its snapshot and selected original document.
5. Compare the result with the reviewed expected accession list and inspect the separate opportunity hypothesis.

## Acceptance Criteria

- **US-078-AC1:** Given the pack, when inspected, then the PCI-01 inventory and closed ontology validate with exact native schema recovery.
- **US-078-AC2:** Given the fixed corpus, when the deal-signal question is evaluated, then reviewed acquisition/disposition and restructuring accessions are returned and earnings-only controls are excluded.
- **US-078-AC3:** Given unusual or duplicated financial observations, when projected, then exact values, context, amendments and unknown source content survive without deduplication.
- **US-078-AC4:** Given identical pinned inputs/configuration, when rebuilt offline, then canonical artifacts are byte-identical.
- **US-078-AC5:** Given the exported corpus, when TableSpec ingests and an independent local engine reads it, then exact values, row counts and foreign-key closure agree.
- **US-078-AC6:** Given corrupt or uncleared sources, when included export is requested, then the operation refuses; source declarations remain inspectable.
- **US-078-AC7:** Given a generated screen result, when inspected, then evidence, rule/version/run, selected-universe status and hypothesis status remain distinct and attributable.
- **US-078-AC8:** Given the built explorer, when opened in Chromium, then pack/table/ontology navigation and downloadable source-preserving metadata work.

## Edge Cases

Malformed submission parallel arrays refuse. Missing/null financial values remain missing/null; zero is a real value. Changing a selected source requires a deliberate new corpus revision. Older submission shards remain references; the recent-array window is not exhaustive filing coverage.

## Test Scenarios

| Case | Criterion | Expected |
| --- | --- | --- |
| Item 2.01 versus 2.02 | AC2 | Acquisition/disposition result includes the first, excludes earnings-only filing |
| Unsafe numeric token | AC3 | 9007199254740993.0100 remains exact text |
| Duplicate accession fact | AC3 | Separate source ordinals remain separate observations |
| Stale SHA-256 | AC6 | Included export refuses |

## Dependencies

FEAT-027; FEAT-009; CONTRACT-052/053/057. TableSpec performs ingestion and local-engine testing.

## Out of Scope

Exhaustive filing retrieval, narrative deal-term extraction, calibrated lead ranking, model evaluation, production Databricks/email and Truss/Ashlar intake.
