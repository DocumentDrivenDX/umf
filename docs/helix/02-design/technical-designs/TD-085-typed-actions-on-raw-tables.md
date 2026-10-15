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
`sessionPrincipal` is `service`, handler
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
2. checks that the identity was verified and matches the entry pins
   (`NotCompiledForTarget` otherwise);
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
| Committed | COMMIT acknowledged | Commit result with table versions | `Committed(output, receipt)` |
| Precondition false | Program's declared precondition marker | Same, folded into statement result | `Rejected(code)` |
| Authorization | Program's role-check marker; SQLSTATE `42501` | Program's role-check marker | `Denied` |
| Concurrency | SQLSTATE `40001`, `40P01` | Delta concurrent-modification exception | `Conflict(retained=False)` |
| Commit unknown | Connection error after COMMIT was sent | Connection error after submission of the committing statement | Postgres/Lakebase: reconciled as below; Delta: `Indeterminate` |
| Anything else | Native exception | Native exception | `ActionFailed(code, cause)` wrapping the native exception; rolled back |

The program reports a false precondition and a failed role check by markers
Weft defines in the lowered program (for example a declared SQLSTATE raised by
the program, or a result row). The adapter maps only markers recorded in the
catalog entry; it never parses error message text. A failed role check is
`Denied` and is never reported as `Rejected`.

Commit-unknown detection uses a phase flag set immediately before the commit
request is written. A connection failure before it is set means the
transaction is known not to have committed; the native error is wrapped in
`ActionFailed`. A connection failure while it is set starts reconciliation on
Postgres and Lakebase (CONTRACT-073): if the host constructed the target with
`reconnect=`, the adapter calls that factory once, runs `pg_xact_status` for the
captured ID, closes the connection, and returns `Committed` (`committed`),
`Conflict(retained=False)` (`aborted`) or `Indeterminate` (`in progress` after
the configured bounded wait, `NULL` or any error). Without a factory, and on
Delta targets, the outcome is `Indeterminate`. The runtime never resends the
program.

**Receipts.** Postgres/Lakebase: `{store: system identifier and database name,
epoch:"pg", version: txid}`, with the ID from `pg_current_xact_id()` captured
inside the transaction before COMMIT. Delta: `{store: table UUIDs, epoch:"delta", version:
committed table versions}` from the native commit result. If the pinned platform
does not return versions, the target is unqualified for actions and `verify()`
reports it.

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
| US-085-AC1 | Generated method signature (CONTRACT-068) plus `postgresql`/`lakebase` SERIALIZABLE transaction and `pg` receipt |
| US-085-AC2 | Precondition and role-check markers from the catalog entry; `Rejected` and `Denied` classification |
| US-085-AC3 | SQLSTATE and Delta exception classification to `Conflict(retained=False)`; no retry path exists |
| US-085-AC4 | Commit phase flag, `pg_current_xact_id()` capture, `reconnect=` reconciliation and `Indeterminate` classification |
| US-085-AC5 | Build-time refusal entries with CONTRACT-073 codes; runtime raises `ActionRefused` with the recorded code |
| US-085-AC6 | `ReplayingActions` typed to `ReplayingActionExecutor` with a runtime protocol check; idle-transaction check raising `ActionRefused` |
| US-085-AC7 | `unity-catalog` atomic-block submission, catalog-commit check in `verify()`, delta receipt |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `Actions.<action>(input)` | CONTRACT-068 | Typed entry point; validates and encodes only |
| `ReplayingActions` | CONTRACT-068 | Not available on raw tables; rejected statically and by a runtime protocol check |
| `ActionExecutor.invoke`, `ActionOutcome`, `Receipt` | CONTRACT-072 | Target protocol and outcome union |
| `ActionDenied`, `ActionConflict`, `ActionIndeterminate`, `ActionRefused`, `ActionFailed` | CONTRACT-072 | Raised failures |
| Action catalog entries, `roleMappings`, `administrativeSingleTenant`, `security` | CONTRACT-071, CONTRACT-073 | Program, markers, obligations, refusals; target configuration |
| Refusal codes carried by `ActionRefused` | CONTRACT-073 | `NATIVE_PROFILE_UNSUPPORTED`, `ROLE_MAPPING_MISSING`, `TRANSACTION_STATE` |

CONTRACT-071 records action entries with the other catalog entries; the exact
shape of a non-executable refusal entry is this design's proposal and needs
contract text before implementation.

## Data Model Changes

No UMF core change and no database migration. Catalog entries gain the action
kind above. Role mappings live in the pinned target configuration and are part
of the catalog's inputs.

## Integration Points

Weft action lowering (W-4, Weft WR-B4) produces the program and precondition markers; if
Weft refuses, the build fails with Weft's diagnostics. psycopg 3 transaction
status and SQLSTATE; Databricks SQL connector or Spark session commit results.
The host supplies connections, roles and grants; the runtime creates none.

## Security

The runtime sends only catalog program text with bound parameters. Authorization
is checked inside the program against mapped native roles, and a failure is
`Denied`; native privileges, row-level security, row filters and masks still
apply; `verify()` confers no authorization. The receipt records the native
session principal with no claim of a human subject. Validation errors name the
field and rule, never the value. Native errors are wrapped unchanged in
`ActionFailed` and are not logged with parameters. The reconciliation connection
from `reconnect=` runs only the `pg_xact_status` query.

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

## Risks

Weft may not be able to fold conditions into one Delta statement; those actions
refuse on Delta and remain available on Postgres or Truss. Lakebase minor
upgrades can invalidate qualification until the new minor is listed. Fault
injection at the driver boundary does not prove behavior under every network
failure; the Postgres lane also uses a network proxy.
