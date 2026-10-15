---
ddx:
  id: CONTRACT-072
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
---

# CONTRACT-072: Access runtime and target protocols

**Type:** Python library and adapter protocols. **Version:** proposed
`umf-access-runtime/0.1`.

## Purpose

Define the hand-written `umf_access` Python runtime that generated packages
import: the DSL capture classes, the catalog build tool, the protocols every
storage target implements, typed outcomes, and the raw-table adapters that run
catalog statements on a host's native SQL connection.

## Scope and Boundaries

`umf_access` is one Python distribution maintained in the UMF repository with
optional extras: `build` (requires Weft's Python binding), `bulk` (requires the
same pinned Weft binding at runtime, used only to instantiate bulk plans until
Weft offers plan templates), `postgresql` (psycopg 3), `databricks` (Databricks
SQL connector) and `spark` (PySpark). Reads and actions never import Weft. Generated
packages depend on it; it never imports generated packages by name. Hosts own
connections, pools, credentials, configuration and deployment. Engine adapters
for Truss and Ashlar implement these protocols in their own repositories
(CONTRACT-069). Native SQL action semantics for raw tables are CONTRACT-073.

## Normative Surface

### Target identity and verification

Every target exposes `identity() -> TargetIdentity` with `{kind, backendId,
backendVersion, targetProfile, bindingSha256, platform:{name,version}[]}` and
`verify() -> None`. Catalog pins name, for each platform component, an explicit
set of qualified versions; a target matches when every other field is equal and
each observed platform version is in its pinned set. For most platforms the set
has one member. `kind` is one of `postgresql`, `lakebase`, `spark-delta`,
`unity-catalog`, `truss` or `ashlar`. Catalog entries execute only on a target
whose identity equals their pins (CONTRACT-071).

`verify()` MUST run before a target's first statement and whenever the host
reconnects. It observes, through the host connection, the server or runtime
version and, for every table a catalog entry references, its native identity and
column shape, then compares them with the binding and CONTRACT-070 ColumnSets:

| Kind | Observed |
| --- | --- |
| `postgresql`, `lakebase` | `server_version_num`; relation OID; per column name, type with typmod, `attnotnull`, `attidentity`, `attgenerated`, collation, ignoring `attisdropped`; required unique indexes for Keys |
| `spark-delta`, `unity-catalog` | Spark or warehouse version; table UUID; column names, types and nullability; table properties required by CONTRACT-073 |
| `truss`, `ashlar` | Defined by CONTRACT-069 |

Any difference raises `TargetMismatch`. Lakebase applies minor versions
automatically, so a Lakebase target qualifies a major version plus an explicit
set of observed minor versions; an unlisted minor refuses until qualified.
Verification checks shape and identity only; it confers no authorization and
does not prove the shape stays unchanged after it runs. For action claims, the host supplies pinned `nativeAdmission` descriptors: declared native relation identities, dependency-closure/profile digest, the qualified action-time unchanged-closure fence, authenticated principal/profile correspondence and original writer-incarnation/restore-epoch custody. CONTRACT-073 requires admission at the effect transaction; first-use shape verification is insufficient. Missing or changed proof refuses the affected action. Reconnect must establish original namespace continuity before transaction reconciliation; otherwise return Indeterminate. Native descriptors confer no action or role authority.

`TargetIdentity.digest()` is the lowercase SHA-256 hex of the JCS encoding of the
complete observed identity. For Ashlar the identity also carries the resolved
publication ID and version vector (CONTRACT-069), so its digest changes with every
publication even though catalog matching ignores the vector.

Targets that serve CONTRACT-074 searches with host-computed embeddings take an
`embedders` mapping from search index ID to `Embedder` at construction; a search
whose index needs a host embedder and has none raises `ObligationUnmet`.

### Continuations

`Page[R, K]` carries `items: tuple[R, ...]` and `next_after: Continuation[K] |
None`. A continuation is an immutable value containing `key:K`,
`sortValues:tuple[EncodedValue,...]`, `targetIdentityDigest`, `catalogDigest`,
`entryName`, `variantDigest` and `argumentsDigest`. `sortValues` covers EVERY
declared ordering component, including the complete appended Key and explicit
null/missing markers, in the exact mixed-direction/null-placement order. The
catalog variant defines those carriers and ordering; a Key alone cannot resume
general WR-A6 ordering. Hidden sort/Key outputs are retained as continuation data
even when the returned projection excludes them; their disclosure must be
authorized by the original read path or that page form refuses.

`argumentsDigest` is JCS/SHA-256 of the validated encoded non-continuation
arguments, including optional-parameter presence. Entry/variant/catalog and all
target identity fields must match the current call; any mismatch, wrong sort
inventory/carrier or changed filter raises `StaleContinuation` before dispatch.
The initial call uses `after=None`. Target identity includes the engine's
accepted model/action binding context and, on Ashlar, its publication vector.
The SDK does not promise a cross-page snapshot on mutable raw tables; callers
requiring that property must supply a qualified shared snapshot/transaction.
Continuations are process-local, not persisted or authenticated credentials, and
confer no authorization; the engine still admits each read independently.

### Protocols

```python
class ReadTarget(Protocol):
    def execute_read(self, entry: CatalogVariant, params: BoundParams) -> RowStream: ...

@runtime_checkable
class ActionExecutor(Protocol):
    def invoke(self, action: ActionRef, input: EncodedInput) -> ActionOutcome: ...

@runtime_checkable
class ReplayingActionExecutor(ActionExecutor, Protocol):
    def invoke_keyed(self, action: ActionRef, input: EncodedInput, *,
                     idempotency_key: str) -> ActionOutcome: ...
```

Idempotency is a static capability, not a runtime option. An `ActionExecutor`
offers no replay guarantee and accepts no key. A `ReplayingActionExecutor` also
offers `invoke_keyed`, which follows CONTRACT-900/901 durable replay for the key.
Raw-table targets implement only `ActionExecutor`; the Truss adapter implements
`ReplayingActionExecutor` (CONTRACT-069). CONTRACT-068 generates an `Actions`
client over `ActionExecutor` and a `ReplayingActions` client over
`ReplayingActionExecutor`, so type checking rejects passing a raw-table target to
`ReplayingActions`.

Raw-table executors resolve the exact source-bound `action` to the catalog entry of kind `action` for
their pinned target and run its statement program under CONTRACT-073; a missing
entry raises `NotCompiledForTarget`. Engine executors pass the action identity to
the engine (CONTRACT-069).

```python
class BulkTarget(Protocol[PlanT_co]):
    def plan(self, entry: CatalogVariant, params: BoundParams) -> PlanT_co: ...
```

Raw-table targets are `BulkTarget[AtomicBulkPlan]`; the Truss adapter is
`BulkTarget[ManifestBulkPlan]`. Generated bulk functions are generic in the plan
type, so the plan a caller receives exposes only the methods its target supports.

`RowStream` yields the ordered column inventory once, then rows as tuples in that
order. Duplicate or unexpected columns raise `TargetMismatch` before any row is
decoded. Streams are bounded by the catalog entry's page or count limits and are
closed by the caller. `BoundParams` holds values already validated and encoded by
CONTRACT-068 codecs, keyed by catalog parameter name.

### Outcomes

Engine outcomes retain an immutable `original: OriginalOutcome` alongside every
typed projection and every raised engine failure. It contains the complete
original authorized result (all members, unknown content, revision, changes,
noOp, verification, code and receipt), the exact source-bound ActionRef and the
original request identity/recovery context supplied by the engine. If original
transport bytes are supplied, retain those exact bytes as well. Never rebuild an
original result from a reduced projection, later status or a new invocation.
Opaque issuer/recovery capabilities remain out of band with the engine; this
carrier cannot mint, serialize or authenticate them. Only already-authorized
result content may be exposed, and it MUST NOT be logged automatically.
Raw-table outcomes use `original=None` and retain their own native diagnostics.

`ActionOutcome` is exactly one of:

| Outcome | Meaning | Generated client behavior |
| --- | --- | --- |
| `Committed(output, receipt, original)` | Invocation committed, including a net no-op | Returns typed output/receipt and complete original outcome when engine-owned |
| `Rejected(code)` | Declared business failure (a false precondition, or CONTRACT-901 `ENTITY_MISSING`); no change | Raises `<Action>Rejected` |
| `Denied(code, original)` | Authorization failure, including a failed in-program role check; no change | Raises `ActionDenied` preserving the protected-safe native/engine code |
| `Replayed(original)` | Equal retained request under an idempotency key; the original outcome is returned | Returns or raises the original |
| `Conflict(retained: bool, code, original)` | Explicit concurrency/version/token-conflict result; nothing committed | Raises `ActionConflict` preserving code and complete original result; retained is determined by the original result/protocol, never key presence alone |
| `Indeterminate(original)` | Original outcome currently unknown | Raises `ActionIndeterminate`; host/engine may reconcile original custody; never retried automatically |

Two failures are raised by the executor rather than returned as outcomes:

- `ActionRefused(code)`: the request was refused before any statement was sent.
  `code` is a CONTRACT-073 code (for example `NATIVE_PROFILE_UNSUPPORTED`,
  `ROLE_MAPPING_MISSING`, `TRANSACTION_STATE`) or the code of a tx/1 `unsupported`
  or `expired` result. Nothing changed.
- `ActionFailed(code, cause)`: execution started and was rolled back with a known
  outcome: a postcondition false or erroring, a constraint violation, another
  native error during the program, or a tx/1 `failed` result. `cause` wraps the
  native exception unchanged; for engines `code` and `original` preserve the
  engine's classification. Nothing committed. A proven abort with unknown cause
  is `ActionFailed("ABORTED_CAUSE_UNKNOWN", cause)`, never an invented conflict.

`Rejected`, `Replayed`, refused and failed engine results also retain `original`.
Exception projections expose the original protected-safe code without dropping
unknown result members. A committed no-op retains `noOp:true`, empty net changes
and original verification; it is not described as a business change. Replay
preserves the complete original result, not only its typed output. Indeterminate
retains the original request/recovery context for the engine's existing lookup;
the SDK's lack of an action lookup convenience does not discard that custody.

CONTRACT-901 tx/1 results map to these as follows. Executors for engines that
speak tx/1 (CONTRACT-069) MUST use this table; raw-table executors produce the
same outcomes from native signals (CONTRACT-073).

| tx/1 status | SDK result |
| --- | --- |
| `committed` | `Committed(output, receipt)`; `Replayed(Committed(...))` when the executor's result identifies a retained replay |
| `rejected` | `Rejected(code)`; `Replayed(Rejected(code))` when identified as a replay |
| `conflict` | Preserve original code/result; `retained=True` only when original protocol evidence identifies a retained terminal conflict. A pre-admission `TOKEN_REUSE` does not become a newly retained outcome merely because a key was supplied |
| `denied` | `Denied` |
| `unsupported`, `expired` | `ActionRefused(code)` |
| `failed` | `ActionFailed(code)`, including `TRANSIENT_ABORT` after the executor's own bounded internal retries |
| `indeterminate` | `Indeterminate` |
| `not-found` | Lookup only; not an invocation result. The SDK exposes no lookup operation in 0.1 |

`Receipt` is `{store, epoch, version}` per CONTRACT-901: opaque, comparable only
within one store and epoch.

### Bulk plans

Every `BulkPlan` exposes `preview()`, which returns the bounded selected
identities and the statement summary without writing. The two plan types differ
after that:

| Plan | Targets | Methods |
| --- | --- | --- |
| `AtomicBulkPlan` | Raw tables (CONTRACT-073) | `preview()`; `execute() -> BulkOutcome`, where `BulkOutcome` is `{selected, changed, receipt}`: the number of selected identities, the number of rows changed and the commit receipt. Failures raise as for actions (`ActionConflict`, `ActionIndeterminate`, `ActionFailed`, `ActionRefused`) |
| `ManifestBulkPlan` | Truss (CONTRACT-069) | `preview()`; `seal(*, attempt: ControlAttempt) -> SealControlResult`; `submit(sealed, *, submission_key: str, attempt: ControlAttempt) -> SubmitControlResult`; `recover_control(recovery: ControlRecoveryRef) -> ControlResult`. Host workers execute batches through the engine. There is no `execute()` |

`SealControlResult` and `SubmitControlResult` retain the COMPLETE original
engine materialize/submit unions: sealed/submitted success, original Refusal,
TOKEN_REUSE conflict, ControlUnknown and ControlFailure. Their typed convenience
views never replace the original result. `ControlAttempt` is an opaque original
host/engine-issued durable attempt capability, supplied out of band; the adapter
neither fabricates it nor turns its recovery reference into authority. `sealed`
is the exact original Artifact with its issuer-owned seal custody. `submission_key`
is the original stable caller submission key, explicitly required and retained
with the exact request. A changed request under that key follows CONTRACT-904.

`recover_control` delegates to original `recoverControl` under current engine
authorization and preserves its full result. After unknown seal/submit ACK,
retain the SAME attempt/recovery/request and block fresh mutation; do not issue a
new seal, job, key or attempt as an implicit retry. Known control noncommit is
ControlFailure, not business Conflict. Engine `status`, `review`, `lookup`,
`reconcile` and `cancel` remain available through the host's original qualified
bulk-control client; the adapter must retain its association with the plan/job
and must not replace those APIs with a lossy BulkJob status. No worker loop,
lease/fence handling or business retry is introduced in the SDK. Browser-local
CONTRACT-905 has its separately admitted control/owner profile; it is never
silently mapped to native human bulk authority.

### Transport carriers

Parameters and results cross the target boundary only in the carriers named by
the Weft entry (for example exact decimal text, epoch-microsecond text for
instants, native boolean). CONTRACT-068 codecs convert between carriers and Python
values. A carrier the runtime does not recognize refuses the entry at catalog
build time; it is never guessed at runtime.

### Raw-table adapters

`PostgresTarget(connection, catalog_target)` and `LakebaseTarget(connection,
catalog_target)` take a host-owned psycopg 3 connection. `UnityCatalogTarget(
connection | session, catalog_target)` takes a Databricks SQL connector connection
or a Databricks Runtime Spark session. `SparkDeltaTarget(session,
catalog_target)` takes a local Spark session with Delta. Adapters:

- execute only catalog statement text, passing every value as a native bound
  parameter;
- apply the Weft entry's host obligations (session settings, search path,
  isolation) and refuse if one cannot be applied;
- never create connections, pools, sessions, credentials, tables or migrations;
  the only exception is commit-loss reconciliation, which calls a host-supplied
  connection factory when the host passed one (`reconnect=` on `PostgresTarget`
  and `LakebaseTarget`, CONTRACT-073);
- for reads, may run inside a host-owned transaction; for actions and bulk
  commands, follow CONTRACT-073 transaction rules;
- for reads, surface native exceptions unchanged; for actions and bulk commands,
  classify them as CONTRACT-073 states, wrapping unclassified native errors in
  `ActionFailed`. Errors never become empty results.

### Conformance suite

`umf_access.conformance` is a reusable test suite every target adapter MUST pass
for the capabilities it claims: identity and verify refusals, carrier round trips,
read bounds and duplicate-column refusal, continuation refusal on a changed
identity, action outcome classification (including injected commit loss and,
where offered, its reconciliation), static and runtime rejection of
non-replaying executors by `ReplayingActions`, and bulk preview/execute or
preview/seal/submit agreement. Engine
adapters run it in their own repositories with their own native fixtures.

## Precedence and Compatibility

Weft owns statement text, carriers and obligations; CONTRACT-900/901 own action
meaning; CONTRACT-073 and CONTRACT-069 own per-target execution guarantees. The
runtime's own version is pinned by each generated package; a runtime upgrade that
changes protocol shapes is a new ABI.

## Error Semantics

| Error | Condition |
| --- | --- |
| `TargetMismatch` | Version, identity or shape differs from pins, or result columns are inconsistent |
| `NotCompiledForTarget` | No catalog entry matches the target identity |
| `ObligationUnmet` | A Weft host obligation cannot be applied |
| `StaleContinuation` | A continuation was passed to a target whose identity digest differs from the one that produced it |
| `ActionDenied` | Outcome `Denied` |
| `ActionConflict(retained)` | Outcome `Conflict` |
| `ActionIndeterminate` | Outcome `Indeterminate` |
| `ActionRefused(code)` | Refused before any statement was sent (CONTRACT-073 codes, tx/1 `unsupported` or `expired`) |
| `ActionFailed(code, cause)` | Known rollback during execution; `cause` is the native or engine error |
| `TypeError` | A generated client was constructed with an executor that does not implement its required protocol |
| Native driver errors | Re-raised unchanged on reads |

## Examples

A service opens its own psycopg connection to Lakebase 17, wraps it as
`LakebaseTarget(conn, catalog.targets["lakebase-17"])`, calls `verify()`, then
`queries.customer_orders(target, customer=k, after=None)`. It passes the returned
page's `next_after` to fetch the next page. If Lakebase has moved to a minor
version not listed in the target pins, `verify()` raises `TargetMismatch` and no
query runs. Passing `ReplayingActions(target)` the same `LakebaseTarget` fails type
checking, because the target implements only `ActionExecutor`.

## Validation Checklist

- [ ] Each raw-table adapter passes the conformance suite on its pinned platform.
- [ ] Verify detects added, dropped, retyped and identity/generation-changed columns.
- [ ] Commit-loss injection yields `Indeterminate` when it cannot be reconciled, and on Postgres/Lakebase with a reconnection factory the reconciled outcome equals an independent observation; never a retry.
- [ ] Every tx/1 status maps as tabulated; continuation reuse on a changed identity raises `StaleContinuation`.
