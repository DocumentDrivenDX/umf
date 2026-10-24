---
ddx:
  id: FEAT-034
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

# FEAT-034: Lakeview dashboard interchange

## Overview

Represent observed Lakeview dashboard exports using package-owned kinds and core
Records/Fields, while preserving untouched original input bytes through UMF
JSON/YAML. The owner requested this successor to PR42's compact-token recovery
and parallel field projection. Core remains 0.10.0; `umf.lakeview` advances to
0.2.0 because its representation and compatibility surface change.

## Semantic Rationale

A dashboard is a composition of named datasets, named query outputs and native
presentation objects. UMF identity, containment, Records, Fields and references
apply to those declared data shapes. A dashboard itself is not a row shape or
physical table. Its kind, page layout, query context, calculations and unknown
native content remain extension-owned. Catalog descriptions state these limits
so generic tools discover the composition without assuming BI equivalence.

## Requirements

- LV-01: Keep the original well-formed UTF-8 source, including an optional BOM,
  whitespace, line endings, member order, string escape spelling and numeric tokens.
- LV-02: Untouched native export MUST equal the original input bytes directly,
  including after UMF JSON and YAML serialization. No compacting or equivalent
  JSON comparison may substitute for this requirement.
- LV-03: Use core Records and Fields for explicitly named dataset columns and
  widget-query outputs, connected by stable core references. Do not persist a
  parallel field dictionary, infer SQL types or claim complete dataset schemas.
- LV-04: Declare discoverable kinds and permitted scopes under CONTRACT-906;
  ordinary validation must reject kind/scope mistakes and inconsistent native/core
  representations when the explicit built-in validator is registered.
- LV-05: Keep opaque expressions and unknown native content, report interpretation
  limits and refuse edited native export until a separately qualified rewrite exists.

## Compatibility and Limits

The PR42 `umf.dashboard` 0.1 projection remains the explicitly named
`projectLakeviewToLegacyDashboard` compatibility view. Its historical field model
is not stored by the 0.2 importer. Cross-system projection and edited-source
rewrites are follow-on work; live Databricks acceptance remains unverified.
Rust owns the new operation family under ADR-006, with Node/Bun and browser WASM
presentation bindings. No source content loads code or queries a workspace.

## Verification

US-093 maps committed original files and negative controls to these requirements.
No private dashboard or historical native acceptance claim qualifies this successor.
