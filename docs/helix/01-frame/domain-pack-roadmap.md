---
ddx:
  id: umf.domain-pack-roadmap
  type: roadmap
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# Domain-pack roadmap

**Scope:** UMF domain schemas and schema tooling, with TableSpec-owned dataset generation and consumer qualification.
**Owner:** Product owner for selection; UMF and TableSpec maintainers for design and evidence.
**Last Revised:** 2026-10-09; owner added public-company intelligence with a fixed SEC evidence scenario.

## Horizon and Cadence

The proposed near horizon builds on the delivered shared mechanism and legal baseline, then covers medical, commerce, supply chain and an ecology partner pilot. Review order after each accepted small corpus. Calendar, staffing, dataset budgets and release membership are uncommitted. Later candidates have plans but no scheduled release.

## Placement and Authority

| Activity | Artifact | Authority |
| --- | --- | --- |
| Discover | vision-input.md; domain source inventories | Owner direction, source evidence and unknowns |
| Frame | prd.md FR-45; FR-29/41 context; FEAT-009; per-domain features/stories | Portable consumer scope, shared behavior, each domain's outcome and ACs |
| Design | Shared pack Contract; domain profile Contracts; SD/TD | Exact interfaces, schema semantics, identifiers, bindings, migrations and implementation approach |
| Test | Project test plan and per-story STP | AC-to-test allocation, fixtures, native comparisons and actual-browser evidence |
| Build | implementation-plan.md after TD/STP gates | Executable slices and scoped acceptance evidence |
| Consumer repository | TableSpec governed design/test/build artifacts | Generator code, distributions, CSV ZIP, loading and data correctness |

Domain models are content over core plus extensions. This catalog does not add a universal business worldview to core, require DDD, or establish full native support. A pack, a native adapter, a generated dataset and a qualified loader are separately versioned/evidenced deliverables.

FEAT-009 governs shared catalog behavior. Each domain has its own feature because it can ship or defer independently and has a distinct outcome. The integrated [CONTRACT-052](../02-design/contracts/CONTRACT-052-domain-packs.md) defines `umf.domain-pack` and `umf.dataset-source` 1.0.0. All new packs reuse its generator, sources, source bindings, schema references and scale presets. Domain meaning, scenario ground truth and consumer serialization remain separately governed.

## Delivered Baseline

The legal pack is completed for its declared fabricated tabular subset. [Canonical pack](../../../spec/domain-packs/legal/pack.json) version 1.0.0 declares `tablespec.legal` 1.0.0, eight TableSpec 1.0 JSON schemas and small/demo/large presets. UMF owns pack/schema artifacts and local export; TableSpec owns generation, CSV ZIP and engine ingestion. No migration of the generated TableSpec example back into UMF is needed.

[Implementation evidence](../04-build/evidence/domain-packs.md) records exact native recovery of all eight schemas, four focused Bun tests, nine Chromium 153 checks, Python packaging checks and local Sail 0.6.6/classic Spark ingestion including typed values and repeated Delta replacement. This closes the earlier real-loader uncertainty for that tested subset. The live Databricks path remains unrun. The recorded full UMF suite has 24 failures and one between-test error; focused evidence is not full-suite acceptance.

The shared source mechanism already retains external and mixed metadata and supports explicit local CSV ingestion in TableSpec. Medical adds checksum enforcement and pinned local source bundles. It does not implement remote retrieval, arbitrary conversion or mixed-source joins. Ecology and archaeology must plan these consumer capabilities only where needed, while reusing existing provenance/license descriptors. Fabricated legal rows require no official-record import. The draft catalog ACs remain qualification targets; existing evidence should be mapped to them rather than rerunning the completed baseline or retroactively claiming every new AC passed.

Medical is also delivered: [scoped evidence](../04-build/evidence/medical-domain-pack.md) records 17 HL7 R4 4.0.1 originals, eight tabular projections, 51 rows, checksum/rights refusal, source-to-archive mappings and local Sail/Spark execution. It is a fixed external fabricated corpus with no generator or clinical simulation claim. CMS candidates remain reference-only. Source integrity enforcement and explicit source bundling are now shared capabilities; mixed-source transformations and remote retrieval remain outside the delivered subset.

The owner's next implementation direction is [SD-026](../02-design/solution-designs/SD-026-domain-pack-platform.md): author all remaining domain schemas and bounded scenarios, including ontology schemas for graph targets, then qualify dataset tooling and explorer visibility. Ontology schemas belong in UMF; execution and storage bindings remain consumer-owned. Scenario replay is labeled independently of realistic population generation.

## Workstreams

| Alias | Workstream | Scope | Owner | Status |
| --- | --- | --- | --- | --- |
| WS-1 | Pack/schema tooling | UMF pack representation, schema generation and browser qualification | UMF schema maintainers | active |
| WS-2 | Domain schemas and sources | Domain profiles, native fixtures, provenance and schema mappings | UMF domain maintainers | active |
| WS-3 | Dataset and engine qualification | TableSpec generators, archives, loading and independent data checks | TableSpec maintainers | active |
| WS-4 | Ecology partner pilot | Watershed/quality/biodiversity demonstration and expert review | Partner/domain reviewer to be identified; UMF maintainers | active |

## Sequenced Outcomes

This is proposed ordering. Rows may proceed independently once their actual dependency passes; ordinal position alone is not a technical dependency.

| Order | Outcome | Workstream | Governing Artifact | Target Iteration | Depends On | Confidence | Why This Order |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Map shared baseline evidence to catalog ACs and identify only uncovered qualification | WS-1, WS-3 | FEAT-009 / US-060 | Unassigned | Integrated CONTRACT-052 and build evidence | high | Reuses delivered interfaces and export/ingestion behavior |
| 2 | Map completed legal evidence to US-061; scope any additional scenario qualification | WS-2, WS-3 | FEAT-010 / US-061 | Unassigned | Delivered legal pack; 1 | high | Records completion without reopening schema migration or local-loader work |
| 3 | Medical small corpus answers its documented question | WS-2, WS-3 | FEAT-011 / US-062 | Unassigned | 1; clinical source/profile selection | medium | Establishes official originals versus generated supplementation |
| 4 | Commerce and procurement small corpus answers its documented question | WS-2, WS-3 | FEAT-012 / US-063 | Unassigned | 1 | medium | Provides reusable exact transaction and fulfillment invariants |
| 5 | Supply chain and logistics small corpus answers its documented question | WS-2, WS-3 | FEAT-013 / US-064 | Unassigned | 1; shared transaction vocabulary where reused | medium | Adds lot lineage, containment and event semantics |
| 6 | Ecology and water management small corpus answers its documented question | WS-2, WS-4, WS-3 | FEAT-024 / US-075 | Unassigned | 1; pilot region and source snapshot selection | medium | Partner context provides a concrete place to review scientific comparability |

## Catalog and Later Candidates

Every plan defines initial scope, native-source candidates, semantic distinctions, scale dimensions, positive/counterexamples, acceptance criteria and explicit downstream design/test work. P0 retains the FR-45 functional obligation; catalog sequencing sets no release dates and does not demote earlier product obligations.

| Domain | Feature | Story | Proposed horizon |
| --- | --- | --- | --- |
| Legal | [FEAT-010](features/FEAT-010-legal-domain-pack.md) | [US-061](user-stories/US-061-legal-domain-pack.md) | Completed baseline; remaining AC mapping |
| Medical | [FEAT-011](features/FEAT-011-medical-domain-pack.md) | [US-062](user-stories/US-062-medical-domain-pack.md) | Completed fixed corpus; broader clinical scope remains planned |
| Commerce and procurement | [FEAT-012](features/FEAT-012-commerce-domain-pack.md) | [US-063](user-stories/US-063-commerce-domain-pack.md) | Near horizon |
| Supply chain and logistics | [FEAT-013](features/FEAT-013-supply-chain-domain-pack.md) | [US-064](user-stories/US-064-supply-chain-domain-pack.md) | Near horizon |
| Cybersecurity and IT operations | [FEAT-014](features/FEAT-014-cybersecurity-domain-pack.md) | [US-065](user-stories/US-065-cybersecurity-domain-pack.md) | Next candidates; uncommitted |
| Manufacturing and maintenance | [FEAT-015](features/FEAT-015-manufacturing-domain-pack.md) | [US-066](user-stories/US-066-manufacturing-domain-pack.md) | Next candidates; uncommitted |
| Banking and payments | [FEAT-016](features/FEAT-016-payments-domain-pack.md) | [US-067](user-stories/US-067-payments-domain-pack.md) | Later candidates; unsequenced |
| Education | [FEAT-017](features/FEAT-017-education-domain-pack.md) | [US-068](user-stories/US-068-education-domain-pack.md) | Later candidates; unsequenced |
| Transit and mobility | [FEAT-018](features/FEAT-018-transit-domain-pack.md) | [US-069](user-stories/US-069-transit-domain-pack.md) | Later candidates; unsequenced |
| Real estate and property operations | [FEAT-019](features/FEAT-019-real-estate-domain-pack.md) | [US-070](user-stories/US-070-real-estate-domain-pack.md) | Later candidates; unsequenced |
| Energy and utilities | [FEAT-020](features/FEAT-020-energy-domain-pack.md) | [US-071](user-stories/US-071-energy-domain-pack.md) | Later candidates; unsequenced |
| HR and recruiting | [FEAT-021](features/FEAT-021-hr-domain-pack.md) | [US-072](user-stories/US-072-hr-domain-pack.md) | Later candidates; unsequenced |
| MarTech | [FEAT-022](features/FEAT-022-martech-domain-pack.md) | [US-073](user-stories/US-073-martech-domain-pack.md) | Next candidates; uncommitted |
| Construction | [FEAT-023](features/FEAT-023-construction-domain-pack.md) | [US-074](user-stories/US-074-construction-domain-pack.md) | Next candidates; uncommitted |
| Ecology and water management | [FEAT-024](features/FEAT-024-ecology-domain-pack.md) | [US-075](user-stories/US-075-ecology-domain-pack.md) | Near horizon |
| Archaeology | [FEAT-025](features/FEAT-025-archaeology-domain-pack.md) | [US-076](user-stories/US-076-archaeology-domain-pack.md) | Later candidate; source inventory first |
| Public-company intelligence | [FEAT-027](features/FEAT-027-public-company-intelligence.md) | [US-078](user-stories/US-078-public-company-intelligence.md) | Fixed SEC evidence slice; live application remains consumer work |

## Design and Test Handoff

For new domain build slices, settle unresolved profile choices and author their Contract, TD and STP. For the delivered legal/shared baseline, reuse CONTRACT-052 and implementation evidence; add design/test artifacts only for uncovered scope. Contracts own exact pack/schema/serialization surfaces. The STP maps every AC to exercising tests with canonical coverage citations. TableSpec authoring remains consumer-owned; these UMF plans state the evidence obligation and ownership, not new TableSpec commands or implementation instructions.

UMF evidence covers schema generation, metadata/unknown-content preservation, structural validation and actual Chromium behavior. TableSpec evidence covers seeded generation, domain invariants, memory-bounded scale, typed CSV ZIP read-back and actual local engine ingestion. DuckDB, Sail, Spark and operator-run Databricks evidence each name versions, subsets and skips. A passing schema validator does not imply scientific realism or native loader acceptance.

The ecology approach is developed in [SD-024](../02-design/solution-designs/SD-024-ecology-domain-pack.md). Archaeology is developed in [SD-025](../02-design/solution-designs/SD-025-archaeology-domain-pack.md), covering context-linked reports/media and specialist analysis. Legal has the delivered baseline above. The other candidate packs remain at framing; their exact native subsets and runtime budgets are explicit design inputs.

## Revision Triggers

- A source snapshot or reuse constraint prevents redistribution.
- The partner selects a different ecology geography, question or sampling method.
- Shared pack/schema tooling exposes an unsupported core meaning or unresolved cross-document dependency.
- A native engine disagrees with local acceptance, or an expert rejects the proposed realism/comparability claim.
- Capacity or release selection changes; keep feature/story identities and AC references stable while revising order.

## First-Release Delivery

The sixteen-pack catalog is implemented with tabular schemas, UMF ontology schemas,
small fixtures, bounded replay tooling and explorer discovery.
[Build evidence](../04-build/evidence/domain-pack-catalog.md) records Astra ultra
review and producer/consumer/browser checks. Native graph intake, open-source corpus
adapters, independently varied scientific/topological dimensions and population
realism remain separately planned work; catalog membership does not complete those
broader acceptance criteria.

## Public-company intelligence addition

The owner requested a separate issuer-evidence pack under FEAT-027.
CONTRACT-058 and TD-078/STP-078 reuse CONTRACT-052/053 fixed-mode profiles.
The selected 25-company universe, item-metadata screen and scoped financial
observations are independent of licensed S&P membership and legal firm data.
[evidence/public-company-intelligence.md](../04-build/evidence/public-company-intelligence.md)
qualifies local source/consumer/browser results and unresolved narrative access.
Model routing, live Databricks, admin UI, scheduling and email remain consumer work.
