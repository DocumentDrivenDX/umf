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
| Check | Catch mistakes before building | Pinned pyright and mypy, no plugins |
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

### Non-Functional Requirements

Capture and compilation are deterministic for fixed inputs and pins. At most
1,000 declarations per package, 16 variants and 64 parameters per declaration,
plus Weft's own bounds. Query text and search terms are always bound values; they
are never parsed as SQL or search syntax.

## User Stories

- US-082 — Declare typed queries and have the type checker reject mistakes.
- US-083 — Compile declarations into a checked-in catalog and run them with bound parameters.
- US-084 — Run semantic, keyword and hybrid search through the same typed interface.

## Edge Cases and Error Handling

- A form that type-checks but that Weft cannot lower for some selected target
  fails the build with `WEFT_BLOCKED`.
- Unsupported ordering or an unbounded list fails the build; admitted general ordering appends the complete selected Key as a deterministic tie-breaker.
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
for Postgres, Lakebase and Spark/Unity Catalog, search lowering and plan templates
are cross-repository Weft dependencies, not specified here. Until Weft offers plan
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
tracking, pandas-style masks and `query()` strings, unsupported ordering and full
related-row includes in 0.1, index building and embedding production, and
multi-Record search (`search_across` is a later candidate).
