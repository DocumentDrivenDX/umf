---
ddx:
  id: US-064
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-013
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-064: Exercise the supply chain and logistics domain pack

**Feature:** FEAT-013. **Feature Requirements:** DOMAIN-01–DOMAIN-06; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the supply chain and logistics pack and inspect a generated dataset against its documented scenarios, **So that** I can verify lot traceability and recall impact using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Organizations; facilities; products; lots; serialized items; containers; shipments; traceability events; sensor readings. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Pilot Question

Which shipments and containers descend from lot L1, including the temperature-excursion container?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-064-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-064-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-064-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-064-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-064-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-064-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-064-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-064-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

## Edge Cases

- A replayed source event does not create an unexplained duplicate movement.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-064-AC2 | Lot L1 is split between two shipments; one container has a labeled temperature excursion. The independent expected result must be fixed before generator implementation. |
| Semantic counterexample | US-064-AC3 | A replayed source event does not create an unexplained duplicate movement. |
| Replay | US-064-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-064-AC5 | Small and demo configurations retain referential integrity while varying facilities, lots, containment depth, movements per item, event span and sensor frequency. |
| Archive read-back | US-064-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-013](../features/FEAT-013-supply-chain-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [GS1 Electronic Product Code Information Services 2.0](https://www.gs1.org/standards/epcis).

## Planning Handoff

1. Resolve: First EPCIS event subset, identifier policy and transformation/conservation semantics.
2. Author the domain profile contract and TD-064 using the integrated shared pack/source contract; define exact identifiers, types, bindings, migration and explicit unsupported semantics there.
3. Author STP-064, mapping every AC to an exercising test with a canonical `@covers US-064-ACn` citation. Separate UMF Bun/Chromium schema checks from TableSpec generation/archive/engine checks.
4. Execute the small positive/negative corpus first, then demo and large scale; publish versions, actual counts, failures, resource measurements and scoped support evidence.

These are draft plans. TD/STP artifacts and executable evidence are required before describing a pack as implementation-ready or delivered. TableSpec-specific tests and execution work items belong in TableSpec's own governed artifacts.

## Out of Scope

Production inventory control, logistics optimization, and universal GS1 conformance.
