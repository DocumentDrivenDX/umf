---
ddx:
  id: STP-084
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-084
      kind: informed_by
    - id: TD-084
      kind: informed_by
---

# STP-084: Search with semantic, keyword and hybrid queries

## Story Reference

**User Story:** [[US-084-semantic-and-keyword-search]].
**Technical Design:** [[TD-084-semantic-and-keyword-search]].
**Related Solution Design:** [[SD-029]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that search keeps authored semantics or refuses, that ranked queries are
restricted by type, that embedders and query text cannot change result meaning or
become syntax, and that stale index entries never produce fabricated rows. All
tests and commands are planned and **UNTESTED**. No search mechanism is supported
until its native lane passes on the pinned platform version.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-084-AC1 | `authored_semantics_not_substituted` | Building `Doc` searches with a `bm25` keyword index for a PostgreSQL target without a qualified BM25 extension, a keyword index and an `rrf` hybrid for Unity Catalog, and an `exact` vector index bound to Vector Search each fails with `SEARCH_UNSUPPORTED` naming the target and property; the output directory is unchanged; a passing build's entries record the authored metric, ranking family, model and analyzer unchanged. | `@covers US-084-AC1` |
| US-084-AC2 | `ranked_query_restrictions` | Static negatives `ranked_order_by.py`, `ranked_page.py`, `ranked_count.py`, `ranked_exists.py`, `ranked_update.py`, `near_int_param.py`, `near_vector_str_param.py` and `hybrid_mixed_records.py` fail on all three pinned checkers with recorded diagnostics; the positive corpus types `.top(20)` as `Scored` results. Build refuses a filter on non-filterable `title` with `SEARCH_FILTER` and `k` of 1,001 or above the smallest `maxK` with `SEARCH_LIMIT`. | `@covers US-084-AC2` |
| US-084-AC3 | `embedder_identity_enforced` | Embedders differing in model, version or dimensions, and embedders returning a short vector or a NaN, each raise `EMBEDDER_MISMATCH` and the recording driver records no statement. Generating a Record with `Vector` on a non-index Field refuses with `SEARCH_DECLARATION`. | `@covers US-084-AC3` |
| US-084-AC4 | `stale_keys_dropped` | Index ranks 1–5 include deleted rank 2 and changed-tenant rank 4. With partial opt-in, at most k hydration calls bind selectedKey plus the original tenant/category predicate; return ranks 1,3,5 with stale=2 and partial=True, no refill or out-of-filter row. Without opt-in the filtered asynchronous query refuses. Repeat a native denial/error and prove it propagates instead of becoming stale. Exact ties use selectedKey; retain asynchronous obligation and the complete search-program artifact. Repeat on the qualified Unity Catalog lane. | `@covers US-084-AC4` |
| US-084-AC5 | `plain_syntax_is_inert` | On a qualified Lakebase keyword index, searching `title:foo* OR 1=1` sends the catalog statement text unchanged with the string as a bound parameter, and returns the same keys as searching `title foo or 1 1`; a document containing the literal `title:foo*` but no `foo` term is not matched by wildcard expansion. | `@covers US-084-AC5` |
| US-084-AC6 | `unsupported_targets_refuse` | For `spark-delta`, `truss` and `ashlar` targets, a vector, a keyword and a hybrid search each refuse with `SEARCH_UNSUPPORTED` and no catalog is written; a configuration with the same targets and only exact reads builds successfully. | `@covers US-084-AC6` |

## Executable Proof

Planned commands (not implemented):

```sh
python -m pytest python/umf_access/tests/test_static_corpus.py -k search
python -m pytest python/umf_access/tests/test_search_build.py python/umf_access/tests/test_search_runtime.py
bun test tests/compilation/access-generator.test.ts -t SEARCH_DECLARATION
UMF_ACCESS_NATIVE=lakebase python -m pytest python/umf_access/tests/native/test_search_native.py
UMF_ACCESS_NATIVE=postgresql python -m pytest python/umf_access/tests/native/test_search_native.py
UMF_ACCESS_NATIVE=unity-catalog python -m pytest python/umf_access/tests/native/test_search_native.py
```

Native lanes without a dedicated endpoint, or without the required extension,
report not-run. Each command's status is kept separately.

Record results under `docs/helix/04-build/evidence/typed-persistence/` with Weft,
extension and platform versions, index definitions, commands, statuses and
recorded statements and parameters.

## Data and Setup

- `fixtures/access/docs/`: a `Doc` Record with `tenant`, `title`, `body` and a
  stored embedding Field; a host-computed cosine vector index, a BM25 keyword
  index on `body` with `tenant` filterable, and search bindings for PostgreSQL,
  Lakebase and Unity Catalog.
- A deterministic test `Embedder` with a fixed identity and a lookup table of
  vectors, plus faulty variants for AC3.
- A recording index target for stale and tie cases.
- Native corpora of a few dozen documents chosen so expected keyword matches are
  unambiguous under the declared analyzer; indexes are built by the harness.

## Edge Cases and Failure Modes

Target-computed embeddings without a host embedder, a host-computed index with no
embedder configured, post-filter-only targets, approximate result variation, and
breaking changes to model version, metric or analyzer.

## Build Handoff

Write the static corpus and red build tests first; then implement TD-084 in
sequence. Each AC needs real assertions with its `@covers` tag. Resolve TD-084's
open points on the result type and embedder placement before implementing AC3
and AC4. Done when all local tests pass and each claimed mechanism's native lane
passes with recorded evidence.
