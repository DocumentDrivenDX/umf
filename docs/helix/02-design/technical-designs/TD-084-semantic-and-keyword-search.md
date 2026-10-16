---
ddx:
  id: TD-084
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-084
      kind: informed_by
    - id: SD-029
      kind: informed_by
---

# TD-084: Search with semantic, keyword and hybrid queries

**User Story:** [[US-084-semantic-and-keyword-search]]. **Feature:** [[FEAT-029]].
**Solution Design:** [[SD-029]].

## Scope

Generation of search index namespaces and the `Vector` carrier, the `RankedQuery`
DSL, search compilation and the authored-semantics check in `umf-access catalog`,
the runtime embedder check, result assembly with stale-key hydration, and the
search parts of the PostgreSQL, Lakebase and Unity Catalog adapters.
CONTRACT-074 is authoritative; CONTRACT-070 owns the declarations.

## Technical Approach

**Generation.** For each selected Record with search indexes, the generator emits
a `@final` `s` namespace whose attributes are `VectorIndex[Doc]` or
`KeywordIndex[Doc]`, and types the referenced embedding Field with
`Vector`, a fixed-length tuple of finite float32 values validated by
`umf_access.values`. A `Vector` on any other Field refuses with
`SEARCH_DECLARATION`.

**Types.** `Query.search(...)` returns `RankedQuery[O, R]`, a class that defines
only `into`, `select` and `top`. Omitting the other methods, rather than raising
from them, is what lets both checkers reject `order_by`, `page`, `count`,
`exists` and `update`. `near` takes `Param[str]`, `near_vector` takes
`Param[Vector]`, `matches` takes `Param[str]`; `hybrid(*legs: SearchLeg[O], fusion)`
is generic in one `O`, so legs over different Records do not unify.

**Build.** Capture records the search leg(s), pre-search filters and `k`. Before
calling Weft, the tool checks each configured target against a fixed capability
table derived from CONTRACT-074 and the target's search binding: metric, ranking
family, analyzer, exactness, `computedBy`, fusion and pre-filter support,
including whether the binding declares `filtering: partial`, which needs the
query's `allow_partial=True`. Any
authored property the target cannot implement refuses with `SEARCH_UNSUPPORTED`;
the table has no fallback entries. Filters must use `filterable` Fields
(`SEARCH_FILTER`), and `k` must not exceed the smallest `maxK` or 1,000
(`SEARCH_LIMIT`). `spark-delta`, `truss` and `ashlar` have no rows in the table,
so every search refuses for them. Admitted declarations then compile through
Weft search lowering, and the entry records the mechanism, exactness and
freshness obligations.

**Runtime.** For `.near` on a host-computed index, the runtime takes an
`Embedder` from the target's search configuration, compares
`identity()` with the declaration and checks each returned vector's length and
finiteness before binding it; any mismatch raises `EMBEDDER_MISMATCH` and nothing
is sent. Query text is bound as a parameter (keyword legs) or passed only to the
embedder (vector legs). For runtime `rrf(k, depth)` fusion, the runtime runs each
leg as its own catalog variant retrieving `depth` candidates (default twice the
`.top` count, at most 1,000) and fuses by rank using the RRF constant `k`.

**Results.** Results are `Scored[R]` with `rank`, and `score` labeled with its
kind or `None`. When the index is separate from the table (Vector Search), the
target returns keys and scores; the runtime then reads each row through a
bounded single-key catalog `get` (Weft has no tuple-`IN`), at most `k` reads,
drops keys without rows, counts them as stale without refilling, and keeps rank
order. Hydrated rows reflect current table state while scores reflect the index
at its last refresh. Exact-index ties are broken by the complete Key ascending.

**Spike coverage.** The typing spike in
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` does not
include search types; the `RankedQuery` restrictions are UNTESTED.

**Result and embedder placement.** `.top(k)` returns `SearchResult[R]`, a sequence
of `Scored[R]` carrying `stale`, `approximate` and `partial` (CONTRACT-074). Host embedders
are passed to the target at construction as a mapping from index ID
(CONTRACT-072), not through generated function signatures.

## Component Changes

Planned new paths:

- `src/compilation/targets/python/index.ts` — `s` namespaces and `Vector` typing (shared emitter).
- `python/umf_access/src/umf_access/dsl/search.py` — `VectorIndex`, `KeywordIndex`, `RankedQuery`, `hybrid`, `rrf`, `target_defined`, `Scored`, `Score`.
- `python/umf_access/src/umf_access/build/search_capabilities.py` — fixed per-target capability table and checks.
- `python/umf_access/src/umf_access/runtime/search.py` — embedder check, fusion, hydration, stale counting.
- Search execution in `targets/postgres.py` and `targets/databricks.py`.
- `tests/compilation/python/static/search/{positive,negative}/` with `expected.json`.

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `search`, `searchBindings` | CONTRACT-070/074 | Authored semantics and per-target bindings |
| `Doc.s`, `RankedQuery`, `hybrid`, `Scored`, `Embedder` | CONTRACT-074 | Developer surface and host protocol |
| Catalog entries and capture | CONTRACT-071 | Build-time compilation and refusals |
| `ReadTarget` | CONTRACT-072 | Execution and hydration reads |

## Data Model Changes

None to UMF core or databases. Search entries add mechanism, exactness and
freshness fields to `catalog.json` as recorded by Weft.

## Integration Points

Requires Weft search lowering (not yet available) and per-target native
qualification: pgvector on PostgreSQL 18, pgvector or `lakebase_vector` and
`lakebase_text` on Lakebase, `vector_search()` on Unity Catalog. Until Weft
admits a mechanism, the build refuses it.

## Security

Query text never becomes SQL text or search syntax: keyword text is a bound
parameter under `plain` syntax, and vector text goes only to the host embedder.
The embedder identity check stops a wrong model from silently changing result
meaning. Hydration never fabricates rows for stale keys. The runtime does not log
query text.

## Testing

| AC ID | Planned test | Design assertion | Location |
| --- | --- | --- | --- |
| US-084-AC1 | `authored_semantics_not_substituted` | Each unsupported property refuses per target with `SEARCH_UNSUPPORTED`; no catalog written | `python/umf_access/tests/test_search_build.py` |
| US-084-AC2 | `ranked_query_restrictions` | Static negatives on both checkers; `SEARCH_FILTER`; `SEARCH_LIMIT` | `tests/compilation/python/static/search/`, `python/umf_access/tests/test_search_build.py` |
| US-084-AC3 | `embedder_identity_enforced` | `EMBEDDER_MISMATCH` before send for identity and vector faults; `SEARCH_DECLARATION` at generation | `python/umf_access/tests/test_search_runtime.py`, `tests/compilation/access-generator.test.ts` |
| US-084-AC4 | `stale_keys_dropped` | Stale count, rank order, labeled scores, Key tie-break, freshness obligation | `python/umf_access/tests/test_search_runtime.py`, `python/umf_access/tests/native/test_search_native.py` |
| US-084-AC5 | `plain_syntax_is_inert` | Catalog text unchanged; bound parameter; plain-term result equality | `python/umf_access/tests/native/test_search_native.py` |
| US-084-AC6 | `unsupported_targets_refuse` | Every search kind refuses on `spark-delta`, `truss`, `ashlar`; exact reads still build | `python/umf_access/tests/test_search_build.py` |

STP-084 is the authoritative mapping. All tests are planned and UNTESTED.

## Migration & Rollback

Changing a model version, metric, analyzer or ranking family is breaking and
requires regeneration and re-indexing by the host. Rolling back reverts the
consumer's package and pins; indexes built for a newer declaration must be rebuilt
by the host, since this SDK never builds or refreshes them.

## Implementation Sequence

1. Static search corpus and red build tests with a stub Weft.
2. `RankedQuery` types, `s` namespace and `Vector` generation.
3. Capability table and build refusals.
4. Runtime embedder check, fusion and hydration with a recording target.
5. Native witnesses per mechanism as Weft admits each.

## Risks

| Risk | Mitigation |
| --- | --- |
| Weft search lowering arrives late | Build refuses search; exact reads are independent |
| Native mechanism semantics differ from authored ones (for example tokenizers) | Per-target qualification with recorded witnesses; refuse where they differ |
| Approximate results make tests flaky | Assert set and ordering properties only on `exact` indexes; approximate cases assert labeling and bounds |
