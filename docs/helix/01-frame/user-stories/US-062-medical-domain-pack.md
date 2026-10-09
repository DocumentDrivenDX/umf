---
ddx:
  id: US-062
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-011
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-062: Exercise the medical domain pack

**Feature:** FEAT-011. **Feature Requirements:** DOMAIN-01–DOMAIN-06; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the medical pack and inspect a generated dataset against its documented scenarios, **So that** I can verify longitudinal care and claims inspection using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Patients; organizations; practitioners; encounters; conditions; observations; medication orders; allergies; procedures; clinical notes; optional coverage and claims. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Delivered Subset

The completed medical pack is an official fixed example corpus, not a longitudinal generator: 17 HL7 R4 resources, eight projections, exact originals/literals and explicit source provenance. [Evidence](../../04-build/evidence/medical-domain-pack.md) records typed ZIP and local Sail/Spark checks. Medication is a resource, not an inferred order/administration. Conditions, allergies, procedures, notes and claims remain desired expansions. CMS records are reference-only until selected bytes and reuse terms are established. AC4/AC5 apply to future generated supplementation; they must not force cloning published clinical records or be marked passed by fixed corpus ingestion.

## Pilot Question

Which clinical records belong to a patient encounter, and which medication/allergy meanings remain distinct?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-062-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-062-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-062-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-062-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-062-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-062-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-062-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-062-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

## Edge Cases

- A contradictory official claim is retained and identified rather than rewritten into a fabricated clinical history.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-062-AC2 | Patient P1 has an outpatient encounter, a measured vital sign, an unknown allergy status and a medication order. The independent expected result must be fixed before generator implementation. |
| Semantic counterexample | US-062-AC3 | A contradictory official claim is retained and identified rather than rewritten into a fabricated clinical history. |
| Replay | US-062-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-062-AC5 | Small and demo configurations retain referential integrity while varying patients, history duration, encounters per patient, observation density and claims volume. |
| Archive read-back | US-062-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-011](../features/FEAT-011-medical-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [HL7 FHIR R4 4.0.1](https://hl7.org/fhir/R4/downloads.html); [CMS synthetic claims](https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files).

## Planning Handoff

1. Resolve: First clinical profile, terminology distribution terms and source separation; FHIR R4 is a candidate fixture release, not a full-support claim.
2. Author the domain profile contract and TD-062 using the integrated shared pack/source contract; define exact identifiers, types, bindings, migration and explicit unsupported semantics there.
3. Author STP-062, mapping every AC to an exercising test with a canonical `@covers US-062-ACn` citation. Separate UMF Bun/Chromium schema checks from TableSpec generation/archive/engine checks.
4. Execute the small positive/negative corpus first, then demo and large scale; publish versions, actual counts, failures, resource measurements and scoped support evidence.

These are draft plans. TD/STP artifacts and executable evidence are required before describing a pack as implementation-ready or delivered. TableSpec-specific tests and execution work items belong in TableSpec's own governed artifacts.

## Out of Scope

Clinical decision support, medical advice, and population-valid simulation.
