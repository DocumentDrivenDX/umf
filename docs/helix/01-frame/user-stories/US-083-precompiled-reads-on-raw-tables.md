---
ddx:
  id: US-083
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
---

# US-083: Compile and run precompiled reads on raw tables

**Feature:** [[FEAT-029]]. **Feature Requirements:** QC-03, QC-04, QC-05, QC-07 to QC-15; FEAT-030 AT-03 for raw-table targets.
**PRD Requirements:** FR-53. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** my declared reads compiled through Weft at build time for each target I deploy to, and run at runtime only from that checked-in catalog,
**So that** unsupported queries fail before deployment, customer input can never change a statement, and a read never runs against a database whose shape differs from what it was compiled for.

## Context

This is stage two of the ADR-004 build. `umf-access catalog` captures each
declaration (US-082), renders it to canonical Weft SQL, and asks the pinned Weft
version to compile every presence variant for every configured target. Weft owns
dialects, lowering, parameter carriers, result decoders and host obligations; UMF
never writes native SQL. Any blocked variant fails the build with Weft's
diagnostics.

At runtime, a generated `queries.py` function selects a variant by which optional
arguments are present, validates and encodes each argument, and passes it to a
CONTRACT-072 target as a bound parameter. The raw-table targets are
`PostgresTarget`, `LakebaseTarget`, `UnityCatalogTarget` and `SparkDeltaTarget`
over host-owned connections or sessions. Before its first statement, and after
every reconnect, a target runs `verify()` against the live server and tables.

The same path carries grouped reads with exact aggregates and buckets, prefix and
term filters, and snapshot pages where the platform can pin table versions. The
build also writes a least-privilege report the host can review and grant from.
`AsyncPostgresTarget` and `AsyncLakebaseTarget` run the same generated functions
with `await`. These forms depend on Weft WR-A10, WR-A11 and WR-A12.

A host with one schema per application deployment and per-user connection pools
(the first consumer's setup) builds the catalog once with
`schemaBinding: "search-path"` and binds the schema per connection; pooled
connections reuse a cached verification. Reads also offer null-safe distinctness,
typed joins along to-one relationships (Weft WR-A13, WR-A14, WR-B7), bounded
streams for exports and a timeout on every call.

Native support is claimed per target only with witnesses on the pinned platform
version. Local tests and specifications do not establish it.

## Walkthrough

1. The developer lists query modules and targets (for example `postgresql` 18,
   `lakebase` 17, `unity-catalog` and `spark-delta`) in the catalog
   configuration, with pinned Weft, backend, profile and binding versions.
2. `umf-access catalog` writes `queries.py` and `_umf/catalog.json`, or fails
   with `WEFT_BLOCKED` and Weft's diagnostics; CI runs `--check`.
3. The service opens its own connection, wraps it as, say,
   `LakebaseTarget(conn, catalog.targets["lakebase-17"])`, and calls `verify()`.
4. The service calls `queries.customer_orders(target, customer=k, after=None)`
   and gets a typed `Page[OrderSummary, OrderKey]`; it passes `page.next_after`
   to fetch the next page.

## Acceptance Criteria

- [ ] **US-083-AC1** — Given declarations that Weft admits for every configured target, when I run `umf-access catalog` and then `umf-access catalog --check`, then each declaration has one entry per target recording Weft, backend, profile and binding pins and one variant per presence combination with statement text, typed parameters, outputs, obligations and structural digest, `queries.py` exposes one typed function per declaration, and `--check` exits zero until any input or catalog byte changes.
- [ ] **US-083-AC2** — Given a declaration that type-checks but that Weft blocks on at least one configured target, an unbounded read, an ordering other than the complete unique Key, or a page size above 1,000, when I run `umf-access catalog`, then the build fails with `WEFT_BLOCKED` (Weft's diagnostics retained) or the matching bound refusal, and no catalog or `queries.py` is written.
- [ ] **US-083-AC3** — Given a verified raw-table target and the argument `status="x' OR 1=1"`, when I call `customer_orders`, then the statement text sent to the driver is byte-identical to the catalog variant for the present arguments, the argument reaches the driver only as a bound parameter, the result contains only rows whose status equals that literal string, and an argument that fails codec validation raises before any statement is sent.
- [ ] **US-083-AC4** — Given a target whose identity differs from every catalog entry's pins in backend version, target profile, binding digest or kind, when I call any generated query, then it raises `NotCompiledForTarget` before any statement is sent.
- [ ] **US-083-AC5** — Given a target whose server version, relation identity (OID or table UUID), column set, column type or typmod, nullability, identity or generation, collation, or required unique Key index differs from its pins, or a Lakebase target reporting a minor version not listed in its pins, when `verify()` runs, then it raises `TargetMismatch` and no catalog statement runs; and a host obligation the target cannot apply raises `ObligationUnmet`.
- [ ] **US-083-AC6** — Given a table with more rows than one page, when I page through `customer_orders` with `size=50` following each `next_after` continuation, then every page has at most 50 rows ordered by the complete Key ascending, the pages together return each matching row exactly once, a result stream with a duplicate or unexpected column raises `TargetMismatch` before any row is decoded, and a native driver error is re-raised unchanged rather than returned as an empty page.
- [ ] **US-083-AC7** — Given a Weft build admitting WR-A10 and `Order` rows on verified `postgresql` and `lakebase` targets with `numeric(12,2)` amounts, one status group whose amounts are all null, and instants on both sides of a DST change, when grouped declarations using `sum_`, `min_`, `max_`, `avg_(scale=2)`, `count()`, `count_distinct`, `bucket_width` and `date_bucket("day", zone=z)` run, then sums are exact decimals at scale 2, an average whose exact quotient ends in a half tie rounds half-even, the all-null group returns null for `sum_`, `min_`, `max_` and `avg_` and 0 for `count()`, an aggregate over an empty filtered set returns null sums and a 0 count, each instant falls in its local day for two different zones, groups are ordered by the declared aggregate with the complete group key as tiebreak, and a `date_bucket` of an instant without `zone` fails the catalog build.
- [ ] **US-083-AC8** — Given a Weft build admitting WR-A11 and string values `50%_off`, `50%xoff`, `a\b` and `A\b` on verified `postgresql` and `lakebase` targets, when `starts_with` runs with the prefixes `50%_`, `a\` and the empty string, then `50%_` matches only `50%_off`, `a\` matches only `a\b`, the empty prefix matches every non-null value and no null, and the statement text shows no `LIKE` pattern built from the argument; and a `matches_all_terms` or `matches_any_term` declaration on a Field without a declared keyword index fails the catalog build for that target, while with one it returns exactly the rows containing all, or any, of the query's terms under the index's analyzer.
- [ ] **US-083-AC9** — Given a Weft build admitting WR-A12 and 120 matching rows on `spark-delta` and `unity-catalog`, when a `snapshot=True` declaration is paged with `size=50` while a concurrent writer inserts a row ahead of the cursor and deletes one behind it between pages, then the pages together return exactly the 120 rows of the table versions recorded in the first continuation with none skipped or repeated, a live page on the same data repeats no row, a snapshot continuation whose versions Delta retention has removed raises `StaleContinuation`, and the same `snapshot=True` declaration fails the catalog build for `postgresql` and `lakebase` targets.
- [ ] **US-083-AC10** — Given a catalog with reads, a term filter and an action compiled for a verified `postgresql` target, when a fresh role is granted exactly the grant script in `_umf/privileges.json` for that target, then every catalog entry runs under that role with its expected result; for each privilege in the script, a role granted all but that one fails at least one entry with a native privilege error (SQLSTATE `42501`, surfaced as `ActionDenied` for actions); the report lists each entry's tables, columns, operations, functions and indexes; and the SDK never executes the script.
- [ ] **US-083-AC11** — Given verified `AsyncPostgresTarget` and `AsyncLakebaseTarget` over psycopg 3 async connections, when `customer_orders` is awaited and paged on each, then statement text, bound parameters and returned pages equal those of the sync target on the same data, and pinned pyright and mypy type the generated call as `Page[OrderSummary, OrderKey]` with a sync target and as an awaitable of that type with an async target, rejecting use of the async result as a `Page` without `await`.
- [ ] **US-083-AC12** — Given a catalog built with `schemaBinding: "search-path"` under a Weft build admitting WR-B7, schemas `app_a` and `app_b` holding the same tables with different rows, and two roles whose `search_path` is `app_a` or `app_b`, when the same generated query runs on a verified `postgresql` or `lakebase` target under each role, then each returns only its own schema's rows, no statement text, catalog file, generated module or call site names a schema, system functions in the statements are qualified with `pg_catalog`, and `verify()` raises `TargetMismatch` for a role whose `search_path` resolves a referenced table to no relation or lists a schema before `pg_catalog`.
- [ ] **US-083-AC13** — Given a schema-neutral target verified once in a process, when the host wraps 50 new pooled connections for the same role and database, then each new connection runs exactly one schema-resolution query and reuses the cached verification without repeating the shape checks, while a connection whose `search_path` resolves a table to a different schema, or that reports a different database identity, is verified in full before its first statement.
- [ ] **US-083-AC14** — Given a Weft build admitting WR-A13 and WR-A14 on verified `postgresql` and `lakebase` targets, when `is_distinct_from` and `is_not_distinct_from` run with a present and a null argument against rows whose column is null, equal or different, and a query joins `Order` to `Customer` (required) and to `Carrier` (optional) over orders with and without a carrier, then distinctness is never UNKNOWN (null is distinct from a present value and not distinct from null), every order appears exactly once, `Carrier` columns are null where there is no carrier, and a join along a to-many relationship fails the catalog build.
- [ ] **US-083-AC15** — Given 2,500 matching rows on a verified `postgresql` target, when `customer_orders_stream(target, ..., max_rows=2200)` is consumed while a concurrent transaction commits a new matching row whose Key sorts after the first page, then the stream yields exactly the first 2,200 rows in Key order with no duplicates, no underlying page exceeds 1,000 rows, every page runs in one `REPEATABLE READ READ ONLY` transaction so the concurrent row is not seen, and a call without `max_rows` fails type checking on the pinned checkers.
- [ ] **US-083-AC16** — Given a verified `postgresql` target constructed with a `default_timeout`, and another connection holding an `ACCESS EXCLUSIVE` lock on the queried table, when a generated query is called with `timeout=timedelta(milliseconds=200)`, called with no timeout, and streamed, then each raises `QueryTimeout` with no partial rows once its deadline (the explicit one, or the default) passes, the server shows the deadline applied as `statement_timeout` inside the read, and constructing a target without a default timeout raises `TypeError`.

## Edge Cases

- Lakebase applies minor versions automatically; an unlisted minor refuses until
  the target pins are requalified and the catalog rebuilt.
- `verify()` checks shape at one moment; it does not prove the shape stays the
  same afterward and confers no authorization.
- `.first()` and `.one()` compile as pages of size 1 or 2; `.one()` with two rows
  raises rather than returning one.
- An optional filter whose argument is `MISSING` selects the variant without it;
  `None` is a value, not absence.
- Reads may run inside a host-owned transaction; targets never open connections,
  pools, sessions or transactions of their own for reads.
- A target that cannot apply a Weft host obligation (search path, session
  setting, isolation) refuses rather than running without it.
- Live pages may miss or show rows changed between pages; only snapshot pages
  promise a consistent set, and Postgres and Lakebase do not offer them.
- An approximate distinct count is labeled approximate in its output descriptor
  and is never compared as an exact value.
- The privilege report proposes grants; the host reviews and applies them, and
  native row-level security, row filters and masks still apply.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| catalog_builds_and_drift_checks | US-083-AC1 | Admitted declarations; four targets; then one changed byte | Complete entries and typed functions; `--check` zero then non-zero |
| blocked_forms_fail_build | US-083-AC2 | Weft-blocked form on one target; unbounded; non-key ordering; size 1,001 | `WEFT_BLOCKED` or bound refusal; nothing written |
| injection_stays_a_parameter | US-083-AC3 | `status="x' OR 1=1"`; invalid decimal argument | Catalog text unchanged; bound value; no extra rows; pre-send refusal |
| unpinned_target_refused | US-083-AC4 | Identity differing in each pinned member | `NotCompiledForTarget`; no statement |
| verify_detects_drift | US-083-AC5 | Each shape and version change; unlisted Lakebase minor; unmet obligation | `TargetMismatch` or `ObligationUnmet`; no statement |
| bounded_keyset_pages | US-083-AC6 | 120 matching rows; duplicate-column stream; injected driver error | Exact keyset coverage; refusal before decode; native error unchanged |
| aggregates_and_buckets_exact | US-083-AC7 | Decimal amounts; all-null group; empty set; instants across DST in two zones; zone-less instant bucket | S11/S12 results; aggregate ordering with Key tiebreak; build refusal |
| prefix_and_term_filters | US-083-AC8 | Prefixes with `%`, `_`, backslash and empty; term filters with and without a keyword index | Exact binary prefix matches; build refusal without index; term matches under the analyzer |
| snapshot_and_live_pages | US-083-AC9 | Concurrent insert and delete between pages; retention-removed versions; Postgres and Lakebase targets | Exact snapshot coverage; no repeats live; `StaleContinuation`; build refusal |
| privilege_report_sufficient | US-083-AC10 | Role with exactly the report; roles each missing one privilege | Every entry runs; each reduced role fails an entry; script never executed by the SDK |
| async_reads_match_sync | US-083-AC11 | Async Postgres and Lakebase targets; sync and async call sites | Equal statements, parameters and pages; overload types on both checkers |
| schema_neutral_catalog | US-083-AC12 | One catalog; two schemas and roles; unresolved table; `pg_catalog` not first | Each role's own rows; no schema anywhere; `TargetMismatch` |
| verify_cache_for_pools | US-083-AC13 | 50 pooled connections; changed resolution; other database | One resolution query each; cache reuse; full verification on change |
| distinctness_and_joins | US-083-AC14 | Null, equal and different values; required and optional joins; to-many join | Never UNKNOWN; one row per order; null optional columns; build refusal |
| bounded_stream | US-083-AC15 | 2,500 rows; `max_rows=2200`; concurrent insert; call without `max_rows` | First 2,200 rows once; consistent snapshot; type error |
| read_timeouts | US-083-AC16 | Locked table; explicit, default and stream deadlines; target without default | `QueryTimeout` without partial rows; `statement_timeout` applied; `TypeError` |

## Dependencies

US-080 to US-082; CONTRACT-071 (catalog build and runtime rules); CONTRACT-072
(target identity, `verify()`, raw-table adapters, conformance suite); CONTRACT-073
transaction rules where reads share a host transaction; Weft raw-table backends
for PostgreSQL, Lakebase and Spark/Unity Catalog (ADR-004 dependency), and Weft
WR-A10 (aggregates and buckets), WR-A11 (prefix and term filters), WR-A12
(snapshot pages), WR-A13 (null-safe distinctness), WR-A14 (relationship joins) and
WR-B7 (schema-neutral statements). Feature
requirements QC-03, QC-04, QC-05, QC-07 to QC-15; FEAT-030 AT-03; PRD FR-53. TD-083 owns
implementation detail; STP-083 owns the test mapping.

## Out of Scope

Search (US-084), actions and bulk command execution (US-085, US-086), Truss and
Ashlar targets (US-087, US-088), creating connections, tables or migrations,
ad-hoc runtime SQL, and any claim of native support without a recorded witness on
the pinned platform version.
