---
ddx:
  id: US-076
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-025
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-076: Trace an archaeological context through its evidence and analyses

**Feature:** FEAT-025. **Feature Requirements:** DOMAIN-01–DOMAIN-06, ARCH-01–ARCH-02; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 constrain consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to inspect an excavation context with its finds, samples, reports, images and specialist analyses, **So that** I can verify a complete evidence chain while retaining uncertain and competing interpretations.

## Context

Madaba Plains Project is the first source candidate. Its local square/locus conventions and documentation practices must remain attributable. UMF supplies schemas and schema tooling; TableSpec owns generated datasets, CSV ZIP export, loading and data tests.

## Pilot Question

For one site, season and square, which contexts yielded pottery, soil and faunal samples, what reports/photos/maps/drawings document them, and what analyses and dating interpretations are supported by each evidence chain?

## Walkthrough

1. The maintainer selects a pinned archaeology pack with an inventoried source subset and reads the source/semantic limitations.
2. UMF generates and validates the selected schema profile while retaining native terminology and unknown content.
3. TableSpec generates a small seeded synthetic excavation linked to separately identified published fixtures.
4. The maintainer reloads its CSV archive, follows one context through finds/samples/analyses and resolves its media/document references.
5. The maintainer compares the resulting evidence graph and interpretation qualifications with an independently specified expected answer.

## Acceptance Criteria

- **US-076-AC1:** Given a pinned archaeology pack, when schemas are inspected, then the DOMAIN-01 inventory is represented in the declared subset.
- **US-076-AC2:** Given the positive fixture below, when the context-evidence question is answered, then the expected finds, samples, analyses and assets are returned through attributable associations.
- **US-076-AC3:** Given conflicting stratigraphic assertions, when inspected, then the contradiction remains visible without deleting or rewriting the retained assertions.
- **US-076-AC4:** Given identical generator version, seed, configuration and snapshots, when TableSpec generates twice, then canonical records agree.
- **US-076-AC5:** Given small and demo configurations, when generated, then configured counts and relationship integrity hold with intentional anomalies distinguished from accidental ones.
- **US-076-AC6:** Given a CSV archive, when reloaded under its admitted profile, then exact values, source identifiers and context relationships agree.
- **US-076-AC7:** Given published fixtures and synthetic supplementation, when inspected, then their sources, reuse terms and transformation/generation origins are distinguishable.
- **US-076-AC8:** Given an unknown meaning required for an operation, when that operation is requested, then it refuses or reports explicitly incomplete support while retaining the source.
- **US-076-AC9:** Given identified media and document evidence, when its subject associations are resolved, then the correct source revision/region is selected with included content checked against its declared checksum.
- **US-076-AC10:** Given two dating interpretations for one context, when inspected, then each retains its dating basis, author, uncertainty and supporting evidence without becoming a fabricated exact timestamp.
- **US-076-AC11:** Given pottery, soil and faunal analyses of related finds/samples, when inspected, then their methods, units, sample lineage and identification/estimate meanings remain distinct.

## Edge Cases

A reused square label at another site remains a different square. A pottery lot may contain many fragments without implying one vessel. A mixed context does not acquire a single certain period merely because one diagnostic fragment was identified. An unavailable image remains a cited unavailable asset, not an empty substitute described as original content.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Complete evidence chain | US-076-AC2 | Synthetic site SYN-A, square Q1, context C1, pottery lot P1, soil sample S1 and fauna lot F1 link to report R1, photo A1, square drawing D1 and object drawing D2; expected associations are fixed independently. |
| Contradictory sequence | US-076-AC3 | Assertions that C1 is earlier than C2 and C2 earlier than C1 remain recorded with a contradiction diagnostic. |
| Deterministic replay | US-076-AC4 | Seed 42 and identical snapshots/configuration reproduce the canonical small corpus. |
| Multi-subject drawing | US-076-AC9 | D1 depicts C1 and C2; its subject links and scale are retained; missing binary content is reported as unavailable. |
| Competing dating | US-076-AC10 | Two authors assign overlapping uncertain ancient date ranges based on different evidence; both survive without conversion to one modern SQL timestamp. |
| Analysis distinctions | US-076-AC11 | A sherd count, soil mass fraction and faunal identified-specimen count retain their separate methods, units and source specimens. |

## Dependencies

[FEAT-025](../features/FEAT-025-archaeology-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); [SD-025](../../02-design/solution-designs/SD-025-archaeology-domain-pack.md); ADR-002; CONTRACT-052 shared baseline. Exact profile/API/archive fields belong in contracts, not this story.

## Planning Handoff

Inventory a bounded Madaba Plains source subset and asset-level terms. Author the archaeology Contract, TD-076 and STP-076, mapping every AC to an exercising test with its canonical `@covers US-076-ACn` citation. UMF tests schema generation, native/unknown preservation and actual-browser behavior. TableSpec tests seeded generation, typed archive read-back, context integrity, asset-manifest checks and actual engine ingestion. Published source fixtures and synthetic cases retain separate expected evidence.

## Out of Scope

Historical inference accuracy, real excavation operations, automatic artifact recognition and copying unverified source-media collections.
