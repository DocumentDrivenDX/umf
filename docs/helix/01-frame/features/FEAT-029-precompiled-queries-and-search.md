---
ddx:
  id: FEAT-029
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-029 — Precompiled typed queries and search

**Priority:** P0 within this proposed capability; no existing release order changes.
**Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation — typed data access SDK.
**Covered PRD Requirements:** FR-53; supporting FR-43 and NFR-50.

## Overview

This is stage two of the typed data access SDK (ADR-004). An application developer
writes reads, ranked searches and bulk commands in Python, using the typed
columns and indexes that FEAT-028 generates. A build step captures each
declaration and compiles it through Weft for every selected target. The result is
a checked-in catalog of native statements plus one typed Python function per
declaration. At runtime only catalog entries run, and caller values reach the
database only as bound, validated parameters. CONTRACT-071 defines the DSL and
catalog; CONTRACT-074 defines search.

## Ideal Future State

A developer writes `Order.objects.filter(Order.c.amount > limit).page(size=50)` and
the editor completes every name. A wrong column, wrong operand type or wrong
argument is a type error before anything runs. A query that some target cannot
run fails the build, not production. Reviewers see the exact native statement for
each target in the diff. No SQL is ever assembled from runtime input.

## Problem Statement

Python developers working with data described by UMF today hand-write SQL or use
string-based APIs. String column references (`"amount"`, `amount__gt`,
`"-placed_at"`) defeat type checking and break silently when the schema changes.
Runtime query builders produce SQL from whatever code path runs in production,
so unsupported forms surface late and input handling is hard to audit. Search
adds more risk: a target may quietly swap a metric, ranking function or embedding
model. Developers need typed declarations that are checked statically, compiled
ahead of time and executed only in reviewed form.

## Functional Areas

| Area | User job | Responsibility |
| --- | --- | --- |
| Declare | Write a read, search or bulk command | Expression-first DSL over generated `c` and `s` namespaces |
| Check | Catch mistakes before building | Pinned pyright, mypy and ty, no plugins |
| Compile | Turn declarations into native statements | Capture, Weft compilation per target, checked-in catalog |
| Run | Call a query with real values | Typed catalog functions, variant selection, bound parameters, bounded results |
| Search | Find records by meaning or keywords | Authored index semantics, target-chosen mechanisms, separate ranked result type |

## Requirements

- **QC-01:** The DSL must be schema-first and expression-first. Every column,
  relationship and search index is a generated typed attribute. There are no
  string column references, keyword lookup strings, string ordering specs or
  query-text methods. Method names follow SQLAlchemy, Django, PySpark, Polars and
  Ibis conventions, as tabulated in CONTRACT-071 (`filter` with a `where` alias,
  `c` namespace, `is_in`, `between`, `order_by`, immutable builders returning
  `Self`).
- **QC-02:** Pinned pyright and pinned mypy, both without plugins, must reject
  every error in the CONTRACT-071 typing table: unknown columns, wrong operand or
  parameter types, columns from another Record, bare `bool` predicates, invalid
  bulk update fields or values, wrong call-site arguments and wrong result use.
- **QC-03:** A build step must capture each declaration from an explicit module
  list, check that two captures agree, and compile every variant through a pinned
  Weft version for each selected target. Any Weft refusal fails the build with
  Weft's diagnostics kept. The catalog and typed query module are checked in and
  drift-checked with `umf-access catalog --check`.
- **QC-04:** At runtime only catalog entries execute. The runtime selects the
  variant from parameter presence, validates each value with CONTRACT-068 codecs
  and binds it as a native parameter. A target must match the entry's Weft and
  binding pins exactly and must pass `verify()` before its first statement.
  Values are never interpolated into SQL text.
- **QC-05:** Results must be typed and bounded. Terminals fix the result type:
  `list[R]`, `R | None`, exactly one `R`, `Page[R, K]` with a keyset
  `Continuation[K]` bound to the target identity, exact counts, typed tuples
  from `.select` and the Record's own declared projections from `.into`. Lists
  and pages are capped at 1,000 rows.
- **QC-06:** Semantic, keyword and hybrid search must follow CONTRACT-074. Index
  semantics (model identity, dimensions, metric, ranking family, analyzer,
  exactness) are authored in UMF; each target picks a native mechanism that
  matches them or refuses. `.search(...)` returns a separate `RankedQuery` type
  that admits only projection and `.top(k)`. A host embedder whose identity
  differs from the declaration refuses. Each binding declares its freshness, and
  asynchronous freshness is recorded as a host obligation.
- **QC-07:** Declarations must be able to aggregate with `sum_`, `min_`, `max_`,
  `avg_(c, scale=n)`, `count()`, `count_distinct` and `approx_count_distinct`,
  group by exact values, `bucket_width` and `date_bucket(unit, zone=)`, and order
  groups by aggregates or group keys with the complete group key as tiebreak.
  Results follow Weft S11 and S12: sums are exact, `avg_` needs an explicit scale
  and rounds half-even, aggregates over no non-null input are null (counts are 0),
  approximate distinct counts are labeled approximate, and instants bucket only
  with an explicit time zone. Aggregates and buckets are typed `Agg[O, T]` and
  `Bucket[O, T]` in `.select` tuples, and both pinned checkers reject the
  CONTRACT-071 "Aggregate misuse" row. A grouped read returns at most 1,000 groups.
- **QC-08:** `c.starts_with(p)` must be a binary, case-sensitive prefix match
  (S13) that never interprets `%`, `_` or escape characters in `p`.
  `matches_all_terms` and `matches_any_term` must be unranked boolean filters that
  tokenize with the analyzer of a declared keyword index (S14); without such an
  index on a target they refuse at catalog build.
- **QC-09:** Pages are live by default: keyset continuation never repeats a row,
  but rows inserted or changed between pages may be missed or seen.
  `.page(..., snapshot=True)` must read every page of one continuation at the
  table versions recorded in the continuation (S15). Snapshot pages compile for
  `unity-catalog` and `spark-delta`, are inherent on Ashlar, and refuse at catalog
  build on `postgresql`, `lakebase` and Truss. A snapshot continuation whose
  versions are no longer readable raises `StaleContinuation`.
- **QC-10:** The catalog build must write `_umf/privileges.json`: for each target,
  the tables and columns each entry reads or writes, the operations, functions and
  search indexes it uses, and a proposed least-privilege grant script in the
  target's own syntax. A role granted exactly this report must be sufficient for
  every catalog entry. The report is review material; the SDK never applies
  grants.
- **QC-11:** Generated catalog functions must be overloaded on the target type: a
  sync target returns the result and an async target returns an awaitable of the
  same type, with the same semantics. Declarations are written once. In 0.1 the
  async read targets are `AsyncPostgresTarget` and `AsyncLakebaseTarget`.
- **QC-12:** A Postgres or Lakebase target configured with
  `schemaBinding: "search-path"` (Weft WR-B7) must run statements that name no
  schema, so one catalog serves every deployment; the host binds the schema per
  connection. `verify()` must check that each referenced table resolves through
  the session's `search_path` to exactly one relation and that `pg_catalog` is
  searched first, and raise `TargetMismatch` otherwise. Verification results are
  cached per process, keyed by target identity, database identity and the
  resolved schemas, so a new pooled connection costs one resolution query.
- **QC-13:** Declarations must offer null-safe `is_distinct_from` and
  `is_not_distinct_from` (S16, Weft WR-A13), which are never UNKNOWN, and
  `.join(rel)` along a declared to-one relationship (S17, Weft WR-A14): inner when
  required, left when optional, at most four joins, never multiplying source rows.
  A joined query is typed `Joined[O1, O2, R]`, its filters accept predicates of
  either Record only, and a left-joined Record's columns are typed `T | None` in
  results. To-many relationships use `has` and related pages, not joins.
- **QC-14:** Each declaration ending in `.page(...)` must also generate
  `<name>_stream(target, ..., max_rows=)`, which yields typed rows across pages
  until the result ends or the required `max_rows` is reached. On Postgres and
  Lakebase the stream reads inside one `REPEATABLE READ READ ONLY` transaction; on
  Delta and Unity Catalog it uses snapshot pages. Each page keeps the 1,000-row
  bound.
- **QC-15:** Every generated query and stream call must take
  `timeout: timedelta | None`; `None` uses the target's required default, so no
  read runs unbounded. The deadline is applied natively and client-side. A read
  past its deadline raises `QueryTimeout` and returns no partial result.

### Non-Functional Requirements

Capture and compilation are deterministic for fixed inputs and pins. At most
1,000 declarations per package, 16 variants and 64 parameters per declaration,
plus Weft's own bounds. Query text and search terms are always bound values; they
are never parsed as SQL or search syntax.

## User Stories

- US-082 — Declare typed queries and have the type checker reject mistakes,
  including aggregate misuse and join typing, on pyright, mypy and ty (QC-01,
  QC-02, QC-07, QC-13).
- US-083 — Compile declarations into a checked-in catalog and run them with bound
  parameters, including aggregates and buckets, prefix and term filters, snapshot
  pages, the privilege report, async calls, schema-neutral catalogs, null-safe
  distinctness and joins, bounded streams and timeouts (QC-03, QC-04, QC-05,
  QC-07 to QC-15).
- US-084 — Run semantic, keyword and hybrid search through the same typed interface (QC-06).

## Edge Cases and Error Handling

- A form that type-checks but that Weft cannot lower for some selected target
  fails the build with `WEFT_BLOCKED`.
- Ordering a row read by anything other than the complete unique Key, or an
  unbounded list, fails the build in 0.1. Grouped reads order by group keys or
  aggregates with the complete group key appended.
- `avg_` without a scale, a date bucket of an instant without a zone, a term
  filter without a declared keyword index, and a snapshot page on `postgresql`,
  `lakebase` or Truss each refuse; none falls back to a weaker form.
- A join along a to-many relationship refuses; a schema-neutral table that
  resolves to no relation, or to an unintended schema, raises `TargetMismatch`; a
  stream without `max_rows` does not type-check.
- More than 16 optional-filter variants fails with `VARIANT_LIMIT`.
- Two captures that differ fail with `CAPTURE_NONDETERMINISTIC`.
- A target whose identity differs from the entry pins raises
  `NotCompiledForTarget`; a target whose observed shape differs raises
  `TargetMismatch`. Neither returns an empty result.
- Bulk commands instantiate their Weft plan at runtime; a changed statement
  structure refuses with `PLAN_DRIFT`.
- A page continuation passed to a target with a different identity raises
  `StaleContinuation`.
- Search with `k` above the smallest `maxK` or 1,000, a filter on a
  non-filterable Field, or a target that can only post-filter refuses. A
  mechanism that may return fewer than `k` matching rows refuses unless the query
  opts into `allow_partial=True`.
- A search hit whose row no longer exists is dropped and counted in `stale`;
  rows are never fabricated and dropped hits are not refilled.

## Success Metrics

Targets, not observed results:

- The static negative corpus is rejected, and the positive corpus accepted, on
  both pinned checkers.
- Every DSL row has a positive case and a Weft-blocked negative case per target.
- Native read and search witnesses pass per qualified target.
- No runtime path accepts SQL text.

## Constraints and Assumptions

Weft owns SQL dialects, lowering, carriers and result decoders. The DSL can
express only what Weft lowers for every selected target. Weft raw-table backends
for Postgres, Lakebase and Spark/Unity Catalog, search lowering, plan templates,
aggregates and buckets (WR-A10), prefix and term filters (WR-A11), snapshot
pages (WR-A12), null-safe distinctness (WR-A13), relationship joins (WR-A14) and
schema-neutral statements (WR-B7) are cross-repository Weft dependencies, not
specified here. Until Weft offers plan
templates, bulk commands call the pinned Weft compiler at runtime. Ad-hoc runtime
queries are out of scope in 0.1. Search mechanisms in CONTRACT-074 are candidates
until native evidence qualifies them.

## Dependencies

FEAT-028 (generated package and `Param`-compatible carriers). Proposed
CONTRACT-071, CONTRACT-072 and CONTRACT-074. CONTRACT-902 for bulk command
plan models. Weft's Python binding as a build-time compiler. FEAT-030 and FEAT-031
provide the targets that execute catalog entries.

## Out of Scope

Free-form or ad-hoc SQL, lazily executed querysets, ORM sessions and change
tracking, pandas-style masks and `query()` strings, non-key ordering and full
related-row includes in 0.1, index building and embedding production, and
multi-Record search (`search_across` is a later candidate).
