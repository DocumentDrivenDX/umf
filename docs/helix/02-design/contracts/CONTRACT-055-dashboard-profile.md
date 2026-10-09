---
ddx:
  id: CONTRACT-055
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: US-077
      kind: informed_by
---

# CONTRACT-055: Dashboard semantic profile

**Profile:** `umf.dashboard` 0.1.0. **Native representation:** UMF JSON/YAML with the
dashboard package registered. No Lakeview, Tableau or other BI tool serialization is claimed.

## Purpose and Structural Schema

Represent an analytics dashboard independently of the platform that renders it. The
complete payload schema is `spec/extensions/dashboard/schema.json`, embedded in
`package.json`. JSON-compatible unknown fields survive but produce
`DASHBOARD_UNKNOWN` incomplete-interpretation warnings. No dashboard meaning is
promoted to core; core modules and elements carry identity only.

## Attachments and Identity

A document payload of kind `dashboard` declares title, ordered `pages` (module ids),
an abstract `layout.columns` grid and an optional theme. Module payloads are `page`
(title, role `canvas|global-filters`) or `data`. Element payloads are `dataset` (in a
data module) or `visual`, `text` and `filter` (in a page module). Wrong attachment
scope is `DASHBOARD_SCOPE`; wrong container is `DASHBOARD_PLACEMENT`; any element
payload without a document-level dashboard is `DASHBOARD_ROOT`. A global-filters page
holds only filters (`DASHBOARD_GLOBAL_FILTERS`). Every page module appears exactly once
in `pages`, and every listed id is a page module (`DASHBOARD_PAGES`).

Dataset references are `{module,element}` and must resolve to a dataset payload
(`DASHBOARD_REFERENCE`). Display titles and field-name similarity never link items.
Optional `trace` ids on visuals, text and filters are unique per document
(`DASHBOARD_TRACE`); they bind lifecycle artifacts such as design widgets and test
cases and carry no rendering meaning.

## Datasets and Fields

A dataset declares a `table` (qualified name, not resolved) or `query` source, an
optional `grain` statement and every field visuals or filters may use. A field is a
row-level `column` or an aggregate `measure`; measures must declare their aggregate
expression (`DASHBOARD_MEASURE`). Field types are descriptive, not checked against a
source. Queries and expressions retain language, optional version and text; each is
reported once as `DASHBOARD_EXPRESSION_OPAQUE`. No SQL, Tableau calculation or other
language is parsed, executed, normalized or translated by this profile.

## Visuals, Text and Filters

A visual names one chart family (`counter`, `bar`, `line`, `area`, `scatter`, `pie`,
`heatmap`, `table`), one dataset and ordered channel encodings. Each chart family
requires and permits a fixed channel set; `x`, `value`, `target`, `angle`, `color` and
`size` appear at most once (`DASHBOARD_ENCODING`). Encoded fields must be declared by
the referenced dataset (`DASHBOARD_FIELD`). Measures use aggregation `measure`;
columns use `none` or an explicit aggregation; `custom` requires, and is the only use
of, an encoding expression; `rows: detail` forbids aggregation
(`DASHBOARD_AGGREGATION`). A custom sort requires explicit values (`DASHBOARD_SORT`).
Formats and scales are presentation hints, not data types.

Text carries `plain` or `markdown` content; raw HTML is not a declared format.
Filters name a control kind and one or more explicit `{dataset, field}` targets.
Targets are unique, resolve to declared column fields, and date-range targets with a
declared type are date or date-time; a single-select default has exactly one value
(`DASHBOARD_FILTER`). A filter's page role, not its position, decides whether it is
page-scoped or global; per-visual filter exemptions are not declared in 0.1.0.

## Layout

Positions are integer cells on the declared grid. An item exceeding `layout.columns`
is `DASHBOARD_LAYOUT`. Overlapping items on one page are `DASHBOARD_LAYOUT_OVERLAP`, a
warning, because rendering order is not declared. Pixel sizes, responsive behavior
and floating layers are platform details outside this profile.

## API and Failure Semantics

`dashboardRegistry()` installs structural and semantic validation.
`inspectDashboard(document)` returns ordinary diagnostics. `readDashboardDocument` and
`writeDashboardDocument` require vocabulary version 0.1.0 and a document-level
dashboard, and reject invalid known declarations. `getDashboardDefinition` returns a
copy. `editDashboardDefinition` uses core atomic editing and requires complete
interpretation before and after the change; opaque expressions therefore block it.

## Evidence and Follow-On Work

`fixtures/dashboard/marketing-campaign.json` is authored from a deployed Lakeview
dashboard that was itself converted from a Tableau workbook. Authored assertions and
semantic corruptions cover the rules above. There is no Lakeview or Tableau oracle and
no browser evidence yet. Native `umf.lakeview` and `umf.tableau` extensions must retain
exact native content on the same elements, and their projections to and from this
profile must report every unexpressed construct — level-of-detail and table
calculations, parameters, actions, floating zones, per-widget filter exemptions —
separately from structural target validation.
