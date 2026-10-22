---
ddx:
  id: FEAT-027
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: FEAT-009
      kind: informed_by
---

# FEAT-027: Public-company intelligence domain pack

**Priority:** P0 under FR-45. **Owner:** UMF schema maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-45. **Cross-Subsystem Rationale:** Shared pack capability; FR-29/41 constrain consumer reuse.

## Overview

Publish independently versioned public-company schemas, evidence and reviewed deal-signal scenarios. The pack supports business-development research without implying access to private firm data or an authoritative S&P 500 membership list.

## Ideal Future State

A schema integration maintainer loads the same pinned evidence into table and graph consumers, traces a business event to its filing, and distinguishes that observation from a service-opportunity hypothesis.

## Problem Statement

Public filings mix periods, amendments, units and reporting contexts. Screens that flatten these differences can invent trends or promote an inferred opportunity into a company fact. Existing legal operations and litigation fixtures do not model issuer financial evidence.

## Requirements

- PCI-01: Represent companies, identifiers, dated research universes, source snapshots, filings/documents, financial observations, events, signal definitions/results, hypotheses, evidence associations and analysis provenance.
- PCI-02: Preserve exact source bytes, numeric tokens, taxonomy/tag, units, periods, source-qualified accession identities and unknown content. Duplicate/restated observations remain distinct; no latest-value heuristic.
- PCI-03: Qualify membership selection and corpus coverage independently. A selected SEC issuer universe must never assert S&P membership.
- PCI-04: Separate observed filing metadata, deterministic screen results and authored hypotheses; every result traces to pinned evidence and rule/version/run.
- PCI-05: Publish a reproducible fixed corpus and offline positive/negative scenarios with source-specific integrity and rights. Observed records cannot be scenario-replayed.
- PCI-06: Discover and export the pack with existing tooling; qualify TableSpec local ingestion and actual browser inspection separately from live Databricks and native graph execution.

## User Stories

[US-078](../user-stories/US-078-public-company-intelligence.md) owns the fixed-corpus journey.

## Edge Cases and Error Handling

CIKs remain zero-padded strings; tickers are aliases, not keys. A filed date is not a financial period or event date. An 8-K item is metadata evidence, not proof of unannounced demand. Historical submission shards and segment/custom-tag coverage remain explicit. Corrupt/mismatched sources refuse.

## Success Metrics

All published tables and ontology references validate; independent questions return reviewed accession identities; native archive readback preserves exact source values and lineage; browser discovery exposes qualifications. Counts and performance are measured, never inferred from the proposed 25-company scope.

## Dependencies and Open Questions

CONTRACT-052/053 and CONTRACT-059 govern the slice. SEC source availability and policy are checked at selection. CUAD/MAUD, GLEIF, FTC/DOJ and court corpora are optional candidates requiring exact source selection and rights review. S&P licensing, customer offering, model budget, live scheduler/email and Databricks egress remain consumer decisions.

## Out of Scope

Private client/conflicts joins, outreach, price feeds, investment recommendations, live remote ingestion in UMF, deployed UI, production scheduling/email and native graph backend acceptance.
