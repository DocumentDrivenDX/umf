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
does not prove the shape stays unchanged after it runs. For action claims, the host supplies pinned `nativeAdmission` descriptors: declared native relation identities, dependency-closure/profile digest, the qualified action-time unchanged-closure fence, authenticated principal/profile correspondence and original writer-incarnation/restore-epoch custody. CONTRACT-073 requires admission at the effect transaction; first-use shape verification is insufficient. Missing or changed proof refuses the affected action. Reconnect must establish original namespace continuity before transaction reconciliation; otherwise return Indeterminate. Native descriptors confer no action or role authority.

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
Engine continuations may additionally retain `owner_cursor: bytes | None`, an
immutable original owner token bounded to 65,536 bytes. Generated functions retain
those exact bytes alongside the typed ordering values. The owner independently
checks their complete current context and agreement with the typed Key before
executing page data SQL. This token is inert navigation custody, never permission;
the SDK must not reconstruct it from display values or discard it during typed
continuation conversion.

The initial call uses `after=None`. Target identity includes the engine's
accepted model/action binding context and, on Ashlar, its publication vector.
The SDK does not promise a cross-page snapshot on mutable raw tables; callers
requiring that property must use an admitted snapshot form below or a qualified shared transaction.
Continuations are process-local, not persisted or authenticated credentials, and
confer no authorization; the engine still admits each read independently.

Pages are live by default: unchanged data traverses without repeats, but a row whose sort value changes can be repeated or missed; inserts/deletes may also alter traversal. A declaration with
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
    def execute_read(self, entry: CatalogVariant, params: BoundParams, *, timeout: timedelta | None = None) -> RowStream: ...

@runtime_checkable
class ActionExecutor(Protocol):
    def invoke(self, action: ActionRef, input: EncodedInput, *, timeout: timedelta | None = None) -> ActionOutcome: ...
    def validate(self, action: ActionRef, input: EncodedInput, *, timeout: timedelta | None = None) -> ValidationResult: ...

@runtime_checkable
class ReplayingActionExecutor(ActionExecutor, Protocol):
    def invoke_keyed(self, action: ActionRef, input: EncodedInput, *,
                     idempotency_key: str, timeout: timedelta | None = None) -> ActionOutcome: ...
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
    def plan(self, entry: CatalogVariant, params: BoundParams, *, timeout: timedelta | None = None) -> PlanT_co: ...
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
timedelta | None = None`. `None` uses the target's configured `default_timeout`; targets
MUST be constructed with a positive finite default, so no call runs unbounded. Explicit negative timeouts refuse before dispatch; zero means an already expired deadline with no dispatch. The runtime applies
the deadline natively (`SET LOCAL statement_timeout` inside the transaction on
Postgres and Lakebase; the driver's query timeout and cancellation on Databricks
and Spark) and also enforces it client-side.

- A page/read that exceeds its deadline raises `QueryTimeout`; no partial page is returned. A stream may already have yielded complete earlier pages: it raises explicitly and never represents the prefix as a completed export.
- An action or bulk call whose deadline expires before the commit is sent is
  cancelled and rolled back. Only positive native/engine proof of original noncommit permits `TimedOut`: **nothing was committed**. A deadline or cancellation request alone, including async task cancellation before COMMIT, is not proof; unresolved cleanup remains Indeterminate and retains original custody.
- If the deadline expires after the commit was sent, the outcome is decided exactly
  as for a lost connection (CONTRACT-073): reconciled to `Committed`, positively established `TimedOut` (original deadline plus aborted status), or `ActionFailed(ABORTED_CAUSE_UNKNOWN)` on Postgres/Lakebase; Conflict requires original explicit concurrency/token evidence. Otherwise it is `Indeterminate`.
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
Raw-table outcomes instead retain `original: NativeOutcomeDetails`, a separate native-profile carrier (not a tx/1 result). It includes exact source/profile, native program result markers and diagnostics, noOp, declared-effect verification, complete CONTRACT-900 net changes (created/updated/deleted entity identities and linked/unlinked association identities), typed created/changed convenience identities, authenticated/effective native attribution, receipt and original transaction/settlement context. Required members must be produced in the qualified atomic program; missing information cannot be fabricated from a later read. Failed/unknown results retain whatever original evidence is available and explicitly mark unknown members. Raw details confer no engine registration/replay/control authority.

`ActionOutcome` is exactly one of:

| Outcome | Meaning | Generated client behavior |
| --- | --- | --- |
| `Committed(output, receipt, created, changed, original)` | Invocation committed, including a net no-op; typed Keys preserve exact declared identity and original engine result | Returns typed output, receipt, created/changed Keys and complete original outcome |
| `Rejected(code)` | Declared business failure (a false precondition, or CONTRACT-901 `ENTITY_MISSING`); no change | Raises `<Action>Rejected` |
| `Denied(code, original)` | Authorization failure, including a failed in-program role check; no change | Raises `ActionDenied` preserving the protected-safe native/engine code |
| `Replayed(original)` | Equal retained request under an idempotency key; the original outcome is returned | Returns or raises the original |
| `Conflict(retained: bool, code, original)` | Explicit concurrency/version/token-conflict result; nothing committed | Raises `ActionConflict` preserving code and complete original result; retained is determined by the original result/protocol, never key presence alone |
| `TimedOut(original)` | Deadline expired and native/engine evidence positively establishes nothing committed | Raises `ActionTimedOut` preserving original classification |
| `Indeterminate(original)` | Original outcome currently unknown | Raises `ActionIndeterminate`; host/engine may reconcile original custody; never retried automatically |

Two failures are raised by the executor rather than returned as outcomes:

- `ActionRefused(code)`: the request was refused before any business effect was committed; read-only admission/preflight statements may have run.
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
| `AtomicBulkPlan` | Raw tables (CONTRACT-073) | `preview(timeout=...)`; `execute(timeout=...) -> BulkOutcome`, where `BulkOutcome` is `{selected, changed, receipt, original: NativeOutcomeDetails}`: the number of selected identities, the number of rows changed and the commit receipt. Failures raise as for actions (`ActionConflict`, `ActionIndeterminate`, `ActionFailed`, `ActionRefused`, `ActionTimedOut`) |
| `ManifestBulkPlan` | Truss (CONTRACT-069) | `preview(timeout=...)`; `seal(*, attempt: ControlAttempt, timeout=...) -> SealControlResult`; `submit(sealed, *, submission_key: str, attempt: ControlAttempt, timeout=...) -> SubmitControlResult`; `recover_control(recovery: ControlRecoveryRef, *, timeout=...) -> ControlResult`. Host workers execute batches through the engine. There is no `execute()` |

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
  classify them as CONTRACT-073 states, wrapping unclassified native errors in `ActionFailed` only after positive known rollback; uncertain settlement remains Indeterminate. Errors never become empty results.

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
| `ActionTimedOut` | Outcome `TimedOut`: deadline expired and positive original evidence proves no commit |
| `NotCompiledForTarget` | No catalog entry matches the target identity |
| `ObligationUnmet` | A Weft host obligation cannot be applied |
| `StaleContinuation` | A continuation was passed to a target whose identity digest differs from the one that produced it |
| `ActionDenied` | Outcome `Denied` |
| `ActionConflict(retained)` | Outcome `Conflict` |
| `ActionIndeterminate` | Outcome `Indeterminate` |
| `ActionRefused(code)` | Refused without committed business effects (read-only checks may run; CONTRACT-073 codes, tx/1 `unsupported` or `expired`) |
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

### Runtime binding and cache safety

The catalog remains schema-neutral. Host construction supplies expected database/store and resolved-relation/schema inventory out of band; it is never inferred from search_path or embedded as schema text in generated SQL. The effective runtime binding context includes database identity/incarnation, exact resolved relation identities and schemas, original security/principal context, and schemaBinding. Continuations additionally retain its digest and snapshot vector, rejecting cross-schema, cross-store or different-admission reuse before dispatch, even when the compile-time catalog identity matches. Snapshot pages bind every relation in a joined query, not just the root.

The cheap resolution check runs on each connection checkout/use-boundary that may change search_path/role, observes effective pg_catalog-first resolution (including temporary-schema shadowing), and rejects unexpected relations. Cached schema results never cache grants, principal admission or action dependency fences. Cross-connection shape-cache reuse requires a qualified host DDL invalidation/immutable-schema obligation; without that proof refresh verification on checkout. Replacing a relation with the same name invalidates the relation-identity key. Native metadata queries and builtin references are pg_catalog-qualified. Missing verification privileges refuse rather than assume identity. No host label alone authenticates a human.

On Spark/Unity Catalog a self-committing mutation statement or atomic-block dispatch is the commit-uncertainty boundary; there need not be a separate COMMIT RPC. Timer expiry, callback error or cancellation after dispatch never proves noncommit. Manifest control deadlines preserve the original control protocol unknown/recovery classifications rather than projecting business TimedOut onto uncertain control state.

Streams require an idle host connection and own only their explicitly opened read-only repeatable-read unit, closing/rolling it back on exhaustion, bound, timeout, exception or async cancellation. An already-active transaction refuses unless the host supplies a separately qualified compatible snapshot wrapper with explicit cleanup ownership; the SDK never commits/rolls back unrelated host work. Stream memory is bounded by page size, not max_rows.

A pooled connection with unresolved cancellation/transaction cleanup is quarantined by the host and cannot be returned for reuse until original native settlement establishes a safe state; no new transaction is opened to mask that uncertainty.
