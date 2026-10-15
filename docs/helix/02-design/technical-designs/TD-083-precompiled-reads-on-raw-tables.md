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
2. Checks the target has passed `verify()` since its last reconnect.
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
another identity raises `StaleContinuation` before any statement.

## Component Changes

Planned new paths:

- `python/umf_access/src/umf_access/build/catalog.py` — Weft calls, build checks, catalog and `queries.py` emission.
- `python/umf_access/src/umf_access/runtime/reads.py` — entry lookup, variant selection, binding, decoding, `Page`.
- `python/umf_access/src/umf_access/targets/postgres.py` — `PostgresTarget`, `LakebaseTarget`.
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

## Security

- Only catalog statement text reaches a driver; arguments are bound natively.
- Codec validation runs before binding, so malformed values never reach SQL.
- Pin matching and `verify()` run before any statement and after reconnect.
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
