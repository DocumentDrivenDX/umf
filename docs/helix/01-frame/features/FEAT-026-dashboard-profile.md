---
ddx:
  id: FEAT-026
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
    - id: FEAT-004
      kind: informed_by
---

# FEAT-026: Dashboard semantic profile

**Feature ID:** FEAT-026. **Status:** Draft. **Priority:** Proposed; not yet scheduled against the product roadmap. **Owner:** Proposed by the Genie dashboard design project (FocusedDiversity); UMF maintainer review pending.
**Covered PRD Subsystem(s):** Extensions and Unknown Semantics; Programmatic Consumers.
**Covered PRD Requirements:** FR-4, FR-27, FR-31, FR-41.
**Cross-Subsystem Rationale:** A third-party, independently versioned vocabulary (FR-4/27/31) whose first consumers are dashboard generators and AI-assisted design tools (FR-41). FR-5/22 constrain unknown content; FR-7/8 constrain the later native translators this profile exists to serve.

## Overview

Describe an analytics dashboard — its pages, datasets, visuals, text and filters — once, independently of the BI platform that renders it. A consumer can read which page a visual sits on, which dataset and fields it uses, how each field is aggregated, which datasets a filter narrows and where each item is placed, without parsing Lakeview JSON or Tableau XML.

## Ideal Future State

An analyst imports a Tableau workbook, reviews one UMF dashboard document, and exports a Databricks AI/BI (Lakeview) dashboard. Every construct that could not cross — a level-of-detail calculation, a highlight action, a floating zone — is listed by the translator rather than dropped. The same document drives design mockups, test baselines and generation prompts, so each widget keeps one identity across the whole lifecycle.

## Problem Statement

Dashboard definitions are locked in platform formats. Lakeview stores widgets as versioned JSON specs bound to named dataset queries; Tableau stores worksheets, shelves and dashboard zones as XML with packaged extracts. Converting between them today is a one-off reading exercise whose losses live in a person's head. There is no neutral record to review, diff, validate or regenerate from.

## Requirements

- DASH-01: Declare a dashboard at document scope with title, ordered pages, an abstract layout grid and an optional theme (font, palette, mode-specific role colors).
- DASH-02: Declare pages as modules with a role (`canvas` or `global-filters`) and datasets in a separate data module, so datasets are shared across pages.
- DASH-03: Declare datasets with a table or query source, an optional grain statement, and every field a visual or filter may use. A field is a row-level `column` or an aggregate `measure`; measures carry their aggregate expression.
- DASH-04: Declare visuals with a chart family, one dataset reference, channel encodings (field, aggregation, scale, sort, format) and a grid position; text blocks with markdown or plain content; filters with a control kind, explicit dataset/field targets and an optional default.
- DASH-05: Retain every query and expression with its language and version, without parsing or translating it, and report it as uninterpreted.
- DASH-06: Carry an optional trace id on visuals, text and filters so lifecycle artifacts (design, tests, prompts) can bind to one item; trace ids are unique within a document.
- DASH-07: Reject contradictions a renderer would otherwise guess at: wrong attachment scope or container, unlisted or unknown pages, dangling dataset references, undeclared fields, aggregating an aggregate, missing or misplaced channels for a chart family, filters on measures, out-of-grid positions and duplicate trace ids.

### Non-Functional Requirements

Browser-compatible TypeScript under ADR-002. Unknown fields survive round trips as incomplete interpretation and block conservative edits. No claim of Lakeview, Tableau or any other BI tool compatibility is made by this profile; native translators are separate, evidenced extensions.

## User Stories

- [US-077: Declare a dashboard independently of its BI platform](../user-stories/US-077-dashboard-profile.md).

## Edge Cases and Error Handling

Overlapping items on one page are a warning, not an error: some platforms allow floating layers, and rendering order is not declared. A filter may target several datasets; each target is explicit and name similarity never links two fields. Platform interactivity with no neutral form (Tableau actions, parameters, Lakeview cross-filter wiring) is retained as unknown content until a later version declares it.

## Success Metrics

A dashboard authored from a deployed Lakeview dashboard round-trips JSON/YAML unchanged; each declared contradiction is rejected independently; a fully interpreted document supports atomic edits.

## Out of Scope

Native Lakeview and Tableau serializations, rendering, query execution, permissions, refresh schedules, subscriptions and alerts.
