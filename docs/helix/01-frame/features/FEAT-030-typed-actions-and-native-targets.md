---
ddx:
  id: FEAT-030
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-030 — Typed actions and native execution targets

**Priority:** P0 within this proposed capability; no existing release order changes.
**Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation — typed data access SDK.
**Covered PRD Requirements:** FR-54; supporting FR-43 and NFR-50.

## Overview

This feature covers how typed code changes data and where catalog entries run.
Generated action clients turn CONTRACT-900 action declarations into typed Python
methods with typed outcomes. The `umf_access` runtime defines target protocols
and ships raw-table adapters for Postgres, Lakebase, Unity Catalog and local
Spark/Delta. These adapters run catalog statements on a connection or session the
host already owns. The native SQL action profile (CONTRACT-073) says which action
guarantees hold on each platform and refuses the rest. CONTRACT-072 defines the
runtime and protocols.

## Ideal Future State

A service calls `actions.ship_order(ShipOrderInput(...))` and gets back either a
typed output or a typed failure it can handle. The same generated client works
on Lakebase today and on Truss later (FEAT-031). When a platform cannot keep an
action's promises, the build says so before deployment. Operators keep their own
connections, credentials and migrations; the SDK never creates them.

## Problem Statement

Applications that write directly to tables re-implement checks, lose
precondition and authorization meaning, and leave check-then-act gaps.
Conventional ORMs add identity maps and `save()` paths that bypass engine
protocols and do not exist on Spark. Native platforms also differ: Postgres has
serializable transactions, Unity Catalog has atomic blocks only on some managed
tables, and local Spark/Delta has single-statement atomicity. Without an explicit
profile, a client may claim guarantees a platform does not give. Commit loss is a
further hazard: a retry after an unknown outcome can apply a change twice.

## Functional Areas

| Area | User job | Responsibility |
| --- | --- | --- |
| Invoke | Call an action with typed input | Generated `Actions` client over an `ActionExecutor`; `ReplayingActions` with a required idempotency key over a `ReplayingActionExecutor` |
| Classify | Handle every result honestly | Six typed outcomes plus `ActionRefused` and `ActionFailed`; native errors never become success or empty results |
| Run on raw tables | Use the host's existing database | `PostgresTarget`, `LakebaseTarget`, `UnityCatalogTarget`, `SparkDeltaTarget` |
| Profile | Know which guarantees hold | Per-platform obligations table and build-time refusals |
| Bulk change | Update many rows safely | One atomic, bounded set-based program per command |
| Conform | Prove an adapter behaves | Shared `umf_access.conformance` suite |

## Requirements

- **AT-01:** Generated action clients must come only from CONTRACT-900 action
  declarations. Each action gets typed `Input`, `Output` and `Rejected` types and
  one client method. The method validates and encodes input with CONTRACT-068
  codecs and delegates to an `ActionExecutor`. It never builds SQL.
- **AT-02:** Targets must implement the CONTRACT-072 protocols (`ReadTarget`,
  `ActionExecutor` or `ReplayingActionExecutor`, `BulkTarget`), expose an exact
  identity and pass `verify()` before first use. Every invocation ends in exactly
  one outcome (`Committed`, `Rejected`, `Denied`, `Replayed`, `Conflict` or
  `Indeterminate`), or raises `ActionRefused` before any statement or
  `ActionFailed` after a known rollback. `Indeterminate` is never retried
  automatically.
- **AT-03:** Raw-table targets `postgresql`, `lakebase`, `unity-catalog` and
  `spark-delta` must run catalog statements on a host-owned psycopg 3 connection,
  Databricks SQL connection or Spark session. They pass every value as a native
  bound parameter, apply Weft host obligations, and never create connections,
  pools, sessions, credentials, tables or migrations.
- **AT-04:** Actions on raw tables must follow CONTRACT-073. Each obligation row
  holds as stated for the platform, or the action refuses with
  `NATIVE_PROFILE_UNSUPPORTED`. In 0.1 this profile refuses policy
  authorization, `person-required` attribution on service-principal targets, handler bindings, and
  multi-statement programs on local Spark/Delta. Raw-table targets offer no
  idempotency: they implement `ActionExecutor` only, so type checking rejects
  them for `ReplayingActions`. Role mappings are pinned exactly and never
  inferred. On Postgres and Lakebase, a commit whose acknowledgement is lost is
  reconciled through a host-supplied connection factory when one is given.
- **AT-05:** Bulk commands on raw tables must run as one atomic, set-based
  program, bounded by the command's `maxItems`. `BulkPlan.preview()` is read-only.
  A selection above `maxItems` refuses with no partial effect. CONTRACT-903
  manifests and CONTRACT-904 batching are not used on raw tables in 0.1.
- **AT-06:** Every target adapter must pass the shared `umf_access.conformance`
  suite for the capabilities it claims: identity and verify refusals, carrier
  round trips, read bounds, duplicate-column refusal, outcome classification
  including injected commit loss, and bulk preview/execute agreement.
- **AT-07:** Each generated action method must have a companion
  `validate(input)` that calls `ActionExecutor.validate()` and returns
  `ValidationResult{valid, failures, complete}`. It checks parameters,
  authorization and every precondition, not only the first false one, and changes
  nothing; on raw tables it runs Weft's validate-only program in a transaction
  that always rolls back. `complete` is false when a target can report only the
  first failure. A valid result is advisory. `Committed` must also carry
  `created` and `changed`: the generated Key DTOs of the entities the action
  created and changed.
- **AT-08:** Action clients must be overloaded on the executor type like catalog
  functions: an async executor returns an awaitable of the same outcome, with the
  same classification. In 0.1 the async action executors are
  `AsyncPostgresTarget` and `AsyncLakebaseTarget` over psycopg 3's async
  connection; other targets stay sync only until their drivers' async support is
  qualified.
- **AT-09:** Every action and bulk call must take `timeout: timedelta | None`;
  `None` uses the target's required default. A deadline that expires before the
  commit is sent cancels and rolls back the call, whose outcome is `TimedOut`
  (raised as `ActionTimedOut`): nothing was committed. A deadline that expires
  after the commit is sent is decided as a lost connection: reconciled on Postgres
  and Lakebase, otherwise `Indeterminate`. `Indeterminate` stays the only outcome
  in which a timed-out write may have committed.
- **AT-10:** Changes that must commit together are authored as one action with
  several effects, which runs as one transaction on raw tables under CONTRACT-073.
  The runtime must offer no transaction spanning several action calls.

### Non-Functional Requirements

No native write happens on import, generation or catalog build. Native driver
errors surface unchanged unless CONTRACT-073 classifies them as `Conflict` or
`Indeterminate`. A platform claims action support only after the conformance
suite and native witnesses pass on its pinned version.

## User Stories

- US-085 — Invoke typed actions on raw tables: generated typed clients and
  outcomes, the raw-table adapters, the native profile, the conformance suite and
  commit loss, validation and returned Keys, async invocation on Postgres and
  Lakebase, timeouts, multi-effect actions and per-user connections (AT-01,
  AT-02, AT-03, AT-04, AT-06, AT-07, AT-08, AT-09, AT-10).
- US-086 — Run precompiled bulk commands on raw tables, with timeouts (AT-05,
  AT-09).

Catalog reads on raw tables, including `verify()` drift detection and the Lakebase
unlisted-minor refusal, are US-083 (FEAT-029).

## Edge Cases and Error Handling

- A Postgres or Lakebase connection already inside a transaction refuses an action
  with `TRANSACTION_STATE`.
- Serialization failure, deadlock or a Delta concurrent-modification conflict is
  `Conflict(retained=False)`; nothing is committed.
- A failed in-program role check is `Denied` and raises `ActionDenied`.
- A lost connection or timeout after the commit request is `Indeterminate` on
  Delta targets. On Postgres and Lakebase, if the host supplied a connection
  factory, the adapter checks `pg_xact_status` of the transaction ID captured
  before COMMIT and returns `Committed` or `Conflict`; otherwise `Indeterminate`.
- A postcondition failure, constraint violation or other native error raises
  `ActionFailed` wrapping the native error after rollback.
- Passing a raw-table target to `ReplayingActions` fails type checking, and
  raises `TypeError` at run time.
- A missing role mapping fails the catalog build with `ROLE_MAPPING_MISSING`.
- On Unity Catalog, a multi-statement action needs managed tables with catalog
  commits enabled on qualified compute; otherwise it refuses at build.
- Lakebase applies minor versions automatically. A minor version not listed in
  the target pins makes `verify()` raise `TargetMismatch`.
- An Ashlar target has no `ActionExecutor`, so an action client cannot be built
  for it (FEAT-031).
- A call whose deadline expires before the commit is sent raises
  `ActionTimedOut` with nothing committed; after the commit is sent, the deadline
  is handled like a lost connection.
- A valid `validate()` result reserves nothing; a later `invoke` can still be
  rejected, denied or conflict. `validate()` never commits, even when every check
  passes.

## Success Metrics

Targets, not observed results:

- Each CONTRACT-073 obligation row has native positive and negative witnesses on
  each qualified target.
- Commit-loss injection yields `Indeterminate` unless Postgres/Lakebase
  reconciliation observes the outcome, and never a retry.
- Every raw-table adapter passes the conformance suite on its pinned platform.
- `verify()` detects added, dropped, retyped and identity- or generation-changed
  columns.

## Constraints and Assumptions

Lakebase is qualified per major version (PostgreSQL 16, 17 or 18) plus an
explicit set of observed minor versions, because Lakebase applies minor versions
automatically. Databricks multi-statement transactions need Unity Catalog
managed tables with catalog commits. Action lowering to native statement programs
is a Weft capability; Weft raw-table backends and action lowering are
cross-repository dependencies, not specified here. Authorization mechanisms in
CONTRACT-073 (`pg_has_role`, `is_account_group_member`) are candidates.
Verification checks shape and identity only; it confers no authorization.

## Dependencies

FEAT-028 (action types and codecs), FEAT-029 (catalog entries). CONTRACT-900,
CONTRACT-901 and CONTRACT-902. Proposed CONTRACT-072 and CONTRACT-073. Optional
runtime extras: psycopg 3, the Databricks SQL connector and PySpark with Delta.

## Out of Scope

ORM sessions and change tracking, connection and credential management, schema
migrations, handler bindings, policy authorization, human-subject attribution and
durable idempotency on raw tables, resumable or batched bulk work on raw tables
(it needs a separate control-state design), and Truss or Ashlar execution
(FEAT-031).
