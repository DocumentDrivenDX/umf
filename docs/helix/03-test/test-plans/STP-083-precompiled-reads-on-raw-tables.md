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
| US-083-AC2 | `blocked_forms_fail_build` | A declaration Weft blocks on `spark-delta` only fails with `WEFT_BLOCKED` naming that target and retaining Weft's diagnostics; an unbounded `.all()`, an unsupported sort carrier and `page(size=1001)` each refuse; the output directory is byte-identical afterward. | `@covers US-083-AC2` |
| US-083-AC3 | `injection_stays_a_parameter` | With a recording driver, the statement text equals the catalog variant byte-for-byte and `status` appears only in the parameter list. On each native target with rows whose status is `open` and one whose status is `x' OR 1=1`, the call returns only the latter. An invalid `Decimal` argument raises `ValueError` and the driver records no call. | `@covers US-083-AC3` |
| US-083-AC4 | `unpinned_target_refused` | Targets whose identity differs from the entry only in `backendVersion`, `targetProfile`, `bindingSha256` or `kind` each raise `NotCompiledForTarget`; the recording driver records no statement. | `@covers US-083-AC4` |
| US-083-AC5 | `verify_detects_drift` | On native PostgreSQL 18, after separately adding a column, dropping one, retyping `amount` to `numeric(14,2)`, removing `NOT NULL`, changing identity generation, changing collation, dropping the Key's unique index and recreating the table (new OID), `verify()` raises `TargetMismatch` each time and no catalog statement runs. A Lakebase target pinned to minors {a, b} raises `TargetMismatch` when the server reports minor c. A target that cannot set the obligated search path raises `ObligationUnmet`. Equivalent table-UUID, column and nullability cases run on Spark/Delta and Unity Catalog. | `@covers US-083-AC5` |
| US-083-AC6 | `bounded_keyset_pages` | With 120 matching rows and `size=50`, pages hold 50, 50 and 20 rows ordered by the complete Key ascending; their union equals the matching set with no duplicates. A stream yielding a duplicate or unexpected column raises `TargetMismatch` before decoding. An injected driver error surfaces as the same exception type. | `@covers US-083-AC6` |

## Executable Proof

Planned commands (not implemented):

```sh
python -m pytest python/umf_access/tests/test_catalog_build.py python/umf_access/tests/test_runtime_reads.py
UMF_ACCESS_NATIVE=postgresql python -m pytest python/umf_access/tests/native/test_raw_reads.py python/umf_access/tests/native/test_raw_verify.py
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

### Full continuation qualification

US-083-AC6 additionally requires mixed ASC/DESC, explicit null placement, hidden sort columns excluded from the public projection, and changed filter arguments. Reject a cursor after catalog, entry, variant, ordering, parameter or target changes before dispatch. Hidden values require read authorization. Assert exact-once traversal only on unchanged data; mutable raw tables provide no snapshot guarantee between pages.
