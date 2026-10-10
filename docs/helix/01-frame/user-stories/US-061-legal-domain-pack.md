---
ddx:
  id: US-061
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-010
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-061: Exercise the legal domain pack

**Feature:** FEAT-010. **Feature Requirements:** DOMAIN-01–DOMAIN-07; FEAT-009 PACK-01–PACK-06.
**PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to select the legal pack and inspect a generated dataset against its documented scenarios, **So that** I can verify fee review, matter access, and document issue detection using reproducible, attributable schema meaning.

## Context

The pack's conceptual scope is Clients; matters; timekeepers; matter teams; ethical walls; time entries; invoices; documents. The journey joins UMF schema authoring to TableSpec-owned data generation and testing; the latter is a consumer acceptance dependency and does not move execution into UMF.

## Pilot Question

Which time entries belong to eligible matter-team members, and which fabricated documents contain labeled issues?

## Walkthrough

1. The maintainer selects a pinned pack revision and inspects its schemas, source inventory and support limitations.
2. UMF validates the pack/schema inputs and generates the selected schema artifacts without running artifact-supplied data generators.
3. TableSpec resolves a trusted generator implementation and generates a small seeded dataset with domain scenario labels.
4. The maintainer exports and reloads the CSV ZIP through a declared local engine and checks the pack question against independently expected results.
5. The maintainer selects larger scale dimensions and inspects count, integrity and resource reports separately from realism claims.

## Acceptance Criteria

- **US-061-AC1:** Given a pinned pack, when its schemas are generated and inspected, then the DOMAIN-01 inventory is represented within the declared subset.
- **US-061-AC2:** Given the positive scenario below, when the dataset is queried in the declared consumer, then its domain outcome agrees with the independently expected result.
- **US-061-AC3:** Given the negative scenario below, when checked, then the semantic discrepancy is visible without silently repairing the retained source.
- **US-061-AC4:** Given identical generator version, seed, configuration and source snapshots, when TableSpec generates twice, then the canonical records agree.
- **US-061-AC5:** Given two declared scale configurations, when generated, then observed counts and relationship integrity match the configuration, with intentional violations distinguished from accidental ones.
- **US-061-AC6:** Given the generated CSV archive, when exported and reloaded, then typed values and relationship identities agree under its declared encoding and target profile.
- **US-061-AC7:** Given native fixtures and synthetic records, when their origins are inspected, then the two can be distinguished with source, release and transformation lineage.
- **US-061-AC8:** Given a required unknown or unsupported meaning, when a dependent consumer operation is requested, then the operation refuses or reports explicitly incomplete support while retaining the source.

- **US-061-AC9:** Given the appellate subpack, when inspected, then full original PDFs, comparison identities, court levels, page evidence and source rights are available separately from provisional interpretation.
- **US-061-AC10:** Given fixed temporal replay fixtures, when consumed, then independently expected duplicate, amendment, vacatur, retry and per-recipient delivery outcomes can be checked without sending email.
- **US-061-AC11:** Given expected collection windows, when attempts are inspected, then successful-empty windows and unresolved collection, retrieval, extraction and screening failures remain distinguishable.
- **US-061-AC12:** Given counsel evidence or missing information, when inspected, then represented-party scope, source/as-of provenance and unattempted or fabricated enrichment remain explicit.

## Edge Cases

- An entry by the excluded timekeeper is detected; the clean entry remains valid.
- A native fixture with rights or attribution unresolved remains excluded from a redistributable release.
- A source field with no known shared interpretation is retained; a successful join alone does not establish semantic equivalence.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Positive domain fixture | US-061-AC2 | Matter M1 has an eligible associate, an excluded timekeeper, and a fabricated NDA with a labeled missing-law issue. Reuse the implemented labeled NDA/team fixtures and fix the independent expected query result before adding scenario qualification. |
| Semantic counterexample | US-061-AC3 | An entry by the excluded timekeeper is detected; the clean entry remains valid. |
| Replay | US-061-AC4 | Seed 42 and one pinned configuration yield identical canonical records on repeated generation. |
| Scale change | US-061-AC5 | Small and demo configurations retain referential integrity while varying clients, matters, workload skew, billing periods, time entries and document density. |
| Archive read-back | US-061-AC6 | Exact decimal text, Unicode, explicit null and empty text retain their distinctions where admitted by the domain profile. |

## Dependencies

[FEAT-010](../features/FEAT-010-legal-domain-pack.md); [US-060](US-060-domain-pack-catalog.md); FR-45; FR-29/41; ADR-002. The exact shared pack API belongs in CONTRACT-052 (integrated shared baseline); no manifest fields or command syntax are defined here. Native candidates: [Existing legal example](/Users/erik/Projects/tablespec/examples/legal/README.md).

## Planning Handoff

1. Reuse the completed [legal pack](../../../../spec/domain-packs/legal/pack.json), CONTRACT-052 and [build evidence](../../04-build/evidence/domain-packs.md). The schemas, trusted generator, small/demo/large presets and legal CSV ZIP profile already exist.
2. Map existing evidence to these preserved AC IDs before scheduling additional work. AC1 has eight-schema exact-recovery evidence; AC6 has typed CSV/engine read-back evidence. Review consumer tests for the precise replay, scale, scenario and unsupported-meaning coverage rather than inferring blanket acceptance from aggregate counts.
3. Add STP-061 coverage citations and domain profile/TD material only for gaps or expanded scope. Keep generator and data tests in TableSpec; UMF schema checks remain Bun/Chromium.
4. Retain the fabricated-only source classification. Official terminology imports, calibrated realism, independent injected-violation queries, measured large-scale resource budgets and live Databricks support need their own evidence if claimed.

The legal reference pack is delivered for its recorded subset. This draft story extends catalog qualification; it does not invalidate completed work or claim all newly written ACs already passed. TableSpec-specific execution work remains consumer-owned.

## Out of Scope

Legal advice, production entitlement enforcement, and a complete billing ledger.
