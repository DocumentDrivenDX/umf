---
ddx:
  id: US-074
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-023
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-074: Exercise the construction domain pack

**Feature:** FEAT-023. **Feature Requirements:** DOMAIN-01–DOMAIN-06; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the construction pack and inspect a generated dataset against its documented scenarios, **So that** I can verify project dependencies and change-impact inspection using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Projects; sites; organizations; work packages; dependencies; requests for information (RFIs); submittals; change orders; inspections; costs; bounded building information modeling (BIM) references. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Pilot Question

Which downstream work packages are associated with the delayed package and change, with dependency cycles exposed?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-074-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-074-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-074-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-074-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-074-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-074-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-074-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-074-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

## Edge Cases

- A dependency cycle is reported rather than silently removed from the schedule graph.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-074-AC2 | Project P1 has a delayed work package, an RFI and an approved change affecting a downstream package. The independent expected result must be fixed before generator implementation. |
| Semantic counterexample | US-074-AC3 | A dependency cycle is reported rather than silently removed from the schedule graph. |
| Replay | US-074-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-074-AC5 | Small and demo configurations retain referential integrity while varying projects, work packages, dependency density, changes, documents and BIM fixture size. |
| Archive read-back | US-074-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-023](../features/FEAT-023-construction-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [buildingSMART Industry Foundation Classes examples](https://technical.buildingsmart.org/standards/ifc/ifc-examples/).

## Planning Handoff

1. Resolve: Pinned IFC subset, project-document vocabulary and sample model redistribution terms.
2. Author the domain profile contract and TD-074 using the integrated shared pack/source contract; define exact identifiers, types, bindings, migration and explicit unsupported semantics there.
3. Author STP-074, mapping every AC to an exercising test with a canonical `@covers US-074-ACn` citation. Separate UMF Bun/Chromium schema checks from TableSpec generation/archive/engine checks.
4. Execute the small positive/negative corpus first, then demo and large scale; publish versions, actual counts, failures, resource measurements and scoped support evidence.

These are draft plans. TD/STP artifacts and executable evidence are required before describing a pack as implementation-ready or delivered. TableSpec-specific tests and execution work items belong in TableSpec's own governed artifacts.

## Out of Scope

Full geometry processing, scheduling optimization, and contractual/legal advice.
