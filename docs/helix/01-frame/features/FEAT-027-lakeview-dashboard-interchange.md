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
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: FEAT-002
      kind: informed_by
    - id: FEAT-026
      kind: informed_by
---

# FEAT-027: Lakeview dashboard interchange

**Feature ID:** FEAT-027. **Status:** Draft. **Priority:** Proposed; not yet scheduled against the product roadmap. **Owner:** Proposed by the Genie dashboard design project (FocusedDiversity); UMF maintainer review pending.
**Covered PRD Subsystem(s):** Native Schema Interchange; Extensions and Unknown Semantics; Programmatic Consumers.
**Covered PRD Requirements:** FR-4, FR-5, FR-7, FR-8, FR-22, FR-41.
**Cross-Subsystem Rationale:** A native, exact-preserving extension (FR-7/8, the FEAT-002 pattern) for a dashboard format rather than a data-shape format, paired with a reported projection into the FEAT-026 neutral profile so loss is explicit (FR-5/22) for programmatic consumers (FR-41).

## Overview

Import a Databricks AI/BI (Lakeview) `.lvdash.json` dashboard into UMF. The native
dashboard is retained exactly, split across the same document, modules and elements
that carry its `umf.dashboard` declaration: one data module of datasets, one module per
page and one element per layout item. The importer returns a loss report that names
every native construct the neutral declaration does not express, by JSON Pointer into
the source file.

## Ideal Future State

A designer imports an existing Lakeview dashboard, reviews the neutral declaration and
its loss report, and either exports the untouched native dashboard or uses the neutral
form to generate a Tableau workbook or a restyled Lakeview dashboard. Every widget-level
filter, parameter binding, relative date default or unsupported widget type that did not
cross is a reviewable line item, not a surprise in production.

## Problem Statement

Lakeview widgets bind versioned spec JSON to named dataset queries through query field
names and opaque expression strings. A neutral reader must decode that indirection,
and a native writer must not lose what the neutral reader ignored. Today both happen by
hand, and the losses are recorded nowhere.

## Requirements

- LV-01: Retain the native dashboard as exact-token, order-preserving JSON distributed
  over document, page module, dataset element and layout-item element payloads.
- LV-02: Export the retained native dashboard back to JSON whose tokens and member
  order equal the source; refuse export when representation is incomplete or inconsistent.
- LV-03: Project datasets, pages, counters, bar/line/area/scatter/pie/heatmap/table
  visuals, text boxes and select, date-range, text-entry and range filters into
  `umf.dashboard`, resolving query field names to dataset fields and aggregations.
- LV-04: Report every native construct the projection does not express, classified as
  `representation-change`, `unsupported` or `annotation-only`, with a JSON Pointer
  into the source. Unconsumed native content is reported generically, so new Lakeview
  properties cannot be dropped silently.
- LV-05: Omit, and report, any neutral item that the dashboard profile would reject,
  rather than emitting an invalid neutral declaration.

### Non-Functional Requirements

Browser-compatible TypeScript under ADR-002. No query, expression or widget spec is
executed or validated against a Databricks workspace; acceptance of an exported file by
Databricks is unverified.

## User Stories

- [US-078: Import a Lakeview dashboard with an explicit loss report](../user-stories/US-078-lakeview-dashboard-interchange.md).

## Edge Cases and Error Handling

Pages without `layoutVersion` use a six-column grid; when a document mixes them with
twelve-column `GRID_V1` pages, legacy positions are doubled horizontally and reported.
A widget-level query filter narrows the native visual only; the neutral visual is then
broader than the native one, and that is reported as `unsupported`. Widget types with no
neutral chart family (histogram, sankey, choropleth and others) keep only their native
payload.

## Success Metrics

The marketing-campaign Lakeview dashboard round-trips token-exactly through UMF
JSON/YAML; its neutral projection validates and matches the authored FEAT-026 fixture on
every construct both declare; every unprojected construct appears in the loss report.

## Out of Scope

Neutral-to-Lakeview export of edited declarations, Tableau interchange, parsing SQL,
inferring field types without a catalog, and verifying exports against Databricks.
