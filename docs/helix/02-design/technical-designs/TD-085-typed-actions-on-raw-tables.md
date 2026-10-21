---
ddx:
  id: TD-085
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: SD-030
      kind: informed_by
---

# TD-085: Invoke typed actions on raw tables

**User Story:** [[US-085-typed-actions-on-raw-tables]]. **Feature:** [[FEAT-030]].
**Solution Design:** [[SD-030]].

## Scope

One journey: a generated action method invoked against a raw-table target.
Shared shapes live in CONTRACT-068 (client and types), CONTRACT-071 (catalog),
CONTRACT-072 (protocols, outcomes, conformance suite) and CONTRACT-073 (per
platform guarantees). This design does not define action meaning (CONTRACT-900)
or SQL lowering (Weft).

## Technical Approach

**Build time.** The catalog build compiles every action the generated package
exports, for every selected raw-table target, through Weft's action lowering.
Before calling Weft it checks the CONTRACT-073 refusal rules that do not depend
on lowering: policy authorization, `person-required` attribution on a target whose
`sessionPrincipal` is `service`, roles/1 on a service target (independent of attribution), unqualified role profiles, handler
bindings, a missing `roleMappings` entry, a missing `security` source and, on
`spark-delta`, `administrativeSingleTenant` not set (CONTRACT-071 target
configuration). After lowering it refuses multi-statement programs
on `spark-delta`, and on `unity-catalog` any multi-statement program that is not
a single `BEGIN ATOMIC ... END` block. A refusal is recorded in the catalog as a
non-executable entry `{name, kind:"action", targetId, refusal:{code,
diagnostics}}`, so the runtime can name the reason. An executable entry records
the program, its parameters and carriers, outputs, Weft obligations, the failure
code each precondition reports, the role-check marker, and the tables it
touches.

**Run time.** The generated `Actions` method validates and encodes the input
(CONTRACT-068) and calls `target.invoke(action, input)`. Raw-table targets
implement `ActionExecutor` only, so there is no keyed path: pinned checkers reject
`ReplayingActions(raw_target)`, and its constructor raises `TypeError` at run
time. The raw-table target then:

1. raises `ActionRefused` with the recorded code for a non-executable entry,
   before touching the connection;
2. checks identity and entry pins, then performs CONTRACT-073 action-time
   native dependency/authority closure admission under the qualified fence; a
   cached shape verification never supplies that fence;
3. on `postgresql`/`lakebase`, reads the psycopg transaction status and refuses
   anything but idle (`ActionRefused` with `TRANSACTION_STATE`); then opens one
   transaction with `SERIALIZABLE` isolation, applies Weft obligations, runs the
   program with bound parameters, reads its outputs, captures
   `pg_current_xact_id()`, and commits;
4. on `unity-catalog`, submits the single statement or the one atomic block;
   on `spark-delta`, submits the single statement;
5. classifies the result with the CONTRACT-073 table and builds the receipt.

| Native result | Postgres / Lakebase signal | Delta signal | Outcome |
| --- | --- | --- | --- |
| Committed | COMMIT acknowledged | Commit result with table versions | `Committed(output, receipt, created, changed)` |
| Deadline with confirmed original noncommit | Positive cancellation/rollback, or qualified original aborted status | Independently confirmed native noncommit | `TimedOut` |
| Precondition false | Program's declared precondition marker | Same, folded into statement result | `Rejected(code)` |
| Authorization | Program's role-check marker; SQLSTATE `42501` | Program's role-check marker | `Denied` |
| Concurrency | SQLSTATE `40001`, `40P01` | Delta concurrent-modification exception | `Conflict(retained=False)` |
| Commit unknown | Connection error after COMMIT was sent | Connection error after submission of the committing statement | Postgres/Lakebase: reconciled as below; Delta: `Indeterminate` |
| Known rollback/noncommit | Native exception and positive original settlement | Same | `ActionFailed(code, cause)` |
| Unresolved settlement | Disconnect/cancellation without original termination evidence | Same | `Indeterminate`, including before the commit phase flag |

The program reports a false precondition and a failed role check by markers
Weft defines in the lowered program (for example a declared SQLSTATE raised by
the program, or a result row). The adapter maps only markers recorded in the
catalog entry; it never parses error message text. A failed role check is
`Denied` and is never reported as `Rejected`.

Commit detection records dispatch phases but never treats a phase flag alone as
proof of rollback. With `reconnect=`, the adapter uses the factory once, verifies
the original writer/store/incarnation and restore-epoch custody, then observes
`pg_catalog.pg_xact_status` for the captured xid. Committed status returns the
complete result captured before COMMIT. Aborted status yields `TimedOut` only
when a deadline expired; otherwise it raises
`ActionFailed("ABORTED_CAUSE_UNKNOWN", original_error)`. No generic abort becomes
a concurrency conflict. Missing original results, wrong/diverged/restored scope,
unverified replicas, `NULL` and unresolved status yield `Indeterminate`. The
runtime never resends a program and never releases uncertain connections for
reuse. Async task cancellation follows the same settlement rule.

**Receipts.** Use CONTRACT-073's exact string-valued native receipt. The store
encodes original database identity (Postgres/Lakebase) or ordered UUIDs (Delta),
the epoch identifies qualified original store incarnation/restore custody, and
the version encodes captured xid8 or this commit's exact table-version vector.
No constant `pg`/`delta` epoch or later history head substitutes for original
scope/commit evidence. Native attribution is separate outcome metadata.

**Validation (AT-07).** Each executable entry also records Weft's validate-only
program (WR-B4). `validate()` runs the same pre-checks as `invoke` (entry refused,
pins, idle connection), then runs that program in a transaction it always rolls
back, and returns `ValidationResult` with every failing declared code and
`complete=True`; nothing is committed even when every check passes
(US-085-AC8). The invoke program separately returns the Keys of created and changed entities,
which the adapter decodes through the shared runtime using generated Key metadata into `Committed.created`
and `Committed.changed` (US-085-AC9).

**Async (AT-08).** `AsyncPostgresTarget` and `AsyncLakebaseTarget` share the
`invoke`, `validate`, classification and reconciliation code with the sync
adapters over psycopg 3's `AsyncConnection`; only I/O calls differ
(US-085-AC10).

**Timeouts (AT-09).** Every call takes keyword-only `timeout`; `None` uses the
required target default. The single deadline includes admission, execution and
cleanup/reconciliation; native statement timeouts use the remaining budget.
A cancellation request is not rollback evidence. Return `TimedOut` only after
confirmed original noncommit; a qualified aborted xid after deadline expiry
also permits it. Confirmed commit returns the retained success. If settlement
cannot be established in the bounded cleanup/reconciliation window, return
`Indeterminate` and quarantine original custody (US-085-AC11). Validation has
no commit instruction but still requires confirmed noncommit before asserting
its timeout/rollback result.

**Composite actions and per-user sessions (AT-10, AT-04).** Related changes are
one action with several effects; Weft lowers them into one program, which runs in
the single `SERIALIZABLE` transaction above (US-085-AC12). Neither the generated
clients nor the runtime offer a transaction across action calls. A target whose
configuration declares `sessionPrincipal: human` compiles `person-required`
actions only with the qualified host human/session binding. Original outcome
attribution records `session_user` and `current_user` separately, and roles/1
checks the authenticated human (US-085-AC13). Service-role authorization is
not inferred from native-session attribution.

Trade-off: refusing early and loudly over providing partial guarantees. There is
no fallback to a weaker isolation level, separate statements or retries.

## Component Changes

Planned files (none exist yet):

- `python/umf_access/targets/_actions.py` — shared raw-table
  `invoke` procedure, phase flag and outcome classification.
- `python/umf_access/targets/postgresql.py`,
  `lakebase.py`, `unity_catalog.py`, `spark_delta.py` — per-platform
  transaction control, receipt construction and `verify()` additions
  (catalog-commit table property, unique constraints for Key creates).
- `python/umf_access/build/actions.py` — CONTRACT-073 build-time
  refusals and action catalog entries.
- `python/umf_access/conformance/actions.py` — reusable outcome
  classification cases, including the fault-injecting connection wrapper.

| AC | Component realization |
| --- | --- |
| US-085-AC1 | Generated method signature (CONTRACT-068) plus `postgresql`/`lakebase` SERIALIZABLE transaction and original-incarnation receipt |
| US-085-AC2 | Precondition and role-check markers from the catalog entry; `Rejected` and `Denied` classification |
| US-085-AC3 | SQLSTATE and Delta exception classification to `Conflict(retained=False)`; no retry path exists |
| US-085-AC4 | Commit phase flag, `pg_current_xact_id()` capture, `reconnect=` reconciliation and `Indeterminate` classification |
| US-085-AC5 | Build-time refusal entries with CONTRACT-073 codes; runtime raises `ActionRefused` with the recorded code |
| US-085-AC6 | `ReplayingActions` typed to `ReplayingActionExecutor` with a runtime protocol check; idle-transaction check raising `ActionRefused` |
| US-085-AC7 | `unity-catalog` atomic-block submission, catalog-commit check in `verify()`, delta receipt |
| US-085-AC8 | Validate-only program in the entry; always-rolled-back transaction; `ValidationResult` with every failing code |
| US-085-AC9 | Returned Keys decoded into `Committed.created` and `Committed.changed` with generated Key codecs |
| US-085-AC10 | `AsyncPostgresTarget` and `AsyncLakebaseTarget` sharing the sync procedure; generated async overloads |
| US-085-AC11 | `SET LOCAL statement_timeout` and client deadline; `TimedOut` only with positive noncommit; otherwise reconciled result or indeterminate |
| US-085-AC12 | Multi-effect program in one transaction; no cross-action transaction surface |
| US-085-AC13 | Qualified human-session admission and separate original/effective attribution |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `Actions.<action>(input)` | CONTRACT-068 | Typed entry point; validates and encodes only |
| `ReplayingActions` | CONTRACT-068 | Not available on raw tables; rejected statically and by a runtime protocol check |
| `ActionExecutor.invoke`, `ActionOutcome`, `Receipt` | CONTRACT-072 | Target protocol and outcome union |
| `ActionExecutor.validate`, `ValidationResult`, `AsyncActionExecutor`, `ActionTimedOut` | CONTRACT-072 | Validation, async invocation and timeouts |
| `ActionDenied`, `ActionConflict`, `ActionIndeterminate`, `ActionRefused`, `ActionFailed` | CONTRACT-072 | Raised failures |
| Action catalog entries, `roleMappings`, `administrativeSingleTenant`, `security` | CONTRACT-071, CONTRACT-073 | Program, markers, obligations, refusals; target configuration |
| Refusal codes carried by `ActionRefused` | CONTRACT-073 | `NATIVE_PROFILE_UNSUPPORTED`, `ROLE_MAPPING_MISSING`, `TRANSACTION_STATE` |

CONTRACT-071 owns executable and refusal entry shapes; this design consumes them.

## Data Model Changes

No UMF core change and no database migration. Catalog entries gain the action
kind above. Role mappings live in the pinned target configuration and are part
of the catalog's inputs.

## Integration Points

Weft action lowering (W-4, Weft WR-B4) produces the program, precondition
markers, the validate-only program and the returned created and changed Keys; if
Weft refuses, the build fails with Weft's diagnostics. psycopg 3 transaction
status and SQLSTATE; Databricks SQL connector or Spark session commit results.
The host supplies connections, roles and grants; the runtime creates none.

## Security

The runtime sends only catalog program text with bound parameters. Authorization
is checked inside the program against mapped native roles, and a failure is
`Denied`; native privileges, row-level security, row filters and masks still
apply; cached `verify()` confers no authorization or effect-transaction fence.
The original outcome records authenticated and effective identities separately. Validation errors name the
field and rule, never the value. Native errors are wrapped unchanged in
`ActionFailed` and are not logged with parameters. The reconciliation connection
from `reconnect=` performs qualified read-only original-scope checks before the
`pg_catalog.pg_xact_status` query. Native dependency closure and its fence are
mandatory under CONTRACT-073; unexpressed cascades/triggers refuse.

## Testing

| AC | Test | Assertion | Owner |
| --- | --- | --- | --- |
| US-085-AC1 | `raw_action_commits_serializable` | Static corpus rejects wrong inputs; server log or `pg_stat_activity` shows one SERIALIZABLE transaction; receipt version equals the committing txid observed independently | UMF conformance + native lane |
| US-085-AC2 | `raw_action_rejects_and_denies_without_change` | Declared code on the exception; `ActionDenied` for role failure; independent row read shows no change | UMF conformance + native lane |
| US-085-AC3 | `raw_action_conflict_rolls_back` | `ActionConflict` with `retained=False`; loser's writes absent; exactly one program execution per call | UMF conformance + native lane |
| US-085-AC4 | `raw_action_commit_loss_is_indeterminate` | Without a factory, and on Delta, `ActionIndeterminate`; with a factory, the reconciled outcome equals the independently observed one; no second submission | UMF conformance + native lane |
| US-085-AC5 | `raw_action_unsupported_refuses_at_build` | Catalog refusal entries with expected codes; zero statements at run time | UMF build tests |
| US-085-AC6 | `raw_action_runtime_preconditions_refuse` | Checker error and `TypeError` for `ReplayingActions`; `ActionRefused` with `TRANSACTION_STATE`; zero statements; host transaction state unchanged | UMF static + conformance |
| US-085-AC7 | `uc_action_atomic_block_and_receipt` | Statement text is one atomic block; receipt UUIDs and versions equal `DESCRIBE HISTORY`; refusal without catalog commits | Managed Unity Catalog lane |
| US-085-AC8 | `raw_action_validate_reports_all` | Both failing codes, `complete=True`; valid input has no failures; rollback and no change observed independently (Weft WR-B4) | UMF conformance + native lane |
| US-085-AC9 | `raw_action_returns_created_and_changed_keys` | `created` and `changed` equal independently read Keys; static types are Key DTO tuples (Weft WR-B4) | UMF static + native lane |
| US-085-AC10 | `async_raw_action_matches_sync` | Async outcomes, receipts and validation results equal sync ones on the same fixtures; awaitable types on pinned checkers | UMF static + native lane |
| US-085-AC11 | `raw_action_timeouts` | `ActionTimedOut` with no change before commit; after dispatch, original settlement determines committed, confirmed timeout/noncommit or indeterminate | UMF conformance + native lane |
| US-085-AC12 | `multi_effect_action_atomic` | Both rows or neither; both Keys in `created`; public-surface inventory finds no cross-action transaction API | UMF conformance + native lane |
| US-085-AC13 | `person_required_on_human_target` | Entry compiles with the human-session obligation; original attribution separates authenticated human and effective execution role | UMF build + native lane |

| US-085-AC14 | `native_dependency_closure_fenced` | Unexpressed cascade/trigger and changed routine/policy refuse; replacement cannot escape the fence; cached verify does not bypass admission | UMF conformance + native lane |

STP-085 owns the authoritative mapping and commands.

## Migration & Rollback

New capability; nothing existing changes. Removing a target from the catalog
configuration, or reverting the generated package and catalog, stops action
execution on that target. Reverting code does not undo committed native effects.

## Implementation Sequence

1. Write the conformance cases and red native tests for Postgres.
2. Implement build-time refusals and the shared `invoke` procedure.
3. Add Lakebase, then local Spark/Delta, then Unity Catalog on a selected workspace.
4. Record each platform's evidence separately; qualify only what passed.

Prerequisites: US-083, W-4, W-0 (action entries are specified in CONTRACT-071).

## Revision2 lifecycle integration

CONTRACT-081's U1–U3 evolution profile governs the next direct-table cut under
FEAT-033. Keep the existing legacy compiler path exact. The source-aware change
analyzer matches stable table/Field/Key/constraint/index identities before emitting
reviewed DDL; ordinary positional append checks cannot authorize removal or rename.
The phase scheduler consumes typed emitted steps and original selected metadata,
groups adjacent transactional effects, and introduces explicit validation/index
barriers. It does not parse arbitrary SQL to infer source meaning.

`src/table-migration/index.ts`, `options.ts` and a new reviewed-change module own
diff admission, review markers and operation emission. A separate `phases.ts`
owns scheduling through a pure postprocessor, with a small compile hook before
final IDs and hashing. New 0.2 schemas dispatch independently of legacy 0.1.
The authoring normalizer lives separately from canonical extension inspection;
retained original row_scope and exact join context yield the existing RowRule
forms without adding an alternate native policy interpreter.

The Python mixed runner owns one supplied administrative session and session lock.
It records phase effects and progress together, fences ordinary data admission,
and invokes a separate verified ledger finalizer after final correspondence.
It MUST NOT re-enter the existing all-required-steps executor after a committed
prefix, which would replay data effects. A source-selected metadata profile
registers the fixed progress relation with exact shape and owner-only privileges;
catalog inventory and witness verification explicitly admit that profile only.
Legacy inventory remains unchanged. A completed prefix requires source-bound
catalog correspondence, including unvalidated-constraint state where selected.

Implement in separate source worktrees: U1 owns the phase module, Python runner,
finalizer, metadata inventory and CLI; U2 owns reviewed diff/emission, shared
options/schema dispatch and TypeScript tests; U3 owns normalization and its tests.
Integrate the shared options and compile hook once. Verify each native change
kind separately, then run one mixed migration through interrupted phases.
Committed effects are forward-only; recovery resumes verified progress or requires
an explicit corrective migration, never a simulated whole-plan rollback.

SD-007's field lifecycle acceptance applies to the release inventory. Analyze
typed source references before DDL, including local constraints/indexes that
PostgreSQL removes automatically on column drop even with RESTRICT. Native
dependency errors supplement this analysis. Review disclosures explicitly name
stored-value loss and immediate irreversibility or supplied recovery custody.
Validate both logical/native domains for finite type conversions. Existing
optional-column tightening uses fail-if-null native activation; filling its
historical nulls is a distinct unsupported operation. Appended-column backfill
retains its existing explicit source-declared path. Hold native write protection
through actual-data validation and activation; a metadata fence protects ordinary
generated calls but cannot alone exclude direct authorized SQL. A failed committed
stage keeps clients fenced and requires resume/forward repair even while the old
metadata head remains. Reusing that head does not undo physical effects.

## Raw action risks

Weft may not be able to fold conditions into one Delta statement; those actions
refuse on Delta and remain available on Postgres or Truss. Lakebase minor
upgrades can invalidate qualification until the new minor is listed. Fault
injection at the driver boundary does not prove behavior under every network
failure; the Postgres lane also uses a network proxy.
