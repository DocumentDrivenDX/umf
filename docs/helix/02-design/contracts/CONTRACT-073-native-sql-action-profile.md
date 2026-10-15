---
ddx:
  id: CONTRACT-073
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# CONTRACT-073: Native SQL action profile for raw tables

**Type:** executable action profile and target obligations. **Version:** proposed
`umf.actions.native-sql/0.1`.

## Purpose

State exactly which CONTRACT-900 action guarantees hold when an action, or a
catalog bulk command, runs as native SQL on a host's own Postgres, Lakebase,
Spark/Delta or Unity Catalog tables through CONTRACT-072 raw-table adapters, and
which actions must therefore refuse. There is no separate executor service: the
host's native SQL interface is the execution layer.

## Scope and Boundaries

Applies to targets of kind `postgresql`, `lakebase`, `spark-delta` and
`unity-catalog`. Actions are compiled at build time into catalog entries of kind
`action`: Weft lowers each action's selectors, conditions and `graph-write/1`
effects into a native statement program for the bound tables. That lowering is a
Weft capability this profile depends on; this contract states what the lowered
program and the adapter together must guarantee. Truss and Ashlar targets are
governed by CONTRACT-069 instead. Handler bindings (`kind:"handler"`) are out of
scope; such actions refuse on raw tables.

## Normative Surface

### Obligations by platform

| CONTRACT-900 obligation | `postgresql`, `lakebase` | `unity-catalog` | `spark-delta` |
| --- | --- | --- | --- |
| One atomic store change | The adapter runs the program in one transaction on the host connection, which MUST be idle (not already in a transaction) | Single-statement programs; multi-statement programs only as `BEGIN ATOMIC ... END` on Unity Catalog managed tables with catalog commits enabled, on qualified compute | Single-statement programs only; multi-statement programs refuse at catalog build |
| No check-then-act gap | `SERIALIZABLE` isolation for every action program; serialization failure is `Conflict` | Conditions folded into the statement predicate or the atomic block; Delta conflict detection failure is `Conflict` | Conditions folded into the single statement; otherwise refuse |
| Preconditions | Evaluated in the transaction before effects; first false condition yields `Rejected(code)` | Folded as above; a condition that cannot be folded refuses at build | As `unity-catalog`, single statement only |
| Postconditions | Evaluated in the transaction before commit; false or error rolls back as an execution failure | Only if expressible inside the atomic block; otherwise refuse | Refuse |
| Frame | Lowered program touches only frame tables and columns | Same | Same |
| Key uniqueness on create | Requires an installed unique constraint matching the Key, observed by `verify()` | Creates use `MERGE ... WHEN NOT MATCHED THEN INSERT` on the Key; primary keys are informational and not relied on. Uniqueness holds only if every writer to the table uses this path: the catalog records "SDK is the sole writer of Key-bearing rows" as a host obligation, and the SDK makes no uniqueness claim against other writers | Same as `unity-catalog` |
| Authorization | Role binding mapped through `roleMappings` to native roles and checked in the program (candidate: `pg_has_role`); native privileges and row-level security still apply; a failed check is `Denied` | Mapped through `roleMappings` to account groups and checked in the program (candidate: `is_account_group_member`); Unity Catalog privileges, row filters and masks still apply; a failed check is `Denied` | Refuse unless the target configuration sets `administrativeSingleTenant: true` |
| Policy authorization (`kind:"policy"`) | Refuse in 0.1 | Refuse in 0.1 | Refuse in 0.1 |
| Attribution | `actor-profile` with `umf.actions.native-session/0.1` (defined below) on any target. `person-required` only when the target's `sessionPrincipal` is `human`; otherwise it refuses at catalog build | Same | Same |
| Idempotency key | Not offered: there is no durable replay record. Raw-table targets implement `ActionExecutor` but not `ReplayingActionExecutor` (CONTRACT-072); type checking rejects passing them to `ReplayingActions` | Same | Same |
| Receipt | `{store: database system identifier and name, epoch: "pg", version: transaction ID}`, where the ID is `pg_current_xact_id()` captured in the transaction before COMMIT is sent | `{store: table UUIDs, epoch: "delta", version: committed table versions}`, obtained from the native commit result; if not obtainable, the target is unqualified for actions | Same as `unity-catalog` |

Role mappings are the `roleMappings` member of the target's pinned catalog
configuration (CONTRACT-071): an exact map from each action role ID to one native
role or group name. A missing mapping refuses at catalog build; mappings are never
inferred from names. `administrativeSingleTenant` is a boolean member of the same
configuration, valid only on `spark-delta` targets. The configuration's
`security` member supplies the `umf.security` policy and ontology source that
Weft's compiler requires for every raw-table target; a target without it cannot be
compiled.

These mechanisms are candidates. Each target claims action support only after the
CONTRACT-072 conformance suite and native witnesses pass on its pinned platform
version.

### Native session actor profile

`umf.actions.native-session/0.1` is a CONTRACT-900 actor profile. The actor is
the authenticated native session principal (`current_user` on Postgres and
Lakebase, `current_user()` on Databricks), recorded in the receipt. It makes no
claim that a human subject acted and carries no delegation.

The SDK uses whatever connection the host supplies: per-user connections or a
service account. A target configuration declares which (`sessionPrincipal`,
CONTRACT-071). When it declares `human`, `person-required` actions compile for that
target and the declaration is recorded as a host obligation in the catalog: the
host guarantees that each connection authenticates one human, and the receipt
records that principal. When it declares `service`, `person-required` actions
refuse at catalog build with `NATIVE_PROFILE_UNSUPPORTED`; use an `actor-profile`
action or a target such as Truss that establishes the human itself.

### Outcome classification

Outcomes and raised failures are those of CONTRACT-072.

| Native result | Outcome or raised failure |
| --- | --- |
| Catalog refusal entry, connection already in a transaction, unmet obligation, or any other refusal before a statement is sent | `ActionRefused(code)`; nothing sent |
| Program committed | `Committed(output, receipt)` |
| A precondition evaluated false | `Rejected(code)`; transaction rolled back |
| The in-program role check failed, or the platform reported a native privilege refusal (SQLSTATE `42501` on Postgres and Lakebase) | `Denied`; transaction rolled back |
| Serialization failure, deadlock, or Delta concurrent-modification conflict | `Conflict(retained=False)`; nothing committed |
| Connection lost or timeout after COMMIT was sent, on `postgresql`/`lakebase` | Reconciled as below |
| Connection lost or timeout after the committing statement was sent, on `unity-catalog`/`spark-delta` | `Indeterminate`; never retried automatically |
| Postcondition false or error, constraint violation, other native error | `ActionFailed(code, cause)` wrapping the native error; transaction rolled back |

The program reports a false precondition and a failed role check by markers that
Weft records in the catalog entry; the adapter never parses error message text.
Program outputs are read inside the transaction before COMMIT is sent.

### Commit-loss reconciliation on Postgres and Lakebase

Before sending COMMIT the adapter captures `pg_current_xact_id()` inside the
transaction. If the connection is lost after COMMIT was sent, and the host
constructed the target with a connection factory (`reconnect=`), the adapter calls
that factory once, runs only `SELECT pg_xact_status($1)` for the captured ID on the
new connection, and closes it:

| `pg_xact_status` | Outcome |
| --- | --- |
| `committed` | `Committed(output, receipt)` with that transaction ID as the receipt version |
| `aborted` | `Conflict(retained=False)`: nothing committed and the cause cannot be observed |
| `in progress` after a bounded wait recorded in the target configuration, `NULL`, or any error | `Indeterminate` |

Without a factory, or if reconnection fails, the outcome is `Indeterminate`. The
adapter never resends the program. `unity-catalog` and `spark-delta` targets have
no equivalent check in 0.1, so commit loss there is always `Indeterminate`.

### Bulk commands on raw tables

A catalog bulk command runs as one Weft-lowered set-based statement program with
its preflight, in one atomic unit under the same rules as actions, bounded by the
command's `maxItems`. Raw-table plans are CONTRACT-072 `AtomicBulkPlan`s:
`preview()` runs the preflight and selection read-only, and `execute()` returns
`BulkOutcome {selected, changed, receipt}` or raises as an action does. A
selection above `maxItems` rolls back and raises `ActionRefused("BULK_LIMIT")`;
it is the one refusal raised after statements have run, and it has no effect.
CONTRACT-903 manifests and CONTRACT-904 batched coordination are not used on raw
tables in 0.1, because they need durable control state the native SQL interface
does not provide; raw-table plans therefore have no `seal()` or `submit()`.
Resumable or batched bulk work on raw tables needs a separate control-state
design.

## Precedence and Compatibility

CONTRACT-900 owns action meaning; this profile only narrows which actions execute
on raw tables and how. An action that refuses here may still execute on Truss
under CONTRACT-069. Enabling a refused capability (idempotency, policy
authorization, human attribution, batched bulk) requires a new profile version.

## Error Semantics

Codes are carried by `ActionRefused(code)` (CONTRACT-072).

| Code | Condition |
| --- | --- |
| `NATIVE_PROFILE_UNSUPPORTED` | The action needs a capability this profile refuses on the target |
| `ROLE_MAPPING_MISSING` | An action role has no pinned native mapping |
| `TRANSACTION_STATE` | The host connection is already in a transaction |
| `BULK_LIMIT` | Selection exceeds `maxItems` |

There is no idempotency refusal code: raw-table targets do not implement
`ReplayingActionExecutor`, so a keyed call cannot reach them through a
type-checked client, and `ReplayingActions` raises `TypeError` at construction if
given one at run time.

## Examples

`shipOrder` sets `Order.status` and creates a `Shipment` with a precondition that
the order is paid. On `lakebase` it runs as one `SERIALIZABLE` transaction; a
concurrent payment reversal causes `Conflict`. On `unity-catalog` it runs as a
`BEGIN ATOMIC` block if both tables have catalog commits enabled, otherwise it
refuses at build. On `spark-delta` it refuses at build because it has two effects.
If the Lakebase connection drops after COMMIT is sent and the host supplied
`reconnect=`, `pg_xact_status` reports `committed` and the call returns
`Committed` with the captured transaction ID; without `reconnect=` it raises
`ActionIndeterminate`.

## Validation Checklist

- [ ] Each row of the obligations table has native positive and negative witnesses per target.
- [ ] Commit-loss injection yields `Indeterminate` on Delta targets and on Postgres/Lakebase without a factory; with a factory, each `pg_xact_status` result maps as tabulated.
- [ ] `ReplayingActions` over a raw-table target fails type checking and raises `TypeError` at run time; refusals for policy authorization and person-required attribution have fixtures.
