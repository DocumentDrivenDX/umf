---
ddx:
  id: FEAT-010
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
    - id: FEAT-009
      kind: informed_by
---

# FEAT-010: Legal domain pack

**Feature ID:** FEAT-010. **Status:** Draft. **Priority:** P0 under FR-45; roadmap order is proposed. **Owner:** UMF schema maintainers; TableSpec consumer maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45.
**Cross-Subsystem Rationale:** One domain-pack capability under FR-45. FR-29/41 consumer reuse and FR-4/8/26/30/39/42 representation/fidelity constrain the workflow without adding separate product capabilities.

## Overview

Provide a versioned legal reference pack for fee review, matter access, and document issue detection. Users select its declared scope and reuse the same UMF schema meaning for TableSpec datasets and later graph consumers.

## Ideal Future State

A maintainer can inspect the domain schemas, identify their source and support limits, generate a chosen dataset through TableSpec, and use the published scenarios to judge whether ingestion and queries preserve meaning.

## Problem Statement

Independent examples can disagree about domain identities, constraints and native vocabulary. A large generated dataset alone cannot establish whether those meanings survive loading or whether its distribution resembles a real population.

## Requirements

- DOMAIN-01: Cover the initial conceptual inventory: Clients; matters; timekeepers; matter teams; ethical walls; time entries; invoices; documents.
- DOMAIN-02: Preserve the domain distinctions below in authored meaning and expose unsupported consumer behavior.
- DOMAIN-03: Include the positive and negative scenario in US-061, with attributable ground truth separated from ordinary data.
- DOMAIN-04: Describe scale dimensions for clients, matters, workload skew, billing periods, time entries and document density; TableSpec implements dataset generation and measures resource usage.
- DOMAIN-05: Ground native fixtures in identified source releases with reuse terms and preserved originals; generated supplemental content has a distinct origin. The mixed legal pack includes observed public filings, deposition designations and corporate exhibits with source-scoped case identities. Synthetic operations and observed evidence remain disjoint; observed evidence is never scaled or given invented client links. Explicit local-use processing retains unknown rights without clearing redistribution.
- DOMAIN-06: Demonstrate fee review, matter access, and document issue detection through a documented consumer question and independently computed expected outcome for a small corpus.

### Domain distinctions

- Team memberships and ethical exclusions remain disjoint; entries use eligible team members.
- Amounts equal exact hours multiplied by applicable rates; overlapping invoice windows do not imply a complete ledger.
- Practice vocabulary and fabricated clauses retain their illustrative scope.

### Non-Functional Requirements

Apply FEAT-009 PACK-01–PACK-06 and the selected fidelity, identity, reproducibility, bounded-processing, conformance, review and runtime-boundary concerns. Published evidence must identify schema/generator versions, subset, scale and actual engine. Zero unexplained source-content loss and zero unlabeled injected anomalies are required on the accepted corpus. Schema tooling remains browser-compatible under ADR-002.

## User Stories

- [US-061: Exercise the legal pack](../user-stories/US-061-legal-domain-pack.md).

## Edge Cases and Error Handling

Unknown source terms remain retained and marked uninterpreted. Missing references, unsupported required meanings and unresolved identity matches block dependent operations or yield explicitly incomplete reports. An entry by the excluded timekeeper is detected; the clean entry remains valid.

## Success Metrics

The small accepted corpus answers the documented domain question with the expected identities, multiplicities and exact values. All declared domain distinctions have positive and counterexample evidence; all published fixtures have source and reuse records.

## Constraints and Assumptions

Uncalibrated staffing/rates and unreviewed legal clauses must not be described as firm realism. The first release is a bounded reference pack, with scientific/business realism qualified independently from structural correctness.

## Dependencies

[FEAT-009](FEAT-009-domain-pack-catalog.md) owns shared catalog behavior. CONTRACT-052 supplies the shared draft manifest/schema-tooling surface; the integrated `umf.domain-pack` and `umf.dataset-source` 1.0.0 interfaces are reused; domain-specific extensions require separate design before build. Core/native schemas and independent bindings remain separately versioned. Source candidates: [Existing legal example](/Users/erik/Projects/tablespec/examples/legal/README.md).

## Open Questions

Official code-set revision/reuse terms only if adding native terminology, and qualification of additional scenarios or engines beyond the completed fabricated subset. UMF already owns all eight schemas; local Sail/classic Spark loader evidence is recorded in the roadmap baseline. Source candidates require release/snapshot pinning and reuse review before inclusion; website availability alone is not a redistribution grant.

## Out of Scope

Legal advice, production entitlement enforcement, and a complete billing ledger.
