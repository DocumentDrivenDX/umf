---
ddx:
  id: umf.research-palantir-osdk
  type: research
  activity: discover
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# Research: Palantir Ontology SDK as prior art for the typed data access SDK

Read 2026-10-15 from Palantir's public documentation: the
[OSDK overview](https://www.palantir.com/docs/foundry/ontology-sdk/overview),
[TypeScript OSDK](https://palantir.com/docs/foundry/ontology-sdk/typescript-osdk/),
[TypeScript migration guide](https://palantir.com/docs/foundry/ontology-sdk/typescript-osdk-migration/)
and [subscriptions](https://palantir.com/docs/foundry/ontology-sdk/typescript-subscriptions/).
An earlier survey summarized these pages; the items marked "checked" were re-read
against the TypeScript OSDK page. Developer Console documentation behind a login
was not read.

## What the OSDK provides

- **Generation and scope.** Per-application packages (npm, pip/conda, Maven, plus
  OpenAPI) generated from the ontology, containing only the entities the
  application selected. The application's token is scoped to those entities and
  bounded by the user's own permissions; the platform enforces both.
- **Objects and paging.** Typed objects with primary key and API name;
  `fetchOne`, `fetchPage` with page size and a next-page token, and `asyncIter`.
  `$snapshot` (checked) "freezes the view at query time to prevent objects from
  being skipped or duplicated while paging"; it defaults to false. Legacy storage
  caps results at 10,000; no maximum page size is documented for newer storage.
- **Filters (checked).** `$eq`, `$lt`, `$gt`, `$lte`, `$gte`, `$isNull`,
  `$startsWith` (case-insensitive), `$containsAnyTerm`, `$containsAllTerms`,
  `$containsAllTermsInOrder`, combined with `$and`, `$or` and `$not`. No `$in` or
  `$ne` on the page.
- **Sets and links.** Object sets support `union`, `intersect`, `subtract`,
  `pivotTo` along links, and `nearestNeighbors` vector search (1 to 500).
- **Aggregations (checked).** `avg`, `max`, `min`, `sum`, `approximateDistinct`,
  `exactDistinct`; group by exact values, fixed-width buckets, ranges (inclusive
  start, exclusive end) and date/time durations; ordering only with at most one
  group-by property.
- **Writes (checked).** Only through named actions. `applyAction` returns
  validation results (VALID or INVALID, with submission criteria and per-parameter
  results); `$returnEdits` returns the edits. `batchApplyAction` is all-or-nothing
  and returns edits but not validations. Server-side functions cover logic actions
  cannot express.
- **Subscriptions.** WebSocket change events with an out-of-date signal that
  requires re-fetching; not available for pivoted sets.
- **Versioning.** TypeScript OSDK 1.x generated full implementations per ontology
  item; 2.0 generates a thin metadata layer over a shared client library, so fixes
  ship as dependency updates.

## What UMF adopted

| OSDK feature | UMF response |
| --- | --- |
| `$snapshot` paging | `.page(..., snapshot=True)` with table versions in the continuation; live pages documented (CONTRACT-071/072, Weft WR-A12) |
| Validation results and returned edits | `validate()` reporting every failing precondition; `Committed` carries created and changed Keys (CONTRACT-068/072, Weft WR-B4) |
| Aggregations and buckets | Exact `sum_`, `min_`, `max_`, `avg_` with explicit scale, exact and approximate distinct, fixed-width and date buckets (CONTRACT-071, Weft WR-A10) |
| `$startsWith`, term filters | Binary case-sensitive `starts_with`; term filters bound to a declared keyword index analyzer (CONTRACT-071, Weft WR-A11) |
| Thin generated layer (2.0) | Generated classes plus metadata; validation and conversion in the `umf_access` runtime (CONTRACT-068) |
| Scoped application token | Generated least-privilege report per target; the host applies grants (CONTRACT-071) |
| `asyncIter` | Async targets and generated sync/async overloads (CONTRACT-072) |

## What UMF did not adopt, and why

- **Platform-held identity.** The OSDK relies on Palantir's server to enforce
  permissions. UMF has no server: the host supplies connections and native
  privileges or Truss admission enforce access.
- **Runtime query service.** OSDK queries are evaluated by the platform; UMF
  compiles queries at build time through Weft so they can be reviewed and nothing
  is built from input at runtime.
- **Case-insensitive prefix match.** UMF string semantics are binary; case folding
  would need a declared Unicode rule.
- **Deferred:** object-set algebra (`union`, `intersect`, `subtract`), range
  buckets, batch application of explicit action invocations, subscriptions (a
  future candidate on Truss's change feed), and polymorphic interfaces.

## Not confirmed

Client and authentication setup, a validate-only action mode, interfaces and
derived properties, generated-package versioning policy and OAuth scope names were
not confirmed from public pages.
