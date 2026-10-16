---
ddx:
  id: CONTRACT-074
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# CONTRACT-074: Semantic and keyword search

**Type:** extension declarations, DSL forms and target obligations. **Version:**
proposed `umf-access-search/0.1`.

## Purpose

Offer vector (semantic), keyword (BM25 and similar) and hybrid search through the
same typed query interface as exact reads. Search semantics are authored in UMF;
each target chooses the native mechanism that implements them, or refuses.

## Scope and Boundaries

Search indexes are declared in the CONTRACT-070 `umf.access` extension (member
`search`) and bound per target (member `searchBindings`). CONTRACT-071 captures
search declarations into the catalog; Weft lowers them to native statements, which
is a new Weft capability this contract depends on. CONTRACT-072 targets execute
them. Search is ranked and possibly approximate; it never inherits the exactness,
keyset or count guarantees of CONTRACT-071 reads. Building or refreshing indexes,
and producing stored embeddings, are host or platform operations.

## Normative Surface

### What is authored and what targets choose

| Authored in UMF (must match exactly) | Chosen by the target (may vary) |
| --- | --- |
| Index kind, Record, source Fields, filterable Fields | Index structure (HNSW, IVFFlat, managed index, inverted index) |
| Embedding model identity, version, dimensions, metric | ANN algorithm and parameters, within the declared exactness |
| Keyword ranking family and parameters, analyzer, query syntax | Native function or operator |
| Exactness (`exact` or `approximate`) | Whether results come from a colocated or separate index |

The fusion method for hybrid search is chosen per query in the DSL (`rrf(k,
depth)` or `target_defined()`), so it is captured into the catalog and reviewed with the
query rather than authored on an index.

A target that cannot implement an authored property refuses at catalog build; it
never substitutes a different metric, ranking family, model or analyzer.

### Declarations

`search` is SearchIndex[] with `{id, record, kind, exactness, filterable,
vector?, keyword?}`:

- `kind` is `vector` or `keyword`. `exactness` is `exact` or `approximate`.
- `filterable` lists Fields of the Record that search queries may filter on.
- `vector` is `{field, model:{id,version}, dimensions, metric, computedBy}`.
  `field` is the Record's stored embedding Field, whose type is a fixed-dimension
  float array; `metric` is `cosine`, `dot` or `l2`; `computedBy` is `host` (the
  application writes embeddings and embeds query text) or `target` (the platform
  computes both from source text, as with Databricks managed embeddings).
  `computedBy:target` also requires `source`, a single text Field.
- `keyword` is `{source, ranking, analyzer, syntax}`. `source` lists text Fields.
  `ranking` is `{family:"bm25", k1?, b?}` or `{family:"implementation-defined"}`.
  `analyzer` is `{language, stemming:boolean}` or `"implementation-defined"`.
  `syntax` is `plain` in 0.1: query text is a bag of terms, and search operators,
  quotes and wildcards in it are not interpreted.

`searchBindings` is `{index, target, native, freshness, maxK, filtering}[]`:
`native` names the native index or column; `freshness` is `transactional` (index
updated in the writing transaction) or `asynchronous`; `maxK` is the target's
result cap; `filtering` is `complete` or `partial` (see pre-filtering below).

Embedding Fields use the CONTRACT-068 `Vector` carrier, a fixed-dimension tuple of
float32 values validated for length and finiteness. `Vector` is valid only for
Fields referenced by a vector index; general floating-point Fields remain
unsupported.

### Candidate mechanisms

These are design candidates, each requiring native qualification on its pinned
platform version before a target claims it:

| Target | Vector | Keyword | Hybrid |
| --- | --- | --- | --- |
| `postgresql` | pgvector column with `<=>` (cosine), `<#>` (dot), `<->` (l2); exact scan or HNSW/IVFFlat for `approximate` | Built-in `tsvector` with `ts_rank` qualifies only `implementation-defined` ranking; `bm25` needs a BM25 extension, otherwise refuses | Runtime fusion of two legs |
| `lakebase` | pgvector or `lakebase_vector` | `lakebase_text` for `bm25` | Runtime fusion of two legs |
| `unity-catalog` | `vector_search()` over a Vector Search index (`approximate`, `asynchronous`) | Refuses in 0.1: no standalone keyword mode is qualified | Native `HYBRID` only when the query uses `target_defined()` fusion; `rrf` refuses because no standalone keyword leg is qualified |
| `spark-delta` | Refuses | Refuses | Refuses |
| `truss`, `ashlar` | Refuse in 0.1 | Refuse in 0.1 | Refuse in 0.1 |

Ashlar refuses because a separate index is not pinned to the publication version
vector its reads require.

### DSL

Generated Records with indexes get a typed `s` namespace beside `c`:

```python
@query
def find_docs(tenant: Param[TenantKey], q: Param[str]):
    return (Doc.objects
            .filter(Doc.c.tenant.has(tenant))
            .search(Doc.s.body_semantic.near(q))
            .top(20))                       # -> SearchResult[Doc]

@query
def find_docs_hybrid(q: Param[str]):
    return (Doc.objects
            .search(hybrid(Doc.s.body_semantic.near(q),
                           Doc.s.body_text.matches(q),
                           fusion=rrf(k=60)))
            .into(DocHit)
            .top(20))                       # -> SearchResult[DocHit]
```

- `Doc.s.<index>` is `VectorIndex[Doc]` or `KeywordIndex[Doc]`. `.near(text)`
  takes `Param[str]` and requires `computedBy:target` or a host `Embedder`;
  `.near_vector(v)` takes `Param[Vector]`. `.matches(text)` takes `Param[str]`.
- `hybrid(*legs, fusion=...)` combines legs over the same Record.
  `rrf(k, depth=None)` is reciprocal rank fusion computed by the runtime from each
  leg's ranks: `k` is the RRF rank constant (not the result count), and `depth` is
  the number of candidates each leg retrieves before fusion, defaulting to twice
  the `.top` count and at most 1,000. `target_defined()` accepts the platform's
  native fusion and labels scores so.
- `.search(...)` returns a `RankedQuery`, a separate type. It admits only
  `.into(P)`, `.select(...)` and the terminal `.top(k, *, allow_partial=False)`.
  `order_by`, `page`, `count`, `exists` and `update` are not available on it, so
  type checking rejects them.
- Filters before `.search` may reference only `filterable` Fields and are
  pre-filters, defined by their result: the results are the top `k` among rows
  satisfying the filter. A mechanism that may return fewer than `k` matching rows
  when at least `k` exist (for example an approximate index filtered after
  candidate retrieval) MUST be declared `filtering: partial` in its binding. A
  filtered search on such a binding refuses at catalog build with `SEARCH_FILTER`
  unless the query opts in with `.top(k, allow_partial=True)`; the result then
  reports `partial: true`. For an asynchronous separate index, completeness is
  relative to that index's admitted snapshot, not the current base table. A
  filtered query using current-row hydration also requires `allow_partial=True`
  and reports `partial:true`, because changed or deleted candidates can reduce
  the result below `k` without refill. A synchronous mechanism may claim complete
  current-row filtering only when its index selection and hydration share the
  qualified snapshot. Authorization and the original predicate still apply to
  every returned current row.
- `k` MUST be at most the smallest `maxK` across selected targets and at most
  1,000.

### Results

`.top(k)` returns `SearchResult[R]`, an immutable sequence of `Scored[R]` with three
attributes: `stale: int` (index hits dropped because their rows no longer exist
or no longer satisfy the original filter),
`approximate: bool` and `partial: bool` (the query opted into partial filtering
or asynchronous filtered hydration). `Scored[R]` has `item: R`, `rank: int` (1-based) and
`score: Score | None`, where
`Score` is `{value: float, kind}` and `kind` is `cosine-distance`,
`dot-similarity`, `l2-distance`, `bm25`, `rrf` or `implementation-defined`.
Scores are comparable only within one result list. Results are ordered by rank;
for `exact` indexes, ties break by the Record's complete Key ascending.
`approximate` results may vary between calls and are reported as approximate in
the manifest.

When the index lives apart from the Record's table (for example a Vector Search
index), the target first retrieves keys and scores, then reads each row through a
bounded single-key catalog hydration query that conjoins the exact selected Key
with the complete original pre-search predicate and original bound filter
parameters under current native admission; an unfiltered `get` is forbidden.
If Weft cannot lower that predicate for hydration, the search refuses at build.
A search performs at most `k` hydration reads. Absent or now-nonmatching candidates
are dropped and counted in `stale`; rows are never fabricated and dropped hits
are not refilled, so a result may hold fewer than `k` items. Native denial/error
propagates and is never counted as an absent candidate. Hydrated rows
reflect the table's state at read time, while ranks and scores reflect the index
at its last refresh; a row may therefore no longer match the text or vector that
ranked it.
`asynchronous` freshness means a committed write may be missing from, or stale
in, search results; the manifest records this as a host obligation. A changed
tenant/category/filter value cannot cause an out-of-filter row to be returned.
The selected Key is CONTRACT-070 `selectedKey`, with exact declared component
order and equality. Score freshness never grants permission to omit filtering.

The CONTRACT-071 search-program artifact pins each leg, embedding input/output
carrier, bounded fusion rule and hydration entry plus filter parameter mapping.
Runtime execution only selects/binds those precompiled entries; it invents no
SQL or predicate. The call's timeout covers embedding, every leg and hydration
as one budget, with current target admission for each database operation.

### Embedder

`Embedder` is a host-supplied protocol, passed to a target at construction as a
mapping from index ID to embedder (CONTRACT-072). It has `identity() -> {model, version,
dimensions}` and `embed(texts: list[str]) -> list[Vector]`. The runtime refuses
an embedder whose identity differs from the index declaration, and validates every
returned vector. Query text is sent only to the embedder or as a bound native
parameter; it never becomes SQL text or search syntax.

## Precedence and Compatibility

CONTRACT-070 owns declarations; Weft owns lowering; targets own mechanisms within
the authored semantics. Changing a model version, metric, analyzer or ranking
family is a breaking change that requires regenerating and re-indexing; it is
never applied silently to an existing index.

## Error Semantics

| Code | Condition |
| --- | --- |
| `SEARCH_DECLARATION` | Malformed index, unknown Field, or a `Vector` carrier on a non-index Field |
| `SEARCH_UNSUPPORTED` | A selected target cannot implement an authored property |
| `SEARCH_FILTER` | Filter on a non-filterable Field, a target that cannot pre-filter, or a `partial` filtering binding without `allow_partial=True` |
| `SEARCH_LIMIT` | `k` exceeds `maxK` or 1,000, or an `rrf` depth exceeds 1,000 |
| `EMBEDDER_MISMATCH` | Embedder identity or vector shape differs from the declaration |

## Examples

A `Doc` Record with a cosine vector index computed by the host and a BM25 keyword
index compiles for `lakebase` (pgvector plus `lakebase_text`) and refuses for
`spark-delta`. Searching with the text `title:foo* OR 1=1` matches the terms
`title`, `foo`, `or` and `1`; nothing in it is interpreted as syntax or SQL.

## Prior Art

Salesforce keeps exact queries (SOQL) and index-backed relevance search (SOSL) in
separate languages; here `.search` produces a separate `RankedQuery` type for the
same reason. Apex static SOQL with bind variables is checked against the schema at
compile time, unlike string-built dynamic SOQL; the precompiled catalog follows
the static model. SOSL indexes asynchronously, which this contract states as
declared freshness. Salesforce advises escaping reserved characters in user search
terms; `plain` syntax removes the need. SOSL does not expose relevance scores;
here scores are optional and always labeled with their kind. SOSL's
`RETURNING Account(...), Contact(...)` multi-object search is a candidate for a
later `search_across` form returning typed per-Record lists.

## Validation Checklist

- [ ] Each candidate mechanism has native evidence on its pinned platform version.
- [ ] Refusals for unsupported metrics, ranking families, filters and targets have fixtures.
- [ ] Stale-key hydration (single-key filtered reads, no refill), changed-tenant/category candidates and embedder mismatch behave as specified.
- [ ] Asynchronous filtered hydration refuses without partial opt-in, reports shortfalls and never treats native denial/error as a stale hit.
- [ ] Complete-filter claims use a qualified coherent index/table snapshot; partial bindings and asynchronous filtered hydration refuse without `allow_partial=True`.
