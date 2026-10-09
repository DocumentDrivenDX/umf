---
ddx:
  id: US-075
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-024
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-075: Exercise the ecology and water management domain pack

**Feature:** FEAT-024. **Feature Requirements:** DOMAIN-01–DOMAIN-06; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the ecology and water management pack and inspect a generated dataset against its documented scenarios, **So that** I can verify watershed, river-quality and aquatic-biodiversity investigation using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Watersheds; catchments; reaches; network links; monitoring sites; projects; sampling events; samples; methods; observed properties; observations; taxa; identifications; occurrences; effort; habitat metrics; management interventions; fishing-event profile. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Pilot Question

For one watershed and period, which qualified sites have water observations and aquatic-insect samples, and what methods, effort, qualifiers and match limitations accompany each comparison?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-075-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-075-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-075-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-075-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-075-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-075-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-075-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-075-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

## Edge Cases

- A below-detection nitrate result remains censored; a nearby unverified site match remains unresolved.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-075-AC2 | Two connected reaches have temperature and dissolved-oxygen observations plus one benthic-insect sampling event with counts and effort. The independent expected result must be fixed before generator implementation. |
| Semantic counterexample | US-075-AC3 | A below-detection nitrate result remains censored; a nearby unverified site match remains unresolved. |
| Replay | US-075-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-075-AC5 | Small and demo configurations retain referential integrity while varying watersheds, reaches, site density, history span, sensor frequency, survey effort and taxon richness. |
| Archive read-back | US-075-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-024](../features/FEAT-024-ecology-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [USGS Water Data APIs](https://api.waterdata.usgs.gov/); [Water Quality Portal](https://www.waterqualitydata.us/); [TDWG Darwin Core](https://dwc.tdwg.org/terms/); [EPA StreamCat](https://www.epa.gov/national-aquatic-resource-surveys/streamcat-dataset).

## Planning Handoff

1. Resolve: First watershed/region, versioned hydrography product, source snapshots, taxonomic authority, biological method and fishing-data source.
2. Author the domain profile contract and TD-075 using the integrated shared pack/source contract; define exact identifiers, types, bindings, migration and explicit unsupported semantics there.
3. Author STP-075, mapping every AC to an exercising test with a canonical `@covers US-075-ACn` citation. Separate UMF Bun/Chromium schema checks from TableSpec generation/archive/engine checks.
4. Execute the small positive/negative corpus first, then demo and large scale; publish versions, actual counts, failures, resource measurements and scoped support evidence.

These are draft plans. TD/STP artifacts and executable evidence are required before describing a pack as implementation-ready or delivered. TableSpec-specific tests and execution work items belong in TableSpec's own governed artifacts.

## Out of Scope

Hydrologic simulation, ecological prediction, causal impact claims, fishing recommendations and management-system execution.
