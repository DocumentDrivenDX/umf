---
ddx:
  id: FEAT-009
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
---

# FEAT-009: Reusable domain-pack catalog and consumer qualification

**Feature ID:** FEAT-009. **Status:** Draft. **Priority:** P0 under FR-45; selected domain-pack planning slice. **Owner:** UMF schema maintainers and TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One domain-pack capability under FR-45. FR-29/41 consumer reuse and FR-4/8/26/30/39/42 representation/fidelity constrain the workflow without adding separate product capabilities.

## Overview

Domain packs combine versioned domain schemas, domain-type metadata, source provenance and declarative references to consumer generators. UMF owns schemas and schema-generation tooling, including ontology schemas. TableSpec owns tabular data generation, CSV ZIP export, loading and data tests. Truss/Ashlar own graph storage/execution; graph-targeted schema declarations are portable pack artifacts.

## Ideal Future State

A maintainer chooses a domain and declared scale/scenario, inspects the exact model, and obtains a reproducible TableSpec dataset with an interpretable report. Published examples, projections and synthetic supplementation have distinct origins. Another consumer can reuse the schema without adopting TableSpec's execution runtime.

## Problem Statement

Example schemas and fake values alone leave relationships, semantic rules and consumer support implicit. A loader can pass fake-sink tests yet fail on a real engine. Dataset volume, structural validity, native support and calibrated domain realism are separate claims.

## Requirements

- PACK-01: Publish independently versioned pack schemas and discoverable support scope; retain stable identities and unknown extension content.
- PACK-02: Generate schema artifacts deterministically from declared inputs; preserve native meanings and report unsupported mappings. UMF schema tooling accepts explicit inputs and remains browser-compatible.
- PACK-03: Describe generator dependencies declaratively. TableSpec selects trusted implementations explicitly; reading a pack does not execute its content, fetch undeclared dependencies or import arbitrary code.
- PACK-04: Describe per-domain scale/scenario intent and demonstrate reproducible consumer generation. TableSpec owns seeds, correlations, distributions, streaming and measured resource limits.
- PACK-05: Distinguish official originals, traceable projections and generated supplements with source versions, checksums, reuse terms and transformation lineage. CSV ZIP serialization must define exact values, null/empty distinctions, time and Unicode before publication.
- PACK-06: Qualify each consumer path with actual schema-generation, export/reload and independent semantic checks. DuckDB is a portable relational lane; Sail is a fast Spark-compatible lane; Spark and optional operator-run Databricks qualification remain distinct evidence.

- PACK-07: Ship a versioned, explicitly selected loader companion for bounded source acquisition, backfill, refresh and retained-input replay. Expose configuration, dependencies, checkpoint/recovery policy, source scope and machine-readable run evidence. Retain original bytes and revisions; failed collection cannot masquerade as empty coverage. Consumer execution stays outside the portable library.

## User Stories

- [US-060: Reuse a domain pack across schema and dataset tooling](../user-stories/US-060-domain-pack-catalog.md).

Individual domains have separate feature specs because each can ship or defer independently and has a distinct consumer outcome. The [roadmap](../domain-pack-roadmap.md) indexes FEAT-010–FEAT-025 and US-061–US-076.

## Edge Cases and Error Handling

Unknown generator references remain inspectable but block generation until explicitly resolved by the consumer. Missing schema dependencies and mismatched versions do not trigger hidden network resolution. Seeded anomalies carry expected violation labels; accidental violations fail acceptance. Offline multi-document composition must reconcile FEAT-007/CONTRACT-045 rather than invent a competing resolver.

## Success Metrics

Every released pack has executable small-corpus positive/negative evidence and attributable inputs. Schema regeneration yields the same meaning from the same declared inputs. Export/reload preserves admitted exact values and references. Published claims identify the native/runtime version, subset and limitations. No performance or statistical-realism claim is inferred from a preset name.

## Constraints and Assumptions

The selected concerns in concerns.md apply unchanged: fidelity; identity and composition; reproducibility; bounded processing/security; conformance; review; durable adoption/runtime boundary. ADR-002 owns TypeScript/Bun and actual-browser qualification. New UI, authentication and storage slots are unnecessary for this library/schema slice.

Scale configurations vary root counts, fan-out, duration, event density, skew and anomalies. Concrete budgets and preset counts belong in the consumer design and must be measured. Official sample reuse depends on each source's terms.

## Dependencies

FR-4/5/8/26/30/34/39/42; FEAT-005 core meanings; FEAT-006 relationships/bindings; FEAT-007 only where cross-document dependencies are needed. The integrated [CONTRACT-052](../../02-design/contracts/CONTRACT-052-domain-packs.md) defines `umf.domain-pack` and `umf.dataset-source` 1.0.0, including generator references, source descriptors/bindings, schema references and scale presets. Reuse these interfaces for all candidate packs. External versus synthetic origin and observed versus fabricated data are separate classifications; license metadata does not grant redistribution. Archive encoding, domain scenarios, resource budgets and source checksum enforcement remain consumer/profile concerns. [Build evidence](../../04-build/evidence/domain-packs.md) qualifies the implemented subset. This feature does not supersede the TableSpec native-port gate.

## Open Questions

Per-domain profile semantics and archive compatibility beyond the delivered legal CSV profile require design. Dataset resource budgets, per-domain source releases and first release membership remain explicit design/release decisions. Planning covers all candidates; the roadmap proposes order without a calendar commitment.

## Out of Scope

UMF data-generation or database-execution runtime, implicit source fetching, production database loading, universal domain equivalence and blanket scientific/business realism claims.
