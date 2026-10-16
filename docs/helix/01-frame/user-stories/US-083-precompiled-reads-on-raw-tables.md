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

**Feature:** [[FEAT-029]]. **Feature Requirements:** QC-03, QC-04, QC-05; FEAT-030 AT-03 for raw-table targets.
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
- [ ] **US-083-AC2** — Given a declaration that type-checks but that Weft blocks on at least one configured target, an unbounded read, an ordering form unavailable on a selected Weft backend, or a page size above 1,000, when I run `umf-access catalog`, then the build fails with `WEFT_BLOCKED` (Weft's diagnostics retained) or the matching bound refusal, and no catalog or `queries.py` is written.
- [ ] **US-083-AC3** — Given a verified raw-table target and the argument `status="x' OR 1=1"`, when I call `customer_orders`, then the statement text sent to the driver is byte-identical to the catalog variant for the present arguments, the argument reaches the driver only as a bound parameter, the result contains only rows whose status equals that literal string, and an argument that fails codec validation raises before any statement is sent.
- [ ] **US-083-AC4** — Given a target whose identity differs from every catalog entry's pins in backend version, target profile, binding digest or kind, when I call any generated query, then it raises `NotCompiledForTarget` before any statement is sent.
- [ ] **US-083-AC5** — Given a target whose server version, relation identity (OID or table UUID), column set, column type or typmod, nullability, identity or generation, collation, or required unique Key index differs from its pins, or a Lakebase target reporting a minor version not listed in its pins, when `verify()` runs, then it raises `TargetMismatch` and no catalog statement runs; and a host obligation the target cannot apply raises `ObligationUnmet`.
- [ ] **US-083-AC6** — Given a table with more rows than one page, when I page through `customer_orders` with `size=50` following each `next_after` continuation, then every page has at most 50 rows ordered by the complete Key ascending, the pages together return each matching row exactly once, a result stream with a duplicate or unexpected column raises `TargetMismatch` before any row is decoded, and a native driver error is re-raised unchanged rather than returned as an empty page.

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

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| catalog_builds_and_drift_checks | US-083-AC1 | Admitted declarations; four targets; then one changed byte | Complete entries and typed functions; `--check` zero then non-zero |
| blocked_forms_fail_build | US-083-AC2 | Weft-blocked form on one target; unbounded; Weft-blocked ordering form; size 1,001 | `WEFT_BLOCKED` or bound refusal; nothing written |
| injection_stays_a_parameter | US-083-AC3 | `status="x' OR 1=1"`; invalid decimal argument | Catalog text unchanged; bound value; no extra rows; pre-send refusal |
| unpinned_target_refused | US-083-AC4 | Identity differing in each pinned member | `NotCompiledForTarget`; no statement |
| verify_detects_drift | US-083-AC5 | Each shape and version change; unlisted Lakebase minor; unmet obligation | `TargetMismatch` or `ObligationUnmet`; no statement |
| bounded_keyset_pages | US-083-AC6 | 120 matching rows; duplicate-column stream; injected driver error | Exact keyset coverage; refusal before decode; native error unchanged |

## Dependencies

US-080 to US-082; CONTRACT-071 (catalog build and runtime rules); CONTRACT-072
(target identity, `verify()`, raw-table adapters, conformance suite); CONTRACT-073
transaction rules where reads share a host transaction; Weft raw-table backends
for PostgreSQL, Lakebase and Spark/Unity Catalog (ADR-004 dependency). Feature
requirements QC-03, QC-04, QC-05; FEAT-030 AT-03; PRD FR-53. TD-083 owns
implementation detail; STP-083 owns the test mapping.

## Out of Scope

Search (US-084), actions and bulk command execution (US-085, US-086), Truss and
Ashlar targets (US-087, US-088), creating connections, tables or migrations,
ad-hoc runtime SQL, and any claim of native support without a recorded witness on
the pinned platform version.
