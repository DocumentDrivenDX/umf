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

**Feature:** [[FEAT-030]]. **Feature Requirements:** AT-01, AT-02, AT-03, AT-04, AT-06, AT-07, AT-08, AT-09, AT-10.
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

Before invoking, a developer can call `validate(input)` to learn every failing
precondition at once without changing anything. A commit returns the Keys of the
entities the action created and changed. On Postgres and Lakebase the same
client also runs on async targets. Every call takes a timeout, and a call that
times out before its commit is sent has committed nothing. Related changes, such
as a note and its reminder, commit together only as one action with several
effects. A host with per-user connection pools declares its targets
`sessionPrincipal: human`, so `person-required` actions run there.

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

- [ ] **US-085-AC1** — Given a generated package and a catalog compiled for an admitted `postgresql` or `lakebase` target, when the developer invokes an action on an idle qualified human-session connection with the mapped role, then all three pinned checkers reject wrong inputs, the program runs in one `SERIALIZABLE` transaction, and the result retains the required effect/no-op verification plus typed output and a string-valued `{store, epoch, version}` receipt bound to the original store/incarnation and committing xid under CONTRACT-073.
- [ ] **US-085-AC2** — Given a raw-table action whose precondition evaluates false, or a session that lacks the mapped native role, when the developer invokes it, then the transaction rolls back with no change; a false precondition raises `<Action>Rejected` carrying the first failing declared code, and a failed role check raises `ActionDenied` rather than a rejection, a native error or an empty result.
- [ ] **US-085-AC3** — Given two concurrent invocations that write-skew on `postgresql`/`lakebase`, or a Delta concurrent-modification conflict on `unity-catalog`, when the losing invocation reaches commit, then it raises `ActionConflict`, nothing from it is committed, and the runtime does not retry it.
- [ ] **US-085-AC4** — Given commit acknowledgement loss on raw targets, when an action is invoked, then Delta and Postgres/Lakebase without qualified reconciliation raise `ActionIndeterminate`; Postgres/Lakebase first verifies original writer/store/incarnation continuity and then checks the captured xid, returning the complete retained `Committed` result for committed status or `ActionFailed("ABORTED_CAUSE_UNKNOWN", cause)` for positively observed abort without deadline expiry. Wrong/restored/diverged targets, unavailable continuity, missing result custody, `NULL`, unresolved status and failed reconnection remain indeterminate. Generic abort never becomes `ActionConflict`; no program is resubmitted.
- [ ] **US-085-AC5** — Given actions needing policy authorization, `person-required` on a service target, `umf.actions.roles/1` on a service target even with native-session attribution, an unqualified role profile, a handler, an unmapped role or a multi-statement Spark/Delta program, when the catalog builds, then each affected target has only a refusal entry with `NATIVE_PROFILE_UNSUPPORTED` or `ROLE_MAPPING_MISSING`; invocation raises its recorded refusal before a statement. Administrative-single-tenant mode never waives profile semantics.
- [ ] **US-085-AC6** — Given a compiled raw-table action, when the developer passes a raw-table target to `ReplayingActions` (the only client that takes an idempotency key) or invokes the action on a connection already inside a transaction, then pinned pyright, mypy and ty reject the `ReplayingActions` construction and at run time it raises `TypeError`, the transaction case raises `ActionRefused` with `TRANSACTION_STATE`, no statement is sent, and the host transaction is left untouched.
- [ ] **US-085-AC7** — Given a multi-statement action on a qualified Unity Catalog target, when every referenced table has the required catalog commits and admission closure, then one `BEGIN ATOMIC` block returns the exact commit-specific table UUID/version vector encoded into the string-valued native receipt defined by CONTRACT-073. Missing catalog commits or exact commit attribution refuses qualification; a later history head is never substituted.
- [ ] **US-085-AC8** — Given a Weft build admitting the WR-B4 validate-only program and a verified `postgresql` or `lakebase` target, when the developer calls `actions.ship_order.validate(input)` with an input that makes two declared preconditions false, and again with a valid input, then the first call returns `valid=False` and `complete=True` with both declared failure codes in `failures` rather than only the first, the second returns `valid=True` with no failures, each runs in a transaction that rolls back, and an independent read shows no change after either call.
- [ ] **US-085-AC9** — Given a Weft build whose WR-B4 program returns created and changed Keys, when an action that creates a `Shipment` and changes its `Order` commits on a verified `postgresql` or `lakebase` target, then `Committed.created` holds exactly the new `ShipmentKey` and `Committed.changed` exactly the `OrderKey`, both equal to the Keys found by an independent read, and pinned pyright, mypy and ty type both as tuples of the action's generated Key DTOs.
- [ ] **US-085-AC10** — Given verified `AsyncPostgresTarget` and `AsyncLakebaseTarget` over psycopg 3 async connections, when the developer awaits the same generated action method and its `validate()` on the commit, rejection, denial and conflict fixtures, then each outcome, raised failure, receipt and validation result equals the sync target's on the same fixtures, the program runs in one `SERIALIZABLE` transaction, and pinned pyright, mypy and ty type the async call as an awaitable of the sync result type.
- [ ] **US-085-AC11** — Given sync or async calls with a deadline before or during commit, when cancellation or disconnect occurs, then `ActionTimedOut` is returned only after positive original noncommit, including a qualified aborted xid with recorded deadline expiry. A confirmed committed result returns the retained success; unresolved cancellation/rollback/commit, including a precommit disconnect whose settlement is unknown, raises `ActionIndeterminate`. Tests independently observe termination and effects, ensure uncertain connections cannot return to the pool, and find no retry.
- [ ] **US-085-AC12** — Given an `addNoteWithReminder` action whose recipe creates a `Note` and a `Reminder`, when it commits on a verified `postgresql` or `lakebase` target, and again when its second effect violates a constraint, then the commit makes both rows visible in one transaction with both Keys in `Committed.created`, the failure raises `ActionFailed` with neither row present, and neither the generated clients nor the public `umf_access` surface offer a way to begin, join or commit a transaction spanning several action calls.
- [ ] **US-085-AC13** — Given a person-required action with roles/1 on a qualified human target, when two separately authenticated per-user connections invoke it, including a session that changes effective role, then each result retains the original human/session identity and effective execution identity separately (`session_user` and `current_user` on Postgres/Lakebase), and role membership is checked for the authenticated human under the qualified admission boundary. A principal label alone never supplies the binding.

- [ ] **US-085-AC14** — Given an undeclared cascade, trigger write, unknown executable dependency or a dependency replacement racing action admission, when the action runs, then missing/mismatched closure refuses before business dispatch with `NATIVE_ADMISSION`; the qualified fence prevents replacement from escaping the admitted closure through commit. A lost fence after dispatch requires confirmed rollback before a known failure; otherwise the outcome is indeterminate. Read-cache hits never skip this action-time admission.

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
- A valid `validate()` result is advisory: state can change before `invoke`,
  which still evaluates every precondition itself.
- Unity Catalog and Spark/Delta targets have no async form in 0.1.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| raw_action_commits_serializable | US-085-AC1 | Verified Postgres and Lakebase targets; mapped role; valid typed input; static corpus | Static errors for bad input; one SERIALIZABLE transaction; typed output and original-incarnation receipt |
| raw_action_rejects_and_denies_without_change | US-085-AC2 | Precondition false; session without mapped role | `<Action>Rejected` with declared code; `ActionDenied` for role failure; no row changed |
| raw_action_conflict_rolls_back | US-085-AC3 | Barrier-synchronized write skew; concurrent Delta writer | `ActionConflict`; loser committed nothing; one attempt only |
| raw_action_commit_loss_is_indeterminate | US-085-AC4 | Connection dropped after COMMIT is sent, with and without a reconnection factory | `ActionIndeterminate` without reconciliation; reconciled committed, known-aborted failure or indeterminate outcome; no retry |
| raw_action_unsupported_refuses_at_build | US-085-AC5 | Policy, person-required (service-principal target), handler, unmapped-role and two-effect spark-delta actions | Named refusal per target; no entry; runtime raises refusal without statements |
| raw_action_runtime_preconditions_refuse | US-085-AC6 | Raw-table target passed to `ReplayingActions`; connection mid-transaction | Checker error and `TypeError`; `ActionRefused` with `TRANSACTION_STATE`; no statement sent |
| uc_action_atomic_block_and_receipt | US-085-AC7 | Managed tables with and without catalog commits | `BEGIN ATOMIC` with delta receipt; refusal when commits are not enabled |
| raw_action_validate_reports_all | US-085-AC8 | Input failing two preconditions; valid input | All failing codes, `complete=True`; valid result; rollback and no change |
| raw_action_returns_created_and_changed_keys | US-085-AC9 | Action creating a `Shipment` and changing an `Order` | Typed `created` and `changed` Keys equal to an independent read |
| async_raw_action_matches_sync | US-085-AC10 | Async Postgres and Lakebase targets on the sync fixtures | Equal outcomes, receipts and validation results; awaitable types |
| raw_action_timeouts | US-085-AC11 | Lock held before commit; COMMIT acknowledgement held past the deadline, with and without a factory | Confirmed noncommit permits `ActionTimedOut`; committed status returns retained success; unresolved settlement remains `ActionIndeterminate` |
| multi_effect_action_atomic | US-085-AC12 | Note-and-reminder action; second effect violating a constraint; public-surface inventory | Both rows or neither; both Keys created; no cross-action transaction API |
| person_required_on_human_target | US-085-AC13 | `sessionPrincipal: human` target; two per-user connections | Compiles with recorded obligation; original attribution separates authenticated human from effective role |

| native_dependency_closure_fenced | US-085-AC14 | Undeclared cascade/trigger; changed routine/policy; admission race; cached verify | Refusal before business dispatch or positively settled rollback; no outside-frame effect |

## Dependencies

US-080, US-081 and US-083 (generated package, codecs, catalog build and target
`verify()`); CONTRACT-068, CONTRACT-071, CONTRACT-072, CONTRACT-073,
CONTRACT-900 and CONTRACT-901. Weft lowering of `graph-write/1` actions to native
statement programs (dependency W-4 in the build handoff; Weft WR-B4). A pinned Postgres
server, a Lakebase endpoint, a local Spark/Delta runtime and a separately selected
Unity Catalog workspace. Weft WR-B4 also supplies the validate-only program and
the returned Keys (US-085-AC8, US-085-AC9). Feature requirements: AT-01, AT-02,
AT-03, AT-04, AT-06, AT-07, AT-08, AT-09, AT-10;
PRD FR-54. TD-085 owns implementation detail; STP-085 owns the test mapping.

## Out of Scope

Idempotent replay, policy authorization, human attribution established by the
SDK itself, and handler actions on raw tables (they refuse here and may run on
Truss, US-087); a `person-required` action runs only where the host declares
`sessionPrincipal: human` (US-085-AC13). Bulk commands
(US-086). Creating connections, roles, grants, tables or migrations. Any claim
of native support before the conformance suite and native witnesses pass on the
pinned platform version.
