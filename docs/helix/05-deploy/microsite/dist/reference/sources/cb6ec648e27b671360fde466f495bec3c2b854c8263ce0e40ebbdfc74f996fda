# Typed reporting implementation — 2026-10-15

The first scoped PostgreSQL 18 implementation is delivered locally. The SDK foundation was recovered from archived checkout `39bf/umf`, snapshot `8c9d0fb6`; the current specifications are in `20bc/umf`. Weft changes are in `/Users/erik/Projects/weft`. Existing unrelated work in that checkout is preserved.

## Implemented behavior

- Generated declared to-one relationship walks, inner/left joins, joined-column filters/order, named cross-record projections and keyset pages. Three relationship edges maximum; excess joins refuse during capture/build. The DSL refuses repeated/self owners until an alias API exists. Reviewed SQL supports explicit aliases, including repeated targets, subject to the same three-edge bound and declared relationship checks.
- Reviewed fixed SQL is compiled by the actual Weft Rust backend (`raw-postgresql-reads` feature), exposed through Python and WASM entry points. The compiler validates the pinned core 0.8 source, table/field/key identities and declared relationship endpoints. Every target uses one app schema. WR-B7 is schema-neutral binding; WR-A14 is relationship join lowering.
- `count`, `sum`, `avg`, `min`, `max`, multiple group keys and HAVING comparisons are admitted in reviewed SQL. Decimal results use `Decimal`, never float. Integer sums use an exact numeric result carrier. Reviewed AVG retains PostgreSQL numeric semantics; this does not implement the proposed native DSL's explicit-scale, half-even AVG contract.
- Runtime uses only the host's supplied idle connection. It opens a read-only transaction, preserves the caller role, refuses superuser/BYPASSRLS and owner bypass, validates native base tables/columns/unique keys and exact search-path resolution, and executes catalog text with bound values. Compiled access-share locks stabilize table identities. No app-schema functions, views or triggers are required.
- A per-call deadline sets each statement's remaining timeout; cancellation returns typed `TimedOut`, with rollback and a reusable caller connection. Returned rows are capped at 1–1,000. Joined keyset continuations preserve null ordering and bind to catalog, parameters, role, schema and native table identities. Pages are live reads, without a snapshot guarantee.

## Qualification

Python 3.11.17; Pydantic 2.14.1; mypy 2.4.0; pyright 1.1.414; ty 0.0.88; PostgreSQL 18.6 (Homebrew); Bun 1.4.2; Rust 1.90.0; sqlparser 0.63.0. Exact source hashes, logs and observed browser version are retained alongside this record.

- All three checkers accept the complete generated commerce package, including action types and join projections, plus positive query examples. Generated files contain no checker suppressions. Each checker rejects all 12 selected prior misuse cases and seven new join/aggregate parameter/result misuse cases. SQL expression misuse, such as summing text, is refused by Weft at build time; static Python checking does not parse reviewed SQL strings.
- Five Weft compiler tests pass. Fourteen read tests pass on Python 3.11 using the installed SDK and native Weft wheels and PostgreSQL: actual generated package → capture → Weft → catalog → caller connection; distinct caller-role totals; hidden left-join targets; inner joins; bound injection strings; nullable keyset order/directions; schema/principal continuation refusal; and timeout recovery.
- Seven generated-model/action/projection tests and 40 DSL tests pass on Python 3.11. The restored compilation suite passed 841 tests before the final relationship-docstring change; the final generator replay is recorded separately. Dependency boundary checks pass.
- The WASM target compiles. Chromium parity compares complete generated package bytes against Bun for admitted joins and refused inputs. This is generator/browser evidence, not browser database execution.

US-081-AC9's full-package typing scope includes the added joins. These observations qualify its tested package/profile; they do not close unrelated SDK acceptance criteria or declare a release.

## Limits

The raw read profile currently admits scalar integer, decimal, string and boolean carriers, explicit projections, declared to-one equijoins and a closed read-only SELECT grammar. Unsupported carriers, arbitrary functions, windows, subqueries, set operations, ad-hoc runtime SQL and unsupported syntax refuse at build time. Native aggregate DSL, HAVING cost guarantees, async/streaming APIs and snapshot paging remain outside this delivered slice. Left-joined projection fields are nullable; the DSL conservatively keeps joined fields nullable for inner joins too.

Lakebase 18 compilation passes through the same PostgreSQL backend. Native Lakebase service execution remains unverified because no endpoint was available. Older PostgreSQL evidence is not substituted. No service qualification date is invented.

Catalog files are trusted, reviewed application artifacts. Their hashes detect drift and bind continuations; they are not signatures or execution credentials. Hosts own pool selection, per-user connection ownership, app-schema selection, grants and policy deployment.

## Reproduce

Build Weft with `maturin build --manifest-path crates/weft-python/Cargo.toml --features raw-postgresql-reads`, install its wheel and the pinned SDK dependencies in an isolated Python environment, then run:

```sh
python scripts/verify-access-reporting-types.py --environment /path/to/environment --work-dir /private/tmp/reporting-check
PYTHONPATH=python/umf_access/src:/private/tmp/reporting-check/generated python -m unittest discover -s python/umf_access/tests -p test_reviewed_reads.py
bun scripts/check-access-reporting-browser.ts /private/tmp/reporting-browser
```

Native tests additionally require `UMF_PG_TEST_DSN` pointing to an isolated test cluster and `UMF_GENERATED_REPORTING_PACKAGE=1`. They create test schemas, roles, policies and data; use a dedicated cluster. Alternatively, `UMF_WEFT_RAW_COMPILER` may name Weft's `compile_raw_read` example executable. The tests exercise the same Rust compiler through either transport.
