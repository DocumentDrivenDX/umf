---
ddx:
  id: US-084
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
---

# US-084: Search with semantic, keyword and hybrid queries

**Feature:** [[FEAT-029]]. **Feature Requirements:** QC-06.
**PRD Requirements:** FR-53. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** to declare semantic, keyword and hybrid searches with the same typed DSL I use for exact reads,
**So that** I get ranked results whose meaning (model, metric, ranking, analyzer) is the one authored in the schema on every target, and user search text can never act as query syntax or SQL.

## Context

CONTRACT-074 splits search meaning in two. The schema authors the index kind,
source and filterable Fields, embedding model and version, dimensions, metric,
keyword ranking family, analyzer, query syntax and exactness. Each target only
chooses the mechanism (pgvector, `lakebase_text`, Databricks Vector Search) that
implements that meaning; a target that cannot implement it refuses at catalog
build and never substitutes a different metric, ranking family, model or
analyzer.

`.search(...)` returns a separate `RankedQuery` type, following Salesforce's
split between SOQL and SOSL: ranked results do not inherit the exactness, keyset
paging or counts of exact reads, so those methods are absent from the type.
Query text is `plain` in 0.1: a bag of terms, with operators, quotes and
wildcards treated as ordinary characters. It reaches the platform only as a bound
parameter or as input to a host embedder.

Spark/Delta, Truss and Ashlar support no search mode in 0.1. Ashlar refuses
because a separate index is not pinned to the publication version its reads
require.

## Walkthrough

1. A maintainer authors a host-computed cosine vector index and a BM25 keyword
   index on `Doc`, with `tenant` filterable, and a `lakebase` search binding.
2. The developer declares `find_docs` with `.filter(Doc.c.tenant.has(tenant))`,
   `.search(Doc.s.body_semantic.near(q))` and `.top(20)`; the type checker shows
   the result as a list of `Scored[Doc]`.
3. `umf-access catalog` compiles the search for Lakebase and refuses it for any
   configured target that cannot implement the authored semantics.
4. At runtime the host supplies an `Embedder`; the runtime checks its identity
   against the index, embeds the query text, binds the vector and returns ranked,
   labeled results.

## Acceptance Criteria

- [ ] **US-084-AC1** — Given search indexes whose authored properties a configured target cannot implement (a `bm25` keyword index on PostgreSQL without a qualified BM25 extension, a keyword index on Unity Catalog, an `rrf` hybrid on Unity Catalog, an `exact` vector index on Vector Search), when I run `umf-access catalog`, then the build refuses with `SEARCH_UNSUPPORTED` naming the target and property, writes nothing, and no entry uses a different metric, ranking family, model or analyzer.
- [ ] **US-084-AC2** — Given search declarations, when the pinned pyright and mypy check them and the catalog tool captures them, then calling `order_by`, `page`, `count`, `exists` or `update` on a `RankedQuery`, passing a `Param[int]` to `.near`, a `Param[str]` to `.near_vector`, or combining legs over different Records in `hybrid` fails type checking, `.top(k)` is typed as returning `Scored` results, a filter on a non-filterable Field refuses with `SEARCH_FILTER`, and `k` above the smallest `maxK` or above 1,000 refuses with `SEARCH_LIMIT`.
- [ ] **US-084-AC3** — Given a host-computed vector index and an `Embedder` whose model, version or dimensions differ from the declaration, or that returns a vector of the wrong length or with a non-finite value, when I call a `.near` search, then the runtime raises `EMBEDDER_MISMATCH` before any statement is sent; and a `Vector` carrier on a Field not referenced by a vector index refuses at generation with `SEARCH_DECLARATION`.
- [ ] **US-084-AC4** — Given an index stored apart from its Record's table whose results include keys of rows deleted since indexing, when I run the search, then those keys are dropped and counted as stale, the remaining results keep their rank order, no row is fabricated, every score is labeled with its kind or is absent, ties on an `exact` index break by the complete Key ascending, and the manifest records `asynchronous` freshness as a host obligation.
- [ ] **US-084-AC5** — Given the query text `title:foo* OR 1=1` and a keyword search with `plain` syntax, when I run the search on a qualified target, then the statement text sent to the driver is byte-identical to the catalog variant, the text reaches the platform only as a bound parameter, and the results equal those for the same terms with the operator characters treated as ordinary text, not as a field query, wildcard, boolean operator or SQL.
- [ ] **US-084-AC6** — Given a catalog configuration that includes a `spark-delta`, `truss` or `ashlar` target, when I build any vector, keyword or hybrid search for it, then the build refuses with `SEARCH_UNSUPPORTED` for that target and writes no catalog, while exact reads for the same targets are unaffected.

## Edge Cases

- `computedBy:target` indexes need no host embedder; `.near` on a host-computed
  index without a configured embedder refuses before any statement.
- Filters before `.search` must apply before top-k selection; a target that can
  only post-filter refuses with `SEARCH_FILTER`.
- `approximate` results may differ between calls; that is reported, not a defect.
- Scores are comparable only within one result list.
- Changing a model version, metric, analyzer or ranking family is a breaking
  change that requires regeneration and re-indexing; it is never applied
  silently to an existing index.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| authored_semantics_not_substituted | US-084-AC1 | BM25 on PostgreSQL without extension; keyword and `rrf` hybrid on Unity Catalog; `exact` on Vector Search | `SEARCH_UNSUPPORTED`; nothing written |
| ranked_query_restrictions | US-084-AC2 | Forbidden methods and argument types on `RankedQuery`; non-filterable filter; oversize `k` | Static errors; `SEARCH_FILTER`; `SEARCH_LIMIT` |
| embedder_identity_enforced | US-084-AC3 | Mismatched model, version, dimensions; bad vector; `Vector` on non-index Field | `EMBEDDER_MISMATCH` before send; `SEARCH_DECLARATION` |
| stale_keys_dropped | US-084-AC4 | Separate index with deleted rows; exact-index ties | Stale counted; ranks kept; labeled scores; Key tie-break; freshness obligation |
| plain_syntax_is_inert | US-084-AC5 | `title:foo* OR 1=1` | Catalog text unchanged; bound parameter; plain-term results |
| unsupported_targets_refuse | US-084-AC6 | Vector, keyword, hybrid on `spark-delta`, `truss`, `ashlar` | `SEARCH_UNSUPPORTED`; exact reads unaffected |

## Dependencies

US-082 and US-083; CONTRACT-070 `search` and `searchBindings`; CONTRACT-074;
CONTRACT-071 catalog and capture; CONTRACT-072 targets; Weft search lowering
(a new Weft capability, ADR-004 dependency); per-target native qualification of
each mechanism. Feature requirement QC-06; PRD FR-53. TD-084 owns implementation
detail; STP-084 owns the test mapping.

## Out of Scope

Building or refreshing indexes, writing stored embeddings, multi-Record search
(`search_across`), search on Truss or Ashlar, query syntaxes other than `plain`,
floating-point Fields other than search vectors, and any relevance-quality claim.
