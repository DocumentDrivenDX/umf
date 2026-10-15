---
ddx:
  id: STP-083
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-083
      kind: informed_by
    - id: TD-083
      kind: informed_by
---

# STP-083: Compile and run precompiled reads on raw tables

## Story Reference

**User Story:** [[US-083-precompiled-reads-on-raw-tables]].
**Technical Design:** [[TD-083-precompiled-reads-on-raw-tables]].
**Related Solution Design:** [[SD-029]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that the catalog build compiles only what Weft admits for every target,
that runtime reads execute only catalog text with bound parameters on targets
whose identity and shape match their pins, and that pages are bounded and exact.
All tests and commands are planned and **UNTESTED**. Native claims require
witnesses on each pinned platform; a local fake never substitutes for one.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-083-AC1 | `catalog_builds_and_drift_checks` | For `customer_orders` and three other admitted declarations on four targets, `catalog.json` has one entry per declaration and target with all pins, two variants for `customer_orders` (with and without `status`), and each variant's statement, parameters, outputs, obligations and structural digest equal to the pinned Weft response. `queries.py` signatures match CONTRACT-071. `--check` exits 0, then non-zero after one byte of a UMF document, binding or catalog changes. | `@covers US-083-AC1` |
| US-083-AC2 | `blocked_forms_fail_build` | A declaration Weft blocks on `spark-delta` only fails with `WEFT_BLOCKED` naming that target and retaining Weft's diagnostics; an unbounded `.all()`, an `order_by` on a non-Key column and `page(size=1001)` each refuse; the output directory is byte-identical afterward. | `@covers US-083-AC2` |
| US-083-AC3 | `injection_stays_a_parameter` | With a recording driver, the statement text equals the catalog variant byte-for-byte and `status` appears only in the parameter list. On each native target with rows whose status is `open` and one whose status is `x' OR 1=1`, the call returns only the latter. An invalid `Decimal` argument raises `ValueError` and the driver records no call. | `@covers US-083-AC3` |
| US-083-AC4 | `unpinned_target_refused` | Targets whose identity differs from the entry only in `backendVersion`, `targetProfile`, `bindingSha256` or `kind` each raise `NotCompiledForTarget`; the recording driver records no statement. | `@covers US-083-AC4` |
| US-083-AC5 | `verify_detects_drift` | On native PostgreSQL 18, after separately adding a column, dropping one, retyping `amount` to `numeric(14,2)`, removing `NOT NULL`, changing identity generation, changing collation, dropping the Key's unique index and recreating the table (new OID), `verify()` raises `TargetMismatch` each time and no catalog statement runs. A Lakebase target pinned to minors {a, b} raises `TargetMismatch` when the server reports minor c. A target that cannot set the obligated search path raises `ObligationUnmet`. Equivalent table-UUID, column and nullability cases run on Spark/Delta and Unity Catalog. | `@covers US-083-AC5` |
| US-083-AC6 | `bounded_keyset_pages` | With 120 matching rows and `size=50`, pages hold 50, 50 and 20 rows ordered by the complete Key ascending; their union equals the matching set with no duplicates. A stream yielding a duplicate or unexpected column raises `TargetMismatch` before decoding. An injected driver error surfaces as the same exception type. | `@covers US-083-AC6` |
| US-083-AC7 | `aggregates_and_buckets_exact` (needs Weft WR-A10) | On native `postgresql` and `lakebase`, grouped results equal expectations computed independently in Python with `Decimal`: sums keep scale 2; an `avg_(scale=2)` whose exact quotient is `x.xx5` rounds half-even; the all-null status group yields `None` for `sum_`, `min_`, `max_` and `avg_` and 0 for `count()`; an empty filtered set yields `None` sums and count 0; `count_distinct` is exact. Instants either side of a DST change bucket by day in `Europe/Berlin` and `America/New_York` as computed with `zoneinfo`. Groups follow the declared aggregate order with the group key as tiebreak. A `date_bucket` of an instant without `zone` fails the build and writes nothing. | `@covers US-083-AC7` |
| US-083-AC8 | `prefix_and_term_filters` (needs Weft WR-A11) | On native `postgresql` and `lakebase` with rows `50%_off`, `50%xoff`, `a\b`, `A\b` and a null: prefix `50%_` returns only `50%_off`, `a\` only `a\b`, and `""` every non-null row; the recorded statement contains no `LIKE` pattern derived from the argument. A term-filter declaration on a Field without a keyword index fails the build for that target with the other targets unaffected; with a declared index, `matches_all_terms` and `matches_any_term` return exactly the rows an independent tokenization with the index's analyzer selects. | `@covers US-083-AC8` |
| US-083-AC9 | `snapshot_and_live_pages` (needs Weft WR-A12) | On `spark-delta` and `unity-catalog` with 120 rows and `size=50`, a barrier-synchronized writer inserts a row ahead of the cursor and deletes one behind it after page one; the snapshot pages' union equals the 120 rows of the versions recorded in the first continuation, with no duplicates, and the continuation carries those versions. A live run over the same writes yields no duplicate Key. After `VACUUM` removes the recorded versions, the next page raises `StaleContinuation`. The same declaration fails the build for `postgresql` and `lakebase`. | `@covers US-083-AC9` |
| US-083-AC10 | `privilege_report_sufficient` | On native PostgreSQL 18, a fresh login role granted exactly the `privileges.json` script for the target runs every catalog entry (reads, term filter, action) with its expected result. For each grant line, a role granted all other lines fails at least one entry with SQLSTATE `42501` (`ActionDenied` for the action). The report lists tables, columns, operations, functions and indexes per entry; a recording connection shows the SDK never executed any statement from the script. | `@covers US-083-AC10` |
| US-083-AC11 | `async_reads_match_sync` | With `AsyncPostgresTarget` and `AsyncLakebaseTarget`, awaited `customer_orders` pages, recorded statement text and bound parameters equal those from `PostgresTarget` and `LakebaseTarget` on the same data. Pinned pyright and mypy reveal `Page[OrderSummary, OrderKey]` for the sync call and an awaitable of it for the async call; `async_result_used_as_page.py` fails on both checkers. | `@covers US-083-AC11` |
| US-083-AC12 | `schema_neutral_catalog` (needs Weft WR-B7) | One catalog built with `schemaBinding: "search-path"` runs under roles whose `search_path` is `app_a` or `app_b`; each returns only its schema's seeded rows. No statement, catalog file, generated module or call site contains `app_a` or `app_b`, and every system function in the statements is `pg_catalog`-qualified. `verify()` raises `TargetMismatch` when a referenced table is missing from the path and when `search_path` lists `app_a` before `pg_catalog`. Runs on PostgreSQL 18 and Lakebase. | `@covers US-083-AC12` |
| US-083-AC13 | `verify_cache_for_pools` | After one full `verify()`, 50 new pooled connections for the same role each issue exactly one resolution query (counted with a recording connection and `pg_stat_statements`) and run their first statement without the shape checks; a connection whose role resolves to `app_b`, and one to a different database, each run the full checks first. | `@covers US-083-AC13` |
| US-083-AC14 | `distinctness_and_joins` (needs Weft WR-A13, WR-A14) | `is_distinct_from(v)` and `is_not_distinct_from(v)` with `v` present and `v` null, over rows null, equal and different, return the rows S16 defines, and neither ever drops a row as UNKNOWN. A query joining `Customer` (required) and `Carrier` (optional) returns each order exactly once, with `Carrier` columns `None` for orders without a carrier; a join along `Customer.orders` (to-many) fails the build. Runs on PostgreSQL 18 and Lakebase. | `@covers US-083-AC14` |
| US-083-AC15 | `bounded_stream` | With 2,500 matching rows on PostgreSQL 18, `customer_orders_stream(target, ..., max_rows=2200)` yields the first 2,200 rows in Key order without duplicates; the recording connection shows pages of at most 1,000 rows inside one `REPEATABLE READ READ ONLY` transaction; a row committed by a barrier-synchronized writer after the first page, with a Key beyond it, is not yielded. `stream_without_max_rows.py` fails on the pinned checkers. | `@covers US-083-AC15` |
| US-083-AC16 | `read_timeouts` | While another connection holds `ACCESS EXCLUSIVE` on `orders`, a call with `timeout=200ms`, a call relying on a 300 ms `default_timeout`, and a stream page each raise `QueryTimeout` within the deadline plus a stated tolerance and return no rows; server logs show `statement_timeout` set inside the read; constructing `PostgresTarget` without `default_timeout` raises `TypeError`. | `@covers US-083-AC16` |

## Executable Proof

Planned commands (not implemented):

```sh
python -m pytest python/umf_access/tests/test_catalog_build.py python/umf_access/tests/test_runtime_reads.py python/umf_access/tests/test_verify_cache.py
UMF_ACCESS_NATIVE=postgresql python -m pytest python/umf_access/tests/native/test_raw_reads.py python/umf_access/tests/native/test_raw_verify.py
UMF_ACCESS_NATIVE=postgresql python -m pytest python/umf_access/tests/native/test_raw_aggregates.py python/umf_access/tests/native/test_raw_filters.py python/umf_access/tests/native/test_raw_joins.py python/umf_access/tests/native/test_privilege_report.py python/umf_access/tests/native/test_async_reads.py python/umf_access/tests/native/test_schema_neutral.py python/umf_access/tests/native/test_raw_streams.py python/umf_access/tests/native/test_raw_timeouts.py
UMF_ACCESS_NATIVE=spark-delta python -m pytest python/umf_access/tests/native/test_raw_snapshot_pages.py
UMF_ACCESS_NATIVE=lakebase python -m pytest python/umf_access/tests/native/
UMF_ACCESS_NATIVE=unity-catalog python -m pytest python/umf_access/tests/native/
UMF_ACCESS_NATIVE=spark-delta python -m pytest python/umf_access/tests/native/
```

Local tests use a recording fake target and a pinned Weft build. Each native
lane also runs `umf_access.conformance` read tests. A lane without its endpoint
reports not-run; it never passes. Each command's status is kept separately.

Record results under `docs/helix/04-build/evidence/typed-persistence/` with Weft,
backend, driver and server versions (including the observed Lakebase minor),
commands, statuses, and recorded statements and parameters.

## Data and Setup

- The commerce package and a catalog configuration with four targets.
- PostgreSQL 18 in a disposable container; Spark with Delta in a local session;
  Lakebase and Unity Catalog only on explicitly dedicated test endpoints.
- `Order` and `Customer` tables created by the test harness from the binding, with
  120 rows for one customer, including one row whose status is the injection
  string.
- Drift fixtures applied by the harness to a fresh table per case; cleanup drops
  everything the test created.
- Rows for US-083-AC7 to AC16: an all-null status group, decimal amounts with a
  half-even tie, instants across a DST change, prefix strings with `%`, `_` and
  backslash, a declared keyword index, orders with and without a `Carrier`,
  schemas `app_a` and `app_b` with roles bound to each, 2,500 rows for streams,
  and a second connection that takes table locks. Snapshot cases use a local Delta
  table whose retention the harness can shorten. Weft-dependent cases (WR-A10 to
  WR-A14, WR-B7) report not-run until the pinned Weft admits them.

## Edge Cases and Failure Modes

Unlisted Lakebase minors, `.one()` with two rows, `MISSING` versus `None` in
variant selection, reads inside a host transaction, obligation failures, and
reconnect requiring a new `verify()`.

## Build Handoff

Write the recording fake and red tests first; then implement TD-083 in sequence.
Each AC needs real assertions with its `@covers` tag. A target is supported only
when its native lane passes with recorded evidence; local passes alone qualify no
target. Done when all local tests pass and each claimed target's native lane
passes.
