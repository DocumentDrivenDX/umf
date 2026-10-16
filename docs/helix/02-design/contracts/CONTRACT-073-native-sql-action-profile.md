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

Raw atomic catalog commands use a separately named companion execution profile,
`umf.actions.native-bulk/0.1`, requiring the same qualified native transaction,
authorization, failure and receipt obligations below plus a bounded set-based
program. This is NOT CONTRACT-902's frozen selection/plan profile, CONTRACT-904
bulk/1 or CONTRACT-905 local-bulk/1. Weft must produce this explicit program;
the SDK cannot cast or relabel an existing engine mutation plan into it.

## Normative Surface

### Obligations by platform

| CONTRACT-900 obligation | `postgresql`, `lakebase` | `unity-catalog` | `spark-delta` |
| --- | --- | --- | --- |
| One atomic store change | The adapter runs the program in one transaction on the host connection, which MUST be idle (not already in a transaction) | Single-statement programs; multi-statement programs only as `BEGIN ATOMIC ... END` on Unity Catalog managed tables with catalog commits enabled, on qualified compute | Single-statement programs only; multi-statement programs refuse at catalog build |
| No check-then-act gap | `SERIALIZABLE` isolation for every action program; serialization failure is `Conflict` | Conditions folded into the statement predicate or the atomic block; Delta conflict detection failure is `Conflict` | Conditions folded into the single statement; otherwise refuse |
| Preconditions | Evaluated in the transaction before effects; first false condition yields `Rejected(code)` | Folded as above; a condition that cannot be folded refuses at build | As `unity-catalog`, single statement only |
| Postconditions | Evaluated in the transaction before commit; false or error rolls back as an execution failure | Only if expressible inside the atomic block; otherwise refuse | Refuse |
| Frame | Direct and indirect native effects and reads satisfy the admitted frame; native dependency closure is observed and fenced as specified below | Same; unavailable closure or fence refuses | Same; unavailable closure or fence refuses |
| Key uniqueness on create | Requires an installed unique constraint matching the Key, observed by `verify()` | Creates use `MERGE ... WHEN NOT MATCHED THEN INSERT` on the Key; primary keys are informational and not relied on. Uniqueness holds only if every writer to the table uses this path: the catalog records "SDK is the sole writer of Key-bearing rows" as a host obligation, and the SDK makes no uniqueness claim against other writers | Same as `unity-catalog` |
| Authorization | Role binding mapped through `roleMappings` to native roles and checked in the program (candidate: `pg_has_role`); native privileges and row-level security still apply; a failed check is `Denied` | Mapped through `roleMappings` to account groups and checked in the program (candidate: `is_account_group_member`); Unity Catalog privileges, row filters and masks still apply; a failed check is `Denied` | Refuse unless the target configuration sets `administrativeSingleTenant: true` |
| Policy authorization (`kind:"policy"`) | Refuse in 0.1 | Refuse in 0.1 | Refuse in 0.1 |
| Attribution | `actor-profile` with `umf.actions.native-session/0.1` (defined below) on any target. `person-required` only when the target's `sessionPrincipal` is `human`; otherwise it refuses at catalog build | Same | Same |
| Idempotency key | Not offered: there is no durable replay record. Raw-table targets implement `ActionExecutor` but not `ReplayingActionExecutor` (CONTRACT-072); type checking rejects passing them to `ReplayingActions` | Same | Same |
| Receipt | `{store, epoch, version}` under the native receipt rules below; capture `pg_catalog.pg_current_xact_id()` before COMMIT | Same string-valued shape with exact table UUID/version-vector encoding from the native commit result; unavailable exact attribution to this commit refuses qualification | Same as `unity-catalog` |

Role mappings are the `roleMappings` member of the target's pinned catalog
configuration (CONTRACT-071): an exact map from each action role ID to one native
role or group name. A missing mapping refuses at catalog build; mappings are never
inferred from names. `administrativeSingleTenant` is a boolean member of the same
configuration, valid only on `spark-delta` targets. The configuration's
`security` member supplies the `umf.security` policy and ontology source that
Weft's compiler requires for every raw-table target; a target without it cannot be
compiled.

The mapped authorization profile must retain its own principal semantics.
`umf.actions.roles/1` (CONTRACT-901) tests the independently authenticated human,
not whichever effective SQL role runs a statement. It refuses on a
`sessionPrincipal:"service"` target even when the action uses native-session
attribution. `administrativeSingleTenant` never waives this rule. On a human
target the qualified host binding must establish the authenticated human and
native-role/group correspondence inside the admission boundary; per-user pools
may supply that binding. Unknown or different role profiles remain unsupported
until separately specified and qualified. Mapping a name is not that qualification.
Service-role authorization needs its own explicit profile; it is not silently
introduced by the native-session actor profile.

These mechanisms are candidates. Each target claims action support only after the
CONTRACT-072 conformance suite and native witnesses pass on its pinned platform
version.

### Admission and atomic-result requirements

Every supported program must distinguish actual role denial, each declared
precondition failure, missing entity, admitted no-op and successful effect using
Weft-owned result markers from the SAME atomic unit. Folding a condition into
`WHERE` and observing zero changed rows is insufficient: it cannot by itself
distinguish those outcomes. A target that cannot produce the required markers
refuses that action at build time. No native error-text parsing is permitted.

Bulk selection, complete-population validation, maxItems enforcement and all
effects must share one admitted native snapshot/atomic unit. Preview is advisory
and cannot supply the execution count or authorization. On single-statement
Delta, the qualified statement must enforce the bound even with concurrent
writers and an optimizer that could otherwise skip a check; a separate SELECT
followed by UPDATE is not a supported substitute. Missing enforcement or exact
commit receipts leaves that target/capability unqualified and refuses execution.

The sole-writer host obligation on Delta is necessary but not sufficient to
prove uniqueness: two concurrent calls from the same SDK are still writers.
The profile additionally requires a qualified serialized per-Key writer path or
native conflict protocol that prevents duplicate creates, including concurrent
absent-Key MERGEs. Without original host/native enforcement and independent
concurrency witnesses, Key-bearing creates refuse. No new lock service or
external control store is implied by this requirement.

### Native dependency admission and fence

`nativeAdmission` (CONTRACT-072) pins the native relation and dependency profile,
including rewrite rules, triggers, foreign-key actions/cascades, generated/default
expressions, constraints, policies and routines/operators their execution invokes.
The profile must bound transitive dependencies, identify their actual installed
definitions and execution identities, and classify business reads/writes versus
separately named control state. Unknown, dynamic or uninspectable relevant meaning
refuses. A digest by itself authenticates neither installed code nor authority.

At each action or atomic-bulk effect transaction, before business dispatch, the
adapter observes that closure under a qualified unchanged-closure fence retained
through commit. Catalog inputs and first-use/cached `verify()` observations are
insufficient. The fence must cover installation/replacement of dependencies and
their effective authority, not merely concurrent row changes; a platform without
such a qualified boundary refuses this capability. An external host's qualified
DDL/deployment serialization may supply the fence; the SDK creates no service.

Unexpressed native side effects refuse even when the final rows happen to match
an expected state. For example, deleting an Order cannot cascade-delete an
undeclared Shipment, and an UPDATE trigger cannot change an unframed table.
A candidate profile may conservatively refuse all application triggers/rules or
cascading referential actions rather than inspect them. Qualified built-in
constraint enforcement must still preserve the declared frame/effect semantics.
A detected mismatch before dispatch raises `ActionRefused("NATIVE_ADMISSION")`
after any read-only admission observations, with no business statement sent.
A lost fence after dispatch requires rollback and positive noncommit before a
known failure can be returned; uncertain settlement follows the rules below.

### Native receipts and original transaction scope

The common receipt remains `{store:string, epoch:string, version:string}`.
Postgres/Lakebase `store` is the JCS string encoding of
`{systemIdentifier, databaseOid, databaseName}` observed on the original writer;
`version` is the canonical xid8 text captured in that transaction. `epoch` is the
opaque original writer-incarnation/restore namespace issued and independently
verified by the qualified host admission binding, never the constant `"pg"`.
The binding must prevent reuse across restores/divergent clones and retain the
original transaction's scope for reconciliation. A changed or unprovable epoch
cannot be repaired by allocating a new one for an uncertain original attempt.

For Delta, `store` is the JCS string of the sorted distinct table UUID vector and
`version` is the JCS string of ordered `{tableUuid,version}` pairs for this native
atomic commit; table versions are canonical decimal strings. `epoch` is the
qualified host's corresponding store-incarnation namespace. The receipt/profile
must identify the exact transaction's versions, not a later `DESCRIBE HISTORY`
head. Missing exact native commit metadata leaves the capability unqualified.
Attribution stays separate from this receipt, in original outcome metadata.
Native receipt consumers must honor at-least-that-commit reads or explicitly
refuse/wait under CONTRACT-900; these strings do not define a global clock.

### Native session actor profile

`umf.actions.native-session/0.1` is a CONTRACT-900 actor profile. Capture the
native authenticated session identity and effective execution identity separately
in the original outcome's attribution metadata: on Postgres/Lakebase use
`session_user` and `current_user`; role switching or SECURITY DEFINER can make
them differ. Databricks uses its independently qualified session/current-user
mapping. Neither a principal label nor `sessionPrincipal:"human"` is itself
authentication evidence. The host's qualified connection/authentication binding
must establish the declared interpretation. The native-session profile makes no
human/delegation claim by itself; a separately qualified human target retains its
recorded host obligation. Receipt's `{store,epoch,version}` shape stays unchanged.

The SDK uses whatever connection the host supplies: per-user connections or a
service account. A target configuration declares which (`sessionPrincipal`,
CONTRACT-071). When it declares `human`, `person-required` actions compile for that
target and the declaration is recorded as a host obligation in the catalog: the
host guarantees that each connection authenticates one human, and the original
outcome attribution records that principal separately from the effective role. When it declares `service`, `person-required` actions
refuse at catalog build with `NATIVE_PROFILE_UNSUPPORTED`; use an `actor-profile`
action or a target such as Truss that establishes the human itself.

### Outcome classification

Outcomes and raised failures are those of CONTRACT-072.

| Native result | Outcome or raised failure |
| --- | --- |
| Catalog refusal entry, connection already in a transaction, unmet obligation, or any other refusal before a business statement is sent | `ActionRefused(code)`; no business statement sent; read-only admission checks may have run |
| Program committed | `Committed` with typed output, created/changed Keys, receipt and required original effect/no-op verification |
| A precondition evaluated false | `Rejected(code)`; transaction rolled back |
| The in-program role check failed, or the platform reported a native privilege refusal (SQLSTATE `42501` on Postgres and Lakebase) | `Denied`; transaction rolled back |
| Serialization failure, deadlock, or Delta concurrent-modification conflict | `Conflict(retained=False)`; nothing committed |
| Connection lost or timeout after COMMIT was sent, on `postgresql`/`lakebase` | Reconciled as below |
| Connection lost or timeout after the committing statement was sent, on `unity-catalog`/`spark-delta` | `Indeterminate`; never retried automatically |
| Deadline expired and original noncommit is positively established (confirmed cancellation/rollback, or qualified original aborted status) | `TimedOut`; nothing committed |
| Postcondition false or error, constraint violation, other native error with confirmed original rollback/noncommit | `ActionFailed(code, cause)` wrapping the native error |
| Disconnect, timeout, cancellation or other native error without positive original settlement | `Indeterminate`; no automatic retry or false known rollback |

The program reports a false precondition and a failed role check by markers that
Weft records in the catalog entry; the adapter never parses error message text.
Program outputs and complete effect/no-op verification are read inside the
transaction before COMMIT is sent. A client phase flag, cancellation request,
closed connection or elapsed deadline alone does not prove original rollback.
Only a positively established noncommit may yield `TimedOut` or `ActionFailed`.
Uncertain resources remain unavailable to the pool until the host establishes
settlement; the SDK never starts another action on uncertain custody. These
rules apply equally to async cancellation and validation calls.

### Commit-loss reconciliation on Postgres and Lakebase

Before sending COMMIT the adapter captures `pg_current_xact_id()` inside the
transaction. If the connection is lost after COMMIT was sent, and the host
constructed the target with a connection factory (`reconnect=`), the adapter calls
that factory once, runs the qualified read-only original-scope/admission checks
and then `SELECT pg_catalog.pg_xact_status($1)` for the captured ID on the new
connection, and closes it. No business statement is resent:

| `pg_xact_status` | Outcome |
| --- | --- |
| `committed` | `Committed(output, receipt)` with that transaction ID as the receipt version |
| `aborted` | With a recorded deadline expiry, `TimedOut` because original noncommit is now confirmed; otherwise `ActionFailed("ABORTED_CAUSE_UNKNOWN", cause)` retaining the original disconnect/error. Status alone never establishes a concurrency conflict |
| `in progress` after a bounded wait recorded in the target configuration, `NULL`, or any error | `Indeterminate` |

The new connection MUST independently match the original database/store identity
and qualified writer endpoint AND original incarnation/restore epoch before
inspecting the xid; a wrong database/cluster, divergent restore/clone, unverified
replica or unavailable continuity evidence yields `Indeterminate`. Reconnect
checks cannot rely on equal names, system identifier or xid alone. Capture the
complete typed output and receipt prerequisites before COMMIT; a committed status
with missing output/custody cannot fabricate a result and remains Indeterminate.
Only explicit native concurrency evidence yields Conflict. The adapter never
derives retryability from generic abort status.

Without a factory, or if reconnection fails, the outcome is `Indeterminate`. The
adapter never resends the program. `unity-catalog` and `spark-delta` targets have
no equivalent check in 0.1, so commit loss there is always `Indeterminate`.

### Bulk commands on raw tables

A catalog bulk command runs as one Weft-lowered set-based statement program with
its preflight, in one atomic unit under the same rules as actions, bounded by the
command's `maxItems`. Raw-table plans are CONTRACT-072 `AtomicBulkPlan`s:
`preview()` runs the preflight and selection read-only, and `execute()` returns
`BulkOutcome {selected, changed, receipt, original:NativeOutcomeDetails}` or raises as an action does. A
selection above `maxItems` rolls back and raises `ActionRefused("BULK_LIMIT")`;
like native admission refusal, it may follow read-only/check statements, but it
has no business effect and requires confirmed rollback of the atomic unit.
CONTRACT-903 manifests and CONTRACT-904 batched coordination are not used on raw
tables in 0.1, because they need durable control state the native SQL interface
does not provide; raw-table plans therefore have no `seal()` or `submit()`.
Resumable or batched bulk work on raw tables needs a separate control-state
design.

## Precedence and Compatibility

CONTRACT-900 owns action meaning; this profile only narrows which actions execute
on raw tables and how. An action that refuses here may still execute on Truss
under CONTRACT-069. Enabling a refused capability (idempotency, policy
authorization profiles, batched bulk) requires a new profile version.

## Error Semantics

Refusal codes are carried by `ActionRefused(code)` (CONTRACT-072).
`ABORTED_CAUSE_UNKNOWN` is instead an `ActionFailed` code after positively
established original noncommit; it is not a build/admission refusal.

| Code | Condition |
| --- | --- |
| `NATIVE_PROFILE_UNSUPPORTED` | The action needs a capability this profile refuses on the target |
| `ROLE_MAPPING_MISSING` | An action role has no pinned native mapping |
| `TRANSACTION_STATE` | The host connection is already in a transaction |
| `NATIVE_ADMISSION` | Native dependency/authority closure or its action-time fence is missing or mismatched; no business dispatch |
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

The native qualification corpus also covers undeclared cascades/triggers, a
dependency replacement racing admission, roles/1 on service sessions, role
switching with original human attribution, wrong/restored reconnect targets,
precommit disconnect with unresolved settlement, and async cancellation.
