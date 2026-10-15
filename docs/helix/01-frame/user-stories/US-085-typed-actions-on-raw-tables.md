---
ddx:
  id: US-085
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
---

# US-085: Invoke typed actions on raw tables

**Feature:** [[FEAT-030]]. **Feature Requirements:** AT-01, AT-02, AT-03, AT-04, AT-06.
**PRD Requirements:** FR-54. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** to call UMF actions on my own Postgres, Lakebase, Unity Catalog and
Spark/Delta tables through a generated, typed client,
**So that** I change data with the action's declared guarantees, get a typed
outcome I can act on, and never write or assemble SQL myself.

## Context

A UMF action (CONTRACT-900) declares inputs, preconditions, effects,
authorization and attribution. CONTRACT-068 generates one typed method per
action on an `Actions` client that takes a CONTRACT-072 `ActionExecutor`. On raw
tables the executor is a raw-table target (`PostgresTarget`, `LakebaseTarget`,
`UnityCatalogTarget`, `SparkDeltaTarget`) wrapping the host's own connection or
session. The program it runs is a catalog entry that Weft lowered at build time.

Raw tables have no durable replay store, no human-subject authentication and,
on Spark/Delta, no multi-statement transaction. CONTRACT-073 therefore states,
per platform, which CONTRACT-900 obligations hold and which actions must refuse.
This story makes those rules observable to the developer: what commits, what is
reported as a rejection, conflict or unknown commit, and what refuses before any
statement runs. Truss targets are US-087; bulk commands are US-086.

## Walkthrough

1. The maintainer generates the package (US-080) and pins a role mapping for
   each action role in the catalog target configuration.
2. The developer runs the catalog build. Each action compiles through Weft for
   each selected raw-table target, or refuses for that target with a named code.
3. The service opens its own connection, wraps it as a target and calls
   `verify()`.
4. The developer calls `actions.ship_order(ShipOrderInput(...))`. The client
   validates and encodes the input. The target runs the catalog program under
   the platform's transaction rules and returns a typed outcome.
5. The developer handles `ShipOrderRejected`, `ActionDenied`, `ActionConflict`,
   `ActionIndeterminate`, `ActionRefused` and `ActionFailed` explicitly. Nothing
   is retried automatically.

## Acceptance Criteria

- [ ] **US-085-AC1** — Given a generated package and a catalog compiled for a verified `postgresql` or `lakebase` target, when the developer calls a generated action method on an idle connection whose session holds the mapped native role, then pinned pyright and mypy reject wrong input types before run time, the program runs in one `SERIALIZABLE` transaction, and the call returns the typed output with receipt `{store, epoch:"pg", version}` naming the committing transaction.
- [ ] **US-085-AC2** — Given a raw-table action whose precondition evaluates false, or a session that lacks the mapped native role, when the developer invokes it, then the transaction rolls back with no change; a false precondition raises `<Action>Rejected` carrying the first failing declared code, and a failed role check raises `ActionDenied` rather than a rejection, a native error or an empty result.
- [ ] **US-085-AC3** — Given two concurrent invocations that write-skew on `postgresql`/`lakebase`, or a Delta concurrent-modification conflict on `unity-catalog`, when the losing invocation reaches commit, then it raises `ActionConflict`, nothing from it is committed, and the runtime does not retry it.
- [ ] **US-085-AC4** — Given a fault-injected host connection that is lost after the commit request is sent, when the developer invokes an action, then on `unity-catalog` and `spark-delta`, and on `postgresql`/`lakebase` targets without a host reconnection factory or whose transaction status cannot be determined, the call raises `ActionIndeterminate` and never returns `Committed`; on `postgresql`/`lakebase` with a reconnection factory, the adapter checks `pg_xact_status` of the transaction ID captured before COMMIT and returns `Committed` with that ID as receipt version or raises `ActionConflict` with `retained=False`, matching an independent observation of whether the commit landed; nothing is retried automatically.
- [ ] **US-085-AC5** — Given actions that need policy authorization, `person-required` attribution on a `service`-principal target, a handler binding, an unmapped role, or more than one effect on `spark-delta`, when the catalog build runs, then each refuses only for the affected target with `NATIVE_PROFILE_UNSUPPORTED` or `ROLE_MAPPING_MISSING`, no executable entry is written for it, and calling it on that target raises `ActionRefused` with the recorded code without sending a statement.
- [ ] **US-085-AC6** — Given a compiled raw-table action, when the developer passes a raw-table target to `ReplayingActions` (the only client that takes an idempotency key) or invokes the action on a connection already inside a transaction, then pinned pyright and mypy reject the `ReplayingActions` construction and at run time it raises `TypeError`, the transaction case raises `ActionRefused` with `TRANSACTION_STATE`, no statement is sent, and the host transaction is left untouched.
- [ ] **US-085-AC7** — Given a multi-statement action on a verified `unity-catalog` target, when every table it touches is a managed table with catalog commits enabled, then it runs as one `BEGIN ATOMIC ... END` block and returns receipt `{store: table UUIDs, epoch:"delta", version: committed table versions}` from the native commit result; when any touched table lacks catalog commits, the action refuses at build or `verify()` and never runs as separate statements.

## Edge Cases

- A target whose commit result does not expose committed versions is
  unqualified for actions; it refuses rather than returning a receipt without
  versions.
- A postcondition that is false or errors rolls back and raises `ActionFailed`
  wrapping the native error, not `Rejected`.
- A Key-uniqueness create on `postgresql`/`lakebase` requires an installed
  unique constraint observed by `verify()`; without it the action refuses.
- `spark-delta` authorization refuses unless the host's pinned configuration
  declares the target single-tenant administrative.
- Role mappings are exact. A role whose name merely matches a native role is
  not mapped.
- A failed invocation never becomes an empty or successful result.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| raw_action_commits_serializable | US-085-AC1 | Verified Postgres and Lakebase targets; mapped role; valid typed input; static corpus | Static errors for bad input; one SERIALIZABLE transaction; typed output and `pg` receipt |
| raw_action_rejects_and_denies_without_change | US-085-AC2 | Precondition false; session without mapped role | `<Action>Rejected` with declared code; `ActionDenied` for role failure; no row changed |
| raw_action_conflict_rolls_back | US-085-AC3 | Barrier-synchronized write skew; concurrent Delta writer | `ActionConflict`; loser committed nothing; one attempt only |
| raw_action_commit_loss_is_indeterminate | US-085-AC4 | Connection dropped after COMMIT is sent, with and without a reconnection factory | `ActionIndeterminate` without reconciliation; reconciled `Committed` or `ActionConflict` matching the independent outcome; no retry |
| raw_action_unsupported_refuses_at_build | US-085-AC5 | Policy, person-required (service-principal target), handler, unmapped-role and two-effect spark-delta actions | Named refusal per target; no entry; runtime raises refusal without statements |
| raw_action_runtime_preconditions_refuse | US-085-AC6 | Raw-table target passed to `ReplayingActions`; connection mid-transaction | Checker error and `TypeError`; `ActionRefused` with `TRANSACTION_STATE`; no statement sent |
| uc_action_atomic_block_and_receipt | US-085-AC7 | Managed tables with and without catalog commits | `BEGIN ATOMIC` with delta receipt; refusal when commits are not enabled |

## Dependencies

US-080, US-081 and US-083 (generated package, codecs, catalog build and target
`verify()`); CONTRACT-068, CONTRACT-071, CONTRACT-072, CONTRACT-073,
CONTRACT-900 and CONTRACT-901. Weft lowering of `graph-write/1` actions to native
statement programs (dependency W-4 in the build handoff; Weft WR-B4). A pinned Postgres
server, a Lakebase endpoint, a local Spark/Delta runtime and a separately selected
Unity Catalog workspace. Feature requirements: AT-01, AT-02, AT-03, AT-04, AT-06;
PRD FR-54. TD-085 owns implementation detail; STP-085 owns the test mapping.

## Out of Scope

Idempotent replay, policy authorization, human attribution and handler actions
on raw tables (they refuse here and may run on Truss, US-087). Bulk commands
(US-086). Creating connections, roles, grants, tables or migrations. Any claim
of native support before the conformance suite and native witnesses pass on the
pinned platform version.
