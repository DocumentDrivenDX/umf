---
ddx:
  id: TD-077
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-055
      kind: informed_by
    - id: US-077
      kind: informed_by
---

# TD-077: Dashboard semantic extension

## Approach

Register one versioned vocabulary with payload variants by attachment scope, following
TD-005. The dashboard root lives at document scope, pages and the data catalog at module
scope, and datasets, visuals, text and filters at element scope. Dataset references are
qualified `{module,element}` pairs; field references are names inside the referenced
dataset. CONTRACT-055 defines all semantic rules. No platform format is inferred.

## Components and Validation

`src/extensions/dashboard/index.ts` implements registration, semantic diagnostics,
copied access and atomic edits, mirroring the DDD extension API. The package and payload
schema live under `spec/extensions/dashboard/`. Chart families are a small table of
required and permitted channels, so adding a family is a data change plus a test.
Document-scope validation checks page order, trace uniqueness and overlap once per
document rather than once per item.

The fixture uses three pages (two canvases and a global-filters page), two datasets
with real Databricks SQL measure expressions, four visuals across four chart families,
one text block and three filters, two of which target both datasets. Tests apply
explicit model contradictions and verify rejection; a derived variant that replaces
every expression with an interpreted equivalent proves the edit path.

## Limits and Next Step

All expression languages are opaque, so any query-sourced dataset blocks conservative
editing — the same tradeoff as DDD invariants. Field roles are `column` and `measure`
rather than BI-style dimension/measure: Tableau's default-aggregated numeric fields
become columns with an explicit encoding aggregation. The next step is a Lakeview
importer that keeps the exact widget JSON in a native extension beside this profile
and reports each widget property it could not express, then the reverse exporter and
a Tableau importer with the same loss discipline.
