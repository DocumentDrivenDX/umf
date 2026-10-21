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
| US-085-AC1 | `raw_action_commits_serializable` (conformance case `actions.commit`, run on `postgresql` and `lakebase`; static cases in `tests/static/actions_input_bad.py`) | All three pinned checkers reject wrong input; one SERIALIZABLE transaction; typed outputs and original effect/no-op result agree with independent observations. Receipt epoch equals independently issued original incarnation/restore namespace, version equals captured xid8, and store encodes original database identity under CONTRACT-073. | `@covers US-085-AC1` |
| US-085-AC2 | `raw_action_rejects_and_denies_without_change` (conformance case `actions.reject_and_deny`) | A false precondition raises `<Action>Rejected` whose `code` is the first failing declared code; a session without the mapped role raises `ActionDenied`, not `<Action>Rejected` or a native exception; an independent read shows identical rows before and after both calls. | `@covers US-085-AC2` |
| US-085-AC3 | `raw_action_conflict_rolls_back` (conformance case `actions.conflict`; Postgres/Lakebase write skew with a two-connection barrier; Unity Catalog concurrent writer) | The loser raises `ActionConflict` with `retained=False`; none of its writes are visible; the statement log shows one submission per call. | `@covers US-085-AC3` |
| US-085-AC4 | `raw_action_commit_loss_is_indeterminate` (conformance case `actions.commit_loss` with the fault-injecting connection wrapper; Postgres lane also through a TCP proxy that drops after forwarding COMMIT) | Drop acknowledgement after COMMIT. Qualified same-original-scope status returns retained Committed when committed; aborted without deadline raises ActionFailed with ABORTED_CAUSE_UNKNOWN, never Conflict. A wrong cluster, same-system-ID divergent restore, wrong database, unverified replica, missing original result, unavailable epoch continuity, NULL or failed factory yields ActionIndeterminate. Assert no second submission and no unsafe connection reuse. | `@covers US-085-AC4` |
| US-085-AC5 | `raw_action_unsupported_refuses_at_build` (UMF build test) | Policy, person-required on service, roles/1 on service even with native-session attribution, unknown role profile, handler, missing role map and unsupported Spark multi-statement cases produce named refusal entries; no business program runs. Administrative-single-tenant mode does not bypass roles/1 semantics. | `@covers US-085-AC5` |
| US-085-AC6 | `raw_action_runtime_preconditions_refuse` (static case `tests/static/replaying_actions_raw_bad.py`; conformance case `actions.runtime_refusals`) | Pyright, mypy and ty reject `ReplayingActions(raw_target)`; at run time that construction raises `TypeError`; a connection inside a host transaction raises `ActionRefused` with `TRANSACTION_STATE`; zero statements are sent and the host transaction status is unchanged afterwards. | `@covers US-085-AC6` |
| US-085-AC7 | `uc_action_atomic_block_and_receipt` (managed Unity Catalog lane) | Exactly one atomic block executes on admitted tables. Decode the string receipt and compare its UUID/version vector to this exact native commit, with a concurrent later writer proving that a history head is not substituted. Missing catalog commits, original epoch custody or exact commit version attribution refuses qualification. | `@covers US-085-AC7` |
| US-085-AC8 | `raw_action_validate_reports_all` (conformance case `actions.validate`, run on `postgresql` and `lakebase`; needs Weft WR-B4) | For an input making "order is paid" and a second declared precondition false, `validate()` returns `valid=False`, `complete=True` and both codes; for a valid input it returns `valid=True` with no failures. The server shows each call's transaction rolled back, and an independent read shows identical rows before and after. | `@covers US-085-AC8` |
| US-085-AC9 | `raw_action_returns_created_and_changed_keys` (conformance case `actions.returned_keys`; static case `tests/static/committed_keys_types.py`; needs Weft WR-B4) | After `shipOrder` commits, `Committed.created == (ShipmentKey(...),)` and `Committed.changed == (OrderKey(...),)`, equal to Keys read independently; pinned pyright, mypy and ty reveal both as tuples of the action's generated Key DTOs. | `@covers US-085-AC9` |
| US-085-AC10 | `async_raw_action_matches_sync` (conformance action cases rerun with `AsyncPostgresTarget` and `AsyncLakebaseTarget`) | For the commit, rejection, denial and conflict fixtures, awaited outcomes, raised failures, receipts and `validate()` results equal those of the sync target; the server observes one `SERIALIZABLE` transaction per call; static cases reveal an awaitable of the sync result type. | `@covers US-085-AC10` |
| US-085-AC11 | `raw_action_timeouts` (conformance case `actions.timeout`; lock held by a second connection; fault-injecting wrapper holding the COMMIT acknowledgement) | For sync and async, a held lock and confirmed cancellation/rollback after deadline yield ActionTimedOut with no effect. Delay COMMIT acknowledgement: qualified committed status returns retained success; qualified aborted status after deadline yields ActionTimedOut. Unresolved cancellation, precommit disconnect/rollback, original scope or commit yields ActionIndeterminate. Assert original settlement independently, no automatic retry, and quarantine of uncertain connections. | `@covers US-085-AC11` |
| US-085-AC12 | `multi_effect_action_atomic` (conformance case `actions.multi_effect`; `created` needs Weft WR-B4) | `addNoteWithReminder` commits both rows in one transaction (same `xmin` observed) with both Keys in `Committed.created`; with the reminder violating a check constraint it raises `ActionFailed` and neither row exists. An inventory of public callables in `umf_access` and the generated package finds no method that begins, joins or commits a transaction across action calls. | `@covers US-085-AC12` |
| US-085-AC13 | `person_required_on_human_target` (build test plus native lane) | Qualified human per-user sessions compile person-required/roles1. Alice and Bob retain distinct session_user and current_user attribution; SET ROLE does not relabel the authenticated human. Native role checks use the qualified human correspondence. A service connection and a human label without its qualified binding refuse. | `@covers US-085-AC13` |

| US-085-AC14 | `native_dependency_closure_fenced` (conformance `actions.native_admission`) | An undeclared FK cascade, trigger write and unknown routine/policy dependency each refuse before business dispatch. Race dependency replacement with admission and prove the fence prevents an outside-frame effect. Repeat after a verify-cache hit. Lost fence after dispatch returns known failure only with positive rollback, otherwise indeterminate. | `@covers US-085-AC14` |

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

## Table lifecycle successor qualification — 2026-10-21

CONTRACT-081 and the Praxis roadmap govern the bounded lifecycle extension.
`tests/lifecycle/migration.test.ts` covers source-derived comments, legacy bundle
recovery, required-column backfill options, appended checks/FKs, exact plan
recompilation and refusal of unacknowledged/mixed concurrent effects.
`tests/lifecycle/test_cli.py` covers offline chain/terminal-source/original-file
checks, exclusive new-file creation and approval before native connection.
`tests/lifecycle/native.py` uses fabricated legal domain-pack schemas: assigned
team membership limits matters, reference metadata is explicitly readable,
billing data has a trusted group, roster writes deny ordinary/batch callers,
and batch has only declared commands. Native checks cover backfill bound rollback,
NOT NULL/default completion, added constraints, failed concurrent uniqueness,
source-prefix resume, explicit invalid-index repair, metadata-head fencing,
immutable file/ledger replay and native comment drift. Generated sync page/action
calls exercise the original Weft prepared compiler. Exact installed wheel and
source hashes must accompany success; no private Praxis/Lakebase proof is inferred.

The existing real Chromium lifecycle script includes the three legal schema
stages and source-exact migration verification; the embedded corpus includes the
same generation/refusal cases. U1 mixed phases/NOT VALID/VALIDATE, U2 reviewed
existing-object changes, U5 generic host custody and U6 untrusted SQL containment
require their own new tests before next-release support claims. Existing scalar
and host/platform qualifications remain independently scoped.
