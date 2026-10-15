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

`verify()` MUST run before a target's first statement on a database. It observes, through the host connection, the server or runtime
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
does not prove the shape stays unchanged after it runs.

Verification results are cached per process, keyed by the target identity, the
database identity (Postgres system identifier and database name) and, for
schema-neutral targets, the resolved schema of every referenced table. Hosts that
wrap a new pooled connection per request (for example per-user pools) pay only a
cheap resolution check per connection: on first use of a connection object the
runtime reads the resolved schemas with one catalog query and reuses a cached
verification when the key matches. Hosts may verify eagerly when a pool is
created, and may set a cache lifetime; the default lasts for the process.

**Schema-neutral targets.** A `postgresql` or `lakebase` target whose catalog
configuration sets `schemaBinding: "search-path"` (CONTRACT-071) runs statements
that name tables without a schema (Weft WR-B7). The host binds the schema once
per connection, typically with a role-level `search_path`; generated code and
call sites never take a schema. `verify()` additionally checks that each
referenced table resolves through the session's `search_path` to exactly one
relation and that `pg_catalog` is searched first, and records the resolved schema
in the cache key. A connection whose path resolves a table differently from the
cached verification is verified again; one that resolves nothing, or resolves a
table to a schema the host did not intend, raises `TargetMismatch`.

`TargetIdentity.digest()` is the lowercase SHA-256 hex of the JCS encoding of the
complete observed identity. For Ashlar the identity also carries the resolved
publication ID and version vector (CONTRACT-069), so its digest changes with every
publication even though catalog matching ignores the vector.

Targets that serve CONTRACT-074 searches with host-computed embeddings take an
`embedders` mapping from search index ID to `Embedder` at construction; a search
whose index needs a host embedder and has none raises `ObligationUnmet`.

### Continuations

`Page[R, K]` carries `items: tuple[R, ...]` and `next_after: Continuation[K] |
None`. A `Continuation[K]` is an immutable runtime value holding the last Key of
the page and the `TargetIdentity.digest()` of the target that read it. Passing it
back as `after` resumes the keyset only on a target whose current identity digest
is equal; otherwise the call raises `StaleContinuation` before any statement is
sent. Passing `None` starts a new read. Continuations are not persisted by the
runtime and carry no authorization.

Pages are live by default: keyset continuation never repeats a row, but rows
inserted or changed between pages may be missed or seen. A declaration with
`.page(..., snapshot=True)` reads every page of one continuation at the same table
versions, recorded in the `Continuation`; no row is skipped or repeated because of
concurrent writes. Snapshot pages compile for `unity-catalog` and `spark-delta`
(Delta `VERSION AS OF`, Weft WR-A12) and are inherent on Ashlar; they refuse at
catalog build on `postgresql`, `lakebase` and Truss. A snapshot continuation whose
versions are no longer readable (for example after Delta retention removed them)
raises `StaleContinuation`.

### Protocols

```python
class ReadTarget(Protocol):
    def execute_read(self, entry: CatalogVariant, params: BoundParams) -> RowStream: ...

@runtime_checkable
class ActionExecutor(Protocol):
    def invoke(self, action: ActionRef, input: EncodedInput) -> ActionOutcome: ...
    def validate(self, action: ActionRef, input: EncodedInput) -> ValidationResult: ...

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

Raw-table executors resolve `action` to the catalog entry of kind `action` for
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

`validate` checks an input without changing anything: parameter validation,
authorization and every precondition, not only the first false one. It returns
`ValidationResult{valid: bool, failures: tuple[ValidationFailure, ...],
complete: bool}`, where each failure is `{code, parameter | None}` using the
action's declared failure codes or CONTRACT-068 parameter rule names. `complete`
is false when the target can report only the first failure (for example an engine
preview that stops early). Raw-table targets run Weft's validate-only program in a
transaction that always rolls back (Weft WR-B4); Truss maps its preview operation.
A valid result is advisory: state can change before `invoke`.

### Timeouts

Every generated query, stream, action and bulk call accepts `timeout:
timedelta | None`. `None` uses the target's configured `default_timeout`; targets
MUST be constructed with a default, so no call runs unbounded. The runtime applies
the deadline natively (`SET LOCAL statement_timeout` inside the transaction on
Postgres and Lakebase; the driver's query timeout and cancellation on Databricks
and Spark) and also enforces it client-side.

- A read that exceeds its deadline raises `QueryTimeout`; no partial result is
  returned.
- An action or bulk call whose deadline expires before the commit is sent is
  cancelled and rolled back. Its outcome is `TimedOut`: **nothing was committed**.
- If the deadline expires after the commit was sent, the outcome is decided exactly
  as for a lost connection (CONTRACT-073): reconciled to `Committed` or
  `Conflict` on Postgres and Lakebase, otherwise `Indeterminate`.
- `Indeterminate` is therefore the only outcome in which a timed-out write may have
  committed.

### Composing actions

Each action is one atomic unit on one store (CONTRACT-900); the runtime offers no
transaction spanning several action calls. Changes that must commit together, such
as a note and its reminder, are authored as one action whose recipe has several
effects. On raw tables that action runs as one transaction under CONTRACT-073.

### Streams

A declaration ending in `.page(...)` also generates a `<name>_stream(target, ...,
max_rows: int, page_size: int | None = None)` function that yields typed rows
across pages until the result is exhausted or `max_rows` is reached; `max_rows`
is required and has no fixed ceiling. It is the documented path for exports larger
than one page. On `postgresql` and `lakebase` the stream reads every page inside
one `REPEATABLE READ READ ONLY` transaction on the host connection, so the stream
sees one consistent snapshot; on `unity-catalog` and `spark-delta` it uses
snapshot pages. Each page still obeys the 1,000-row page bound; the timeout applies
per page.

### Async targets

Each protocol has an async counterpart (`AsyncReadTarget`, `AsyncActionExecutor`,
`AsyncReplayingActionExecutor`, `AsyncBulkTarget`) with the same semantics and
`async def` methods, and `RowStream` has an async iterator form. Generated catalog
functions and action clients are overloaded on the target type: a sync target
returns a value, an async target returns an awaitable of the same type, so one
generated package serves both. In 0.1 the async raw-table adapters are
`AsyncPostgresTarget` and `AsyncLakebaseTarget` over psycopg 3's async connection;
other targets are sync only until their drivers' async support is qualified.

### Outcomes

`ActionOutcome` is exactly one of:

| Outcome | Meaning | Generated client behavior |
| --- | --- | --- |
| `Committed(output, receipt, created, changed)` | Business change committed; `created` and `changed` are the Keys of entities the action created and changed (CONTRACT-900 `identities: created-and-changed`) | Returns typed output, receipt and Keys |
| `Rejected(code)` | Declared business failure (a false precondition, or CONTRACT-901 `ENTITY_MISSING`); no change | Raises `<Action>Rejected` |
| `Denied` | Authorization failure, including a failed in-program role check; no change | Raises `ActionDenied` |
| `Replayed(original)` | Equal retained request under an idempotency key; the original outcome is returned | Returns or raises the original |
| `Conflict(retained: bool)` | Concurrency or serialization failure; nothing committed | Raises `ActionConflict(retained)`. `retained=False`: the caller may retry as a new attempt. `retained=True`: a durable tx/1 conflict recorded under an idempotency key; terminal for that key |
| `TimedOut` | Deadline expired before the commit was sent; rolled back, nothing committed | Raises `ActionTimedOut` |
| `Indeterminate` | Commit outcome unknown and not reconcilable (CONTRACT-073) | Raises `ActionIndeterminate`; never retried automatically |

Two failures are raised by the executor rather than returned as outcomes:

- `ActionRefused(code)`: the request was refused before any statement was sent.
  `code` is a CONTRACT-073 code (for example `NATIVE_PROFILE_UNSUPPORTED`,
  `ROLE_MAPPING_MISSING`, `TRANSACTION_STATE`) or the code of a tx/1 `unsupported`
  or `expired` result. Nothing changed.
- `ActionFailed(code, cause)`: execution started and was rolled back with a known
  outcome: a postcondition false or erroring, a constraint violation, another
  native error during the program, or a tx/1 `failed` result. `cause` wraps the
  native exception unchanged; for engines `code` is the engine's code. Nothing
  committed.

CONTRACT-901 tx/1 results map to these as follows. Executors for engines that
speak tx/1 (CONTRACT-069) MUST use this table; raw-table executors produce the
same outcomes from native signals (CONTRACT-073).

| tx/1 status | SDK result |
| --- | --- |
| `committed` | `Committed(output, receipt)`; `Replayed(Committed(...))` when the executor's result identifies a retained replay |
| `rejected` | `Rejected(code)`; `Replayed(Rejected(code))` when identified as a replay |
| `conflict` | `Conflict(retained=True)` when the request carried an idempotency key (for example `EXPECTED_VERSION` recorded under the key, or `TOKEN_REUSE`); otherwise `Conflict(retained=False)` |
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
| `ManifestBulkPlan` | Truss (CONTRACT-069) | `preview()`; `seal() -> Manifest`, a sealed CONTRACT-903 manifest; `submit(manifest) -> BulkJob`, which hands the sealed manifest to CONTRACT-904 coordination and returns the job reference and its reported status. Host workers run the batches through the engine; the SDK runs no worker loop. There is no `execute()` |

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
| `TargetMismatch` | Version, identity or shape differs from pins, result columns are inconsistent, or a schema-neutral table resolves unexpectedly |
| `QueryTimeout` | A read or stream page exceeded its deadline |
| `ActionTimedOut` | Outcome `TimedOut`: deadline expired before commit; nothing committed |
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
