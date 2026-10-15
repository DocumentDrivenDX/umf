---
ddx:
  id: TD-083
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-083
      kind: informed_by
    - id: SD-029
      kind: informed_by
---

# TD-083: Compile and run precompiled reads on raw tables

**User Story:** [[US-083-precompiled-reads-on-raw-tables]]. **Feature:** [[FEAT-029]].
**Solution Design:** [[SD-029]].

## Scope

Weft compilation inside `umf-access catalog`, the catalog file and generated
`queries.py`, runtime variant selection and binding, target identity and
`verify()`, and the four raw-table read adapters. Capture is TD-082; bulk
commands and actions are US-085/US-086; search is TD-084. CONTRACT-071 and
CONTRACT-072 are authoritative.

## Technical Approach

**Build.** For each captured declaration, presence variant and configured target,
the tool renders the expression tree to canonical Weft SQL text, then calls the
pinned Weft Python binding with that text, the pinned UMF documents and the
target's binding source. The tool records Weft's response verbatim: statement
text, parameter carriers, ordered output descriptors, host obligations and the
structural digest. It adds the build-side checks Weft does not own: every read is
bounded, ordering is the complete unique Key ascending, and page and limit sizes
are at most 1,000. Any blocked response or failed check stops the build before
anything is written. Output goes through the same staging, swap and drift-check
writer as TD-080, limited to the stage-two reserved paths and their catalog manifest.

**Generated functions.** `queries.py` contains one function per declaration with
exact keyword parameters and return type. Each function is a thin call into
`umf_access.runtime.run_read(entry_name, target, arguments)`; it contains no SQL.

**Runtime.** `run_read`:

1. Looks up the entry whose pins equal `target.identity()`; if none,
   raises `NotCompiledForTarget`.
2. Checks the target has passed `verify()` for this connection, directly or
   through the verification cache.
3. Selects the variant from which optional arguments are not `MISSING`.
4. Validates and encodes every argument with the generated codecs into
   `BoundParams`; any failure raises before the target is called.
5. Calls `target.execute_read(variant, params)`, checks the column inventory
   against the variant's outputs, and decodes rows with generated codecs.

**Adapters.** Each raw-table adapter applies the variant's host obligations, then
executes the variant's statement text with the driver's native parameter binding
(psycopg 3 server-side parameters; Databricks SQL connector named parameters;
Spark `spark.sql(text, args=...)`). No adapter formats values into text.
`verify()` queries the catalogs listed in CONTRACT-072 (`pg_attribute`,
`pg_class`, `pg_index`, `server_version_num`; Delta and Unity Catalog table
metadata and table UUID) and compares them with the binding and CONTRACT-070
ColumnSets. Lakebase targets carry a major version plus an explicit set of
qualified minors.

**Pages.** `.page(size, after)` is Weft's `entity-page` profile: a keyset page on
the complete unique Key. The adapter streams at most `size` rows; the runtime
builds `Page[R, K]` whose `next_after` is a `Continuation[K]` holding the last Key
and the target identity digest (CONTRACT-072). A continuation from a target with
another identity raises `StaleContinuation` before any statement. Pages are live
by default. With `snapshot=True` (QC-09, Weft WR-A12) the first page records the
table versions Weft pins with `VERSION AS OF` in the continuation, and later pages
bind them; the build refuses snapshot declarations for `postgresql` and
`lakebase`, and a version the platform can no longer read raises
`StaleContinuation` (US-083-AC9).

**Aggregates and buckets.** Grouped declarations (QC-07) compile through Weft
WR-A10 under S11 and S12. The build adds two checks: a `date_bucket` of an
instant must carry a `zone`, and ordering of groups ends with the complete group
key. Decoded aggregates use the output carriers Weft reports, so exact sums and
scaled averages reach Python as `int` or `Decimal`, and an approximate distinct
count keeps its approximate label (US-083-AC7).

**Prefix and term filters.** `starts_with` lowers through Weft WR-A11 to a
binary prefix test that never interprets `%`, `_` or backslash in the bound
argument. Before calling Weft for a term filter, the build checks that the Field
has a CONTRACT-074 keyword index bound for the target and refuses that target
otherwise (US-083-AC8).

**Privilege report.** After every entry compiles, the build writes
`_umf/privileges.json` from each entry's compiled statement: tables and columns
read or written, operations, functions called (including role checks) and search
indexes, plus a proposed grant script per target. It goes through the same writer
and drift check as the catalog. The runtime never reads or executes it
(US-083-AC10).

**Async reads.** `queries.py` functions carry two overloads, one for
`ReadTarget` and one for `AsyncReadTarget`, over the same `run_read` steps.
`AsyncPostgresTarget` and `AsyncLakebaseTarget` wrap a host-owned psycopg 3
`AsyncConnection` and share identity, `verify()` and binding code with the sync
adapters (US-083-AC11).

**Schema-neutral targets and the verification cache (QC-12).** With
`schemaBinding: "search-path"` the build asks Weft WR-B7 for unqualified table
names and `pg_catalog`-qualified system objects, and records Weft's search-path
host obligation in each entry. `verify()` adds two checks: each referenced table
resolves through the session's `search_path` to exactly one relation, and
`pg_catalog` is searched first; either failure raises `TargetMismatch`
(US-083-AC12). Results go into a per-process cache keyed by target identity,
database identity (system identifier and database name) and the resolved schema of
every referenced table. On first use of a new connection object the runtime runs
one catalog query to read the database identity and resolved schemas; a matching
key reuses the cached verification, and any difference triggers a full
`verify()` (US-083-AC13). Hosts may verify eagerly at pool creation and may set a
cache lifetime.

**Distinctness and joins (QC-13).** `is_distinct_from` and joins render to Weft
SQL and compile through WR-A13 and WR-A14 like other predicates. The build refuses
a join along a to-many relationship or more than four joins before calling Weft;
decoders use Weft's output descriptors, which name each column's Record and Field,
so left-joined columns decode to `None` when there is no target row
(US-083-AC14).

**Streams (QC-14).** For each `.page(...)` declaration `queries.py` also emits
`<name>_stream(target, ..., max_rows, page_size=None, timeout=None)`, a generator
over the same catalog variant. On Postgres and Lakebase it opens one
`REPEATABLE READ READ ONLY` transaction on the host connection and runs every
page in it; on Delta targets it uses snapshot pages. It stops at `max_rows` or the end of
the result (US-083-AC15).

**Timeouts (QC-15).** Every generated read and stream takes a keyword-only
`timeout`; `None` uses the target's `default_timeout`, a required constructor
argument. On Postgres and Lakebase the adapter runs `SET LOCAL statement_timeout`
inside the read's transaction (opening a short read-only transaction when the host
has none); Databricks and Spark use the driver's timeout and cancellation. A
client-side deadline backs both. Expiry raises `QueryTimeout` and discards any
partial page; for streams the deadline applies per page (US-083-AC16).

## Component Changes

Planned new paths:

- `python/umf_access/src/umf_access/build/catalog.py` — Weft calls, build checks, catalog and `queries.py` emission.
- `python/umf_access/src/umf_access/runtime/reads.py` — entry lookup, variant selection, binding, decoding, `Page`, streams and read deadlines.
- `python/umf_access/src/umf_access/runtime/verify_cache.py` — per-process verification cache and per-connection resolution check.
- `python/umf_access/src/umf_access/build/privileges.py` — privilege report and per-target grant scripts.
- `python/umf_access/src/umf_access/targets/postgres.py` — `PostgresTarget`, `LakebaseTarget`, `AsyncPostgresTarget`, `AsyncLakebaseTarget`.
- `python/umf_access/src/umf_access/targets/databricks.py` — `UnityCatalogTarget`.
- `python/umf_access/src/umf_access/targets/spark.py` — `SparkDeltaTarget`.
- `python/umf_access/src/umf_access/conformance/` — reusable read conformance tests (CONTRACT-072).

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `umf-access catalog`, `catalog.json`, `queries.py` | CONTRACT-071 | Build, entries, typed call sites |
| `TargetIdentity`, `verify()`, `ReadTarget`, `RowStream` | CONTRACT-072 | Pin matching, drift detection, execution |
| Weft read profiles and raw-table backends | Weft (external) | Statement text, carriers, decoders, obligations |
| Codecs | CONTRACT-068 | Argument validation and row decoding |

## Data Model Changes

None to UMF or databases. `catalog.json` is a new checked-in file per consumer
package.

## Integration Points

Weft's Python binding is used only at build time (`umf_access[build]`). Drivers
come from the `postgresql`, `databricks` and `spark` extras. Weft raw-table
backends for these platforms are an ADR-004 dependency; until Weft admits a
target, builds for it fail with `WEFT_BLOCKED`, which is the expected outcome.
Aggregates and buckets need Weft WR-A10, prefix and term filters WR-A11, and
snapshot pages WR-A12; declarations using them fail with `WEFT_BLOCKED` until the
matching requirement lands. Null-safe distinctness needs WR-A13, joins WR-A14
and schema-neutral statements WR-B7. Async adapters use psycopg 3's async
connection from the `postgresql` extra.

## Security

- Only catalog statement text reaches a driver; arguments are bound natively.
- Codec validation runs before binding, so malformed values never reach SQL.
- Pin matching and `verify()` run before any statement on each new connection;
  a cached verification is reused only when its key matches.
- Adapters never create connections, credentials, tables or migrations, and never
  convert native errors into empty results.
- `verify()` checks shape only; authorization stays with the platform.

## Testing

| AC ID | Planned test | Design assertion | Location |
| --- | --- | --- | --- |
| US-083-AC1 | `catalog_builds_and_drift_checks` | Complete entries and variants per target; typed `queries.py`; `--check` exit codes | `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC2 | `blocked_forms_fail_build` | `WEFT_BLOCKED` with retained diagnostics; bound refusals; output directory unchanged | `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC3 | `injection_stays_a_parameter` | Recording driver shows catalog text and bound value; native witness returns only literal matches; codec refusal before send | `python/umf_access/tests/test_runtime_reads.py`, `python/umf_access/tests/native/test_raw_reads.py` |
| US-083-AC4 | `unpinned_target_refused` | Each pin mismatch raises `NotCompiledForTarget`; driver never called | `python/umf_access/tests/test_runtime_reads.py` |
| US-083-AC5 | `verify_detects_drift` | Each drift class and unlisted Lakebase minor raises `TargetMismatch`; unmet obligation raises `ObligationUnmet` | `python/umf_access/tests/native/test_raw_verify.py` |
| US-083-AC6 | `bounded_keyset_pages` | Page size, order and exact coverage; duplicate-column refusal; driver error passes through | `python/umf_access/tests/native/test_raw_reads.py`, `python/umf_access/conformance/` |
| US-083-AC7 | `aggregates_and_buckets_exact` | S11/S12 results against independently computed expectations; half-even tie; all-null and empty groups; zone buckets across DST; group ordering; zone-less build refusal (Weft WR-A10) | `python/umf_access/tests/native/test_raw_aggregates.py`, `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC8 | `prefix_and_term_filters` | Exact binary prefix matches for `%`, `_`, backslash and empty prefixes; no pattern built from the argument; term-filter build refusal without a keyword index and analyzer-exact matches with one (Weft WR-A11) | `python/umf_access/tests/native/test_raw_filters.py`, `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC9 | `snapshot_and_live_pages` | Snapshot coverage under concurrent writes; versions in the continuation; no repeats on live pages; `StaleContinuation` after retention; build refusal on Postgres and Lakebase (Weft WR-A12) | `python/umf_access/tests/native/test_raw_snapshot_pages.py`, `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC10 | `privilege_report_sufficient` | Role with exactly the report runs every entry; each one-privilege-removed role fails an entry with `42501`; report contents; no runtime execution of the script | `python/umf_access/tests/native/test_privilege_report.py` |
| US-083-AC11 | `async_reads_match_sync` | Async and sync targets send equal statements and parameters and return equal pages; overload types on both checkers | `python/umf_access/tests/native/test_async_reads.py`, `tests/compilation/python/static/queries/` |
| US-083-AC12 | `schema_neutral_catalog` | One catalog under two roles returns each schema's rows; no schema in statements, catalog, generated code or call sites; `pg_catalog`-qualified system functions; `TargetMismatch` for unresolved tables and `pg_catalog` not first (Weft WR-B7) | `python/umf_access/tests/native/test_schema_neutral.py` |
| US-083-AC13 | `verify_cache_for_pools` | One resolution query per new pooled connection; cached verification reused; full verification on changed resolution or database identity | `python/umf_access/tests/native/test_schema_neutral.py`, `python/umf_access/tests/test_verify_cache.py` |
| US-083-AC14 | `distinctness_and_joins` | Never-UNKNOWN distinctness for null and present values; one row per source row; null left-join columns; to-many join build refusal (Weft WR-A13, WR-A14) | `python/umf_access/tests/native/test_raw_filters.py`, `python/umf_access/tests/native/test_raw_joins.py`, `python/umf_access/tests/test_catalog_build.py` |
| US-083-AC15 | `bounded_stream` | First `max_rows` rows once in Key order; pages of at most 1,000; one `REPEATABLE READ READ ONLY` transaction hides the concurrent insert; missing `max_rows` is a static error | `python/umf_access/tests/native/test_raw_streams.py`, `tests/compilation/python/static/queries/negative/` |
| US-083-AC16 | `read_timeouts` | Explicit, default and per-page stream deadlines raise `QueryTimeout` with no partial rows; `statement_timeout` observed on the server; target without default raises `TypeError` | `python/umf_access/tests/native/test_raw_timeouts.py` |

STP-083 is the authoritative mapping. All tests are planned and UNTESTED.

## Migration & Rollback

A catalog is tied to exact Weft, backend, binding and UMF pins; changing any of
them means rebuilding, and entries never upgrade in place. Rolling back reverts the
consumer's package directory and pins. A schema change in the database causes
`verify()` to refuse until the binding, ColumnSets and catalog are updated.

## Implementation Sequence

1. Recording fake target and red tests for AC1–AC4 against a stub Weft response.
2. Integrate the pinned Weft binding; implement build checks and emission.
3. Implement runtime selection, binding and decoding.
4. Implement `PostgresTarget` and `verify()`; run native witnesses on PostgreSQL 18.
5. Add Lakebase, Unity Catalog and Spark/Delta adapters as Weft admits each.

## Risks

| Risk | Mitigation |
| --- | --- |
| Weft raw-table backends are not yet available | Builds fail with `WEFT_BLOCKED`; no target is claimed until Weft admits it |
| Lakebase minor upgrades break running services | `verify()` refuses unlisted minors; requalification is an explicit pin change |
| Exact identity equality conflicts with a set of qualified minors | Contract clarification requested; this design matches minors by set membership |
| Managed endpoints are unavailable to CI | Native lanes report not-run; local fakes never count as native witnesses |
