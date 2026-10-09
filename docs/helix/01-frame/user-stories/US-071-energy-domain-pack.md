---
ddx:
  id: US-071
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-020
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-071: Exercise the energy and utilities domain pack

**Feature:** FEAT-020. **Feature Requirements:** DOMAIN-01–DOMAIN-06; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the energy and utilities pack and inspect a generated dataset against its documented scenarios, **So that** I can verify meter history and outage investigation using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Sites; utility assets; meters; channels; interval readings; tariffs; outages; service relationships. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Pilot Question

Which readings span the meter replacement and outage, and which register resets cannot be treated as consumption?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-071-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-071-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-071-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-071-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-071-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-071-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-071-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-071-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

## Edge Cases

- A cumulative register reset is identified instead of treated as negative consumption.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-071-AC2 | A site changes meters during a 30-day series; a labeled outage produces missing intervals. The independent expected result must be fixed before generator implementation. |
| Semantic counterexample | US-071-AC3 | A cumulative register reset is identified instead of treated as negative consumption. |
| Replay | US-071-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-071-AC5 | Small and demo configurations retain referential integrity while varying sites, meters, interval frequency, history span, outages and asset topology. |
| Archive read-back | US-071-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-020](../features/FEAT-020-energy-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [FIWARE Smart Data Models overview](https://www.fiware.org/data-models/).

## Planning Handoff

1. Resolve: Pinned model commits, meter/readings profile, timezone policy and tariff scope.
2. Author the domain profile contract and TD-071 using the integrated shared pack/source contract; define exact identifiers, types, bindings, migration and explicit unsupported semantics there.
3. Author STP-071, mapping every AC to an exercising test with a canonical `@covers US-071-ACn` citation. Separate UMF Bun/Chromium schema checks from TableSpec generation/archive/engine checks.
4. Execute the small positive/negative corpus first, then demo and large scale; publish versions, actual counts, failures, resource measurements and scoped support evidence.

These are draft plans. TD/STP artifacts and executable evidence are required before describing a pack as implementation-ready or delivered. TableSpec-specific tests and execution work items belong in TableSpec's own governed artifacts.

## Out of Scope

Grid control, billing accuracy guarantees, and load forecasting.
