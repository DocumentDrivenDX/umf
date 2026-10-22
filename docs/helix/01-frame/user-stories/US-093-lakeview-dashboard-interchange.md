---
ddx:
  id: US-093
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-034
      kind: informed_by
    - id: US-077
      kind: informed_by
---

# US-093: Import a Lakeview dashboard with an explicit loss report

**Feature**: FEAT-034

As a dashboard designer, I want to import an existing Databricks AI/BI (Lakeview)
dashboard into UMF and get both its exact native content and a neutral declaration,
so that I can port or restyle it while seeing every construct that did not translate.

## Acceptance Criteria

- **US-093-AC1:** The marketing-campaign `.lvdash.json` imports into one document whose
  data module, page modules and layout-item elements carry `umf.lakeview` payloads, and
  exports back to JSON with source tokens and member order unchanged, directly and after
  a UMF JSON/YAML round trip. Metadata access returns copies.
- **US-093-AC2:** Its `umf.dashboard` projection validates and agrees with the authored
  US-077 fixture on page order, page roles, grid, theme colors, measure expressions,
  chart families, dataset references and each encoding's channel, field, aggregation,
  scale and sort; the projected filters keep every fixture target. Where the fixture
  abridged its source (queries, text, titles, extra filter targets), the projection
  follows the native file.
- **US-093-AC3:** Widget-level query filters, query orders, dataset parameters,
  relative date-range defaults, unsupported widget types, fixed colors, unmapped theme
  settings and unknown native properties each appear in the loss report with their
  source pointer and classification, and an unsupported widget keeps only its native
  payload.
- **US-093-AC4:** Misplaced or mis-scoped native payloads, inconsistent member order,
  unknown representation fields and non-object native roots fail inspection or block
  export; the six-column legacy grid is doubled into a twelve-column document and
  reported; a neutral item the profile rejects is omitted and reported.

## Evidence and Limits

`tests/lakeview/interchange.test.ts` uses the deployed marketing-campaign dashboard
(synthetic data) and authored mutations. Evidence is limited to that file plus local,
uncommitted dashboards used during development; there is no Databricks oracle, so
acceptance of exported files by a workspace is unverified. CONTRACT-082 governs rule
scope. Exporting an edited neutral declaration to Lakeview is follow-on work.
