---
ddx:
  id: TD-078
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: US-078
      kind: informed_by
    - id: TD-077
      kind: informed_by
---

# TD-078: Lakeview dashboard interchange

## Approach

Reuse the `umf.delta` tagged tree for exact retention, but split the native dashboard
by identity so each neutral `umf.dashboard` declaration and its native widget JSON sit
on the same element (TD-077's next step). Reassembly needs only module order, element
order and two recorded member orders, so no placeholders are written into native
content.

## Components

`src/adapters/lakeview/index.ts` registers the package, inspects payloads, imports,
exports and returns copies. `src/adapters/lakeview/project.ts` builds the neutral
declaration from plain JSON views of the native fragments and records every pointer it
consumes. After projection, a walk over the source reports each maximal unconsumed
subtree as `LAKEVIEW_UNMAPPED`; specific rules mark their content consumed and report
under their own code. The projected document is then validated with the dashboard
registry; an element with error diagnostics loses its neutral payload, is reported as
`LAKEVIEW_PROJECTION`, and validation repeats until the projection is valid.

Expression handling is pattern matching on the expression shapes Lakeview emits
(backtick-quoted names, `MEASURE`, aggregate calls) rather than SQL parsing; anything
else is reported, so the neutral profile's opacity rule is kept.

## Corpus

The committed fixture is the marketing-campaign dashboard (synthetic data, unqualified
view names). During development, four further private dashboards (240 widgets across
the five files) were imported locally to find unmapped shapes; they are not committed.
They contained histogram, sankey and choropleth widgets, table v1 columns, parameter
bindings, `relationshipGraphs`, widget query filters and legacy six-column pages. All
five export token-exactly and project to a valid declaration; 256 of 305 datasets and
layout items carry a neutral payload. Most of the rest read relationship-graph
sources, count rows with ``COUNT(`*`)``, bind parameters or are unsupported widget
types; `LAKEVIEW_UNMAPPED` is left with counter `rowNumber`, `applyModeEnabled`, the
`percent-stack` mark and axis `domain`.

## Limits and Open Questions

- The vertical row unit of legacy pages is assumed to equal `GRID_V1`'s; only
  horizontal doubling is applied. [NEEDS CLARIFICATION]
- Default selection values are kept as strings; native `dataType` is not converted.
- Trace ids are not inferred from widget names.
- `umf.dashboard` 0.1.0 has no field-less row count, so ``COUNT(`*`)`` widgets are
  not projected; a later profile version could add one. Widget-level query filters
  are only reported, so a projected visual can be broader than its native widget.
- Import and inspection copy the document per payload in core validation, so a
  100-widget dashboard takes seconds; acceptable for interchange, not for editors.
- Neutral-to-Lakeview export of an edited declaration is the next step; it must reuse
  retained native widget JSON where the neutral item is unchanged.
