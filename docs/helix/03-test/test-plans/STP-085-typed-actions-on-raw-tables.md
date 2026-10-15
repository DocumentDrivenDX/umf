---
ddx:
  id: STP-085
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: TD-085
      kind: informed_by
---

# STP-085: Invoke typed actions on raw tables

## Story Reference

**User Story:** [[US-085-typed-actions-on-raw-tables]].
**Technical Design:** [[TD-085-typed-actions-on-raw-tables]].
**Related Solution Design:** [[SD-030]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that a generated action method on each raw-table target commits only with
the CONTRACT-073 guarantees for that platform, classifies every native result
into exactly one CONTRACT-072 outcome, and refuses unsupported actions and
runtime states before sending a statement. Each platform is qualified
separately; a pass on one says nothing about another.

All tests, fixtures and commands in this plan are planned and **UNTESTED** until
created and executed. The citations below are required future test-source
annotations, not coverage.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-085-AC1 | `raw_action_commits_serializable` (conformance case `actions.commit`, run on `postgresql` and `lakebase`; static cases in `tests/static/actions_input_bad.py`) | Pyright and mypy report each wrong input type; the server observes one transaction at `SERIALIZABLE`; the typed output equals the independently read state; the receipt epoch is `pg` and its version equals the txid observed by an independent query. | `@covers US-085-AC1` |
| US-085-AC2 | `raw_action_rejects_and_denies_without_change` (conformance case `actions.reject_and_deny`) | A false precondition raises `<Action>Rejected` whose `code` is the first failing declared code; a session without the mapped role raises `ActionDenied`, not `<Action>Rejected` or a native exception; an independent read shows identical rows before and after both calls. | `@covers US-085-AC2` |
| US-085-AC3 | `raw_action_conflict_rolls_back` (conformance case `actions.conflict`; Postgres/Lakebase write skew with a two-connection barrier; Unity Catalog concurrent writer) | The loser raises `ActionConflict` with `retained=False`; none of its writes are visible; the statement log shows one submission per call. | `@covers US-085-AC3` |
| US-085-AC4 | `raw_action_commit_loss_is_indeterminate` (conformance case `actions.commit_loss` with the fault-injecting connection wrapper; Postgres lane also through a TCP proxy that drops after forwarding COMMIT) | Without a reconnection factory, and on Delta targets, the call raises `ActionIndeterminate` and never returns `Committed`, whether or not the commit landed. On `postgresql`/`lakebase` with a reconnection factory, the adapter queries `pg_xact_status` for the transaction ID captured before COMMIT and returns `Committed` (receipt version equal to that ID) when an independent fresh connection shows the commit landed, or raises `ActionConflict` with `retained=False` when it shows it did not; a factory that fails or a status of `NULL` yields `ActionIndeterminate`. No second submission occurs. | `@covers US-085-AC4` |
| US-085-AC5 | `raw_action_unsupported_refuses_at_build` (UMF build test) | Policy, `person-required` on a `service`-principal target, handler and unmapped-role actions and a two-effect `spark-delta` action each produce a refusal entry with `NATIVE_PROFILE_UNSUPPORTED` or `ROLE_MAPPING_MISSING` for exactly the affected target; other targets still compile; invoking a refused action raises `ActionRefused` with the recorded code and the recording connection sees zero statements. | `@covers US-085-AC5` |
| US-085-AC6 | `raw_action_runtime_preconditions_refuse` (static case `tests/static/replaying_actions_raw_bad.py`; conformance case `actions.runtime_refusals`) | Pyright and mypy reject `ReplayingActions(raw_target)`; at run time that construction raises `TypeError`; a connection inside a host transaction raises `ActionRefused` with `TRANSACTION_STATE`; zero statements are sent and the host transaction status is unchanged afterwards. | `@covers US-085-AC6` |
| US-085-AC7 | `uc_action_atomic_block_and_receipt` (managed Unity Catalog lane) | The submitted text is a single `BEGIN ATOMIC ... END` block; receipt table UUIDs and versions equal `DESCRIBE DETAIL` and `DESCRIBE HISTORY`; with one table lacking catalog commits the action refuses at build or `verify()` and no statement runs. | `@covers US-085-AC7` |
| US-085-AC8 | `raw_action_validate_reports_all` (conformance case `actions.validate`, run on `postgresql` and `lakebase`; needs Weft WR-B4) | For an input making "order is paid" and a second declared precondition false, `validate()` returns `valid=False`, `complete=True` and both codes; for a valid input it returns `valid=True` with no failures. The server shows each call's transaction rolled back, and an independent read shows identical rows before and after. | `@covers US-085-AC8` |
| US-085-AC9 | `raw_action_returns_created_and_changed_keys` (conformance case `actions.returned_keys`; static case `tests/static/committed_keys_types.py`; needs Weft WR-B4) | After `shipOrder` commits, `Committed.created == (ShipmentKey(...),)` and `Committed.changed == (OrderKey(...),)`, equal to Keys read independently; pinned pyright and mypy reveal both as tuples of the action's generated Key DTOs. | `@covers US-085-AC9` |
| US-085-AC10 | `async_raw_action_matches_sync` (conformance action cases rerun with `AsyncPostgresTarget` and `AsyncLakebaseTarget`) | For the commit, rejection, denial and conflict fixtures, awaited outcomes, raised failures, receipts and `validate()` results equal those of the sync target; the server observes one `SERIALIZABLE` transaction per call; static cases reveal an awaitable of the sync result type. | `@covers US-085-AC10` |
| US-085-AC11 | `raw_action_timeouts` (conformance case `actions.timeout`; lock held by a second connection; fault-injecting wrapper holding the COMMIT acknowledgement) | With the lock held, `timeout=200ms` raises `ActionTimedOut` and an independent read shows no change. With the acknowledgement held past the deadline, the call returns `Committed` or raises `ActionConflict` matching an independent fresh-connection observation when a reconnection factory is given, raises `ActionIndeterminate` without one, and never raises `ActionTimedOut`. | `@covers US-085-AC11` |
| US-085-AC12 | `multi_effect_action_atomic` (conformance case `actions.multi_effect`; `created` needs Weft WR-B4) | `addNoteWithReminder` commits both rows in one transaction (same `xmin` observed) with both Keys in `Committed.created`; with the reminder violating a check constraint it raises `ActionFailed` and neither row exists. An inventory of public callables in `umf_access` and the generated package finds no method that begins, joins or commits a transaction across action calls. | `@covers US-085-AC12` |
| US-085-AC13 | `person_required_on_human_target` (build test plus native lane) | With `sessionPrincipal: human`, the `person-required` action compiles and its entry records the human-session host obligation. Invoked through connections logged in as `alice` and `bob`, each receipt records the committing `current_user`. | `@covers US-085-AC13` |

## Executable Proof

Planned commands (none exist yet):

```sh
python -m pytest python/umf_access/tests/build/test_action_refusals.py
python -m pytest python/umf_access/tests/static/test_action_inputs.py
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target postgresql
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target lakebase
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target spark-delta
python -m pytest python/umf_access/tests/native/test_actions.py --umf-target unity-catalog
python -m pytest python/umf_access/tests/native/test_async_actions.py --umf-target postgresql
python -m pytest python/umf_access/tests/native/test_async_actions.py --umf-target lakebase
```

The native test module runs the shared `umf_access.conformance` action cases
(`python/umf_access/conformance/`) against the selected target, then the
platform witnesses above. Commands run in the isolated pinned profile
environment, separately, each with its own retained status; a later success
cannot hide an earlier failure. Static-negative cases assert the expected
diagnostics and a nonzero checker status, with a positive control showing the
imports resolve.

Retain results under `docs/helix/04-build/evidence/typed-persistence/` with the
platform name and version, driver version, catalog digest, command, status,
expected and observed facts and the independent observation queries. A missing
Lakebase endpoint or Unity Catalog workspace is recorded as not run, never as a
pass.

## Data and Setup

A small UMF model with `Order` and `Shipment`, a `shipOrder` action (precondition
"order is paid", two effects, role `fulfilment`), a single-effect action for
Delta, and actions that need policy authorization, `person-required` (on service-principal targets)
attribution, a handler and an unmapped role. Pinned role maps per target.
Owned, isolated databases or schemas with explicit cleanup; a dedicated Unity
Catalog schema with one managed table with catalog commits and one without.
An `addNoteWithReminder` action with two effects and a check constraint on
`Reminder`, a `person-required` action, one target configured with
`sessionPrincipal: human` and login roles `alice` and `bob`, and a second
connection that holds table locks for timeout cases. Validation and returned-Key
cases need Weft WR-B4 and report not-run until the pinned Weft admits it.
Concurrency fixtures use explicit barriers, not sleeps. Expected values come
from independent queries, not from the adapter under test.

## Edge Cases and Failure Modes

Postcondition false (`ActionFailed` wrapping the native error, rolled back),
native privilege refusal (`ActionDenied`), missing unique constraint for a
Key create, unlisted Lakebase minor version, a Delta target without commit
versions, and `spark-delta` authorization without the single-tenant declaration.
No test may execute a live mutation twice to compare implementations.

## Build Handoff

Create the conformance cases and red tests first, then the build-time refusals,
then each platform adapter in TD-085's order. Every AC needs an exercising
assertion carrying its `@covers` tag. Done for a platform only when every case
for that platform has passed with retained evidence; unrun platforms stay
unqualified, and support is claimed per platform version only.
