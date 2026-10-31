---
ddx:
  id: CONTRACT-079
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: informed_by
    - id: SD-033
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: ADR-006
      kind: references
    - id: CONTRACT-080
      kind: references
---

# CONTRACT-079: Unified generated Python access

This contract describes the implemented initial Python surface for UMF 0.10.0.
FEAT-033 retains the broader requested behavior; this contract does not claim
completion of every Praxis requirement. SQL compilation belongs to Weft.

## Generation

`generatePythonClient({text, format?, package, records?, actions?})` accepts
current UMF source, optionally selecting records/actions by module and ID. It
returns an exact source SHA-256, JSON description and deterministic file bytes
and hashes. No access-view declaration is required. Keyed records are selected
by default; identities must be unambiguous. Required dependency keys are emitted
without granting queries on unselected records. Unsupported selected meanings
and generated name collisions fail before producing output. Original source
bytes are retained in `source.json`; semantic references are metadata, without
an implied vocabulary validator.

The generated package uses Python 3.11+ standard library imports only. It ships
frozen row/key dataclasses, typed columns, relationship builders, Actions,
transport protocol, exact codecs, `py.typed`, description and inventory manifest.
The host CLI reuses the existing atomic writer and read-only drift checker.

### Rust production host-read profile — `umf.python-client-host-read/4`

The Rust-backed production `generatePythonClient` export remains synchronous
after module import. Its Node/Bun addon or browser WASM asset MUST initialize
before that export is callable; a missing, damaged or incompatible asset MUST
refuse loading rather than execute a second semantic implementation. V3 remains
an opt-in historical profile. V4 is an explicit behavior change for host-read
resource admission, not a claim of byte-for-byte parity for every hostile
JavaScript request object.

Rust drives the checkpoints in this order: initial package admission; source
text and format parsing; source digest text; record selection; conditional
native format; action selection; output package suffix and source text in their
existing construction order. Later request properties MUST NOT be read early.
For each non-null selected record/action list, V4 captures its array identity
and length once, counts sparse positions, and refuses a raw length over 10,000
records or 1,000 actions before reading any position. V4 traverses the captured
positions with intrinsic indexed reads rather than invoking a caller-supplied
`map` or iterator. Appends beyond that length are ignored; changes to unread
positions remain observable. Each resulting selected identity string is frozen
before a control-meter callback can mutate a later position. The combined text
of those strings, including duplicates before deduplication, MUST NOT exceed
4,000,000 UTF-16 units across both selections. This changes the prior result
for a long duplicate list that deduplicated to an allowed selection, and for
custom `map`/iterator behavior. No selection is silently truncated.

The first raw or combined-text excess refuses with code `RESOURCE_LIMIT`,
message `V4 host-read resource limit exceeded`, and path `/records` or
`/actions` for the event that crosses the limit. After each bounded host read,
the binding charges the same invocation context before copying or inserting
the value. Responses use at most 8,192 UTF-16 units per primitive ASCII frame;
Rust verifies call token, offset, count and digits before allocating the next
frame. Work and constraint counters, cancellation and deadline controls carry
across all events and frames. `HardIsolated` refuses before any request callback.
The source-text limit remains governed by core admission; V4 adds no blanket
ceiling to other computed strings. Arbitrary getters, coercions and Proxy traps
remain cooperative host work, without a hard memory or preemption guarantee.

A host read that throws stores the original value call-locally without
inspection or stringification, sends only a closed abort marker to Rust, and
rethrows that identical value synchronously before result conversion. Meter,
cancellation and deadline failures retain their own provenance and publish no
partial success. Exact source-cohort, selected boundary, mutation, counter and
installed-host evidence is required before making V4 the default package route.

## Application surface

```python
from decimal import Decimal
from shop import Actions, Client, Customer, CustomerKey, Order, OrderKey

async def application(client: Client):
    order = await Order.objects.using(client).get(OrderKey(order_id="o-100"))
    customer = await (
        Order.objects.filter(Order.c.amount >= Decimal("24.50"))
        .by_key(OrderKey(order_id="o-100"))
        .related(Order.c.customer).using(client).first()
    )
    orders = await (
        Customer.objects.using(client).by_key(CustomerKey(customer_id="c-1"))
        .related(Customer.c.orders).all(limit=100)
    )
    receipt = await Actions(client).ship_order(order=OrderKey(order_id="o-100"))
    return order, customer, orders, receipt
```

`objects` is immutable and has no global connection state. `filter`/`where`,
`order_by`, `by_key` and `related` compose inert expressions. Columns provide
`.eq`, `.ne`, comparisons, `.starts_with`, `.is_null`, `.asc` and `.desc`.
Combine predicates with `&`, `|` and `~`. Record ownership is checked statically
and at runtime. Equality is explicitly `.eq(value)`.

Both scheduling modes expose the same terminals: `get(key)`, `get_many(keys)`, `first()`, `one()`,
`page(size=100, after=None, at_least=None)` and `all(limit=100, at_least=None)`.
`get_many` preserves input order, duplicates and missing slots. Limits are
bounded at 100. `all` refuses truncation; `one` requires exactly one result.
Paging returns `Page.items` and an opaque `next_cursor`. A host must bind cursors
to the source, query and ordering. Freshness requests refuse when unsupported.

Actions expose keyword-only typed parameters. Entity parameters use generated
keys. Recipe Actions with no business outputs are admitted in this initial cut.
The host executes actions; the client does not interpret effects. Receipts carry
typed created/changed keys, counts, consistency token and `output=None`.
Idempotency keys are forwarded; the authoritative host determines replay support.

## Transport boundary

The application constructs `Client(transport)` or its explicit alias
`AsyncClient(transport)` for the existing async API. `SyncClient(transport)`
accepts a synchronous `SyncTransport.execute(request) -> Mapping`;
`AsyncTransport` aliases the existing async `Transport`.
`Model.objects.using(sync_client)` returns a typed SyncQuery with synchronous
terminals; an async binding returns Query with awaitable terminals.
`SyncActions(sync_client)` exposes synchronous action methods; AsyncActions
aliases Actions. Cross-mode query rebinding is rejected rather than performing
implicit event-loop work. Models, keys, predicates, codecs and wire envelopes
are shared. Sync execution does not run or schedule a coroutine.

Both transports return a mapping. Every request and response carries the exact source
digest as `schema`; requests also carry `contract: "umf.access/1"`.

- Read: `kind: "read"`, query, size, after, at_least. Query has record ID,
  filters, order and optional key/source/relationship. A relationship identifies
  module, ID and forward/inverse direction. Response has rows and optional cursor.
- Action: `kind: "apply"`, action ID, inputs, idempotency_key. Response has
  created/changed arrays of `{record, key}`, counts and consistency_token.
- Error: `{schema, error: {code, field?, precondition?}}`. Known codes are
  INVALID, DENIED, CONFLICT, PRECONDITION_FAILED, TOO_MANY_ROWS, LIMIT_EXCEEDED, BUSY,
  UNSUPPORTED, SCHEMA_MISMATCH, WRITE_OUTCOME_UNKNOWN, NOT_YET_CURRENT and
  INVALID_CURSOR. Unknown/malformed responses fail closed.

Integers and decimals use `integerToken` / `decimalToken` tagged strings;
UUID uses `uuid`; bits128 uses exactly 16 bytes encoded as `bits128Hex`;
binary uses `binaryHex`. Dates use `date`, exact timestamps use `timestamp`.
Python carriers are int, Decimal, UUID, bytes, date and ExactTimestamp respectively.
Missing is an explicit sentinel distinct from None. No numeric carrier uses float.

Read transport failures are sanitized. A lost action response raises
WriteOutcomeUnknown. Cancellation propagates as the original cancellation, with
per-invocation write uncertainty available through `write_outcomes_unknown` as
specified below. Read cancellation adds no write uncertainty. The client never
retries writes automatically.
`PreconditionFailed.precondition` preserves the refusal identity separately from
`field`; exception messages contain only the fixed error code. Authorization,
atomic commit, idempotency storage and freshness are host responsibilities.

## Binding ownership and evidence

`umf_access.unified.WeftTableBinding` adapts these same requests through existing
public DSL rendering and Weft `compile_raw_read_json` /
`compile_related_read_json`. The host supplies the native binding, target,
compiler and execution/action callbacks. Original UMF source is passed unchanged.
No second SQL compiler is generated or embedded in the client.

The graph fixture implements the transport independently with nodes and edges.
Native qualification currently covers PostgreSQL 18 and the isolated Weft build
with UMF 0.10 admission, UUID and bits128. See the [execution evidence](../../04-build/evidence/unified-python-access.md)
for commands, coverage and feature requirements that remain open.

## Proposed native per-call session surface (P1-04)

The native session adapter qualifies Psycopg 3 connections independently of the
portable generated API. `SyncWeftTableBinding` shares the async binding's pure
compilation, wire checks and cursor rules; synchronous callbacks MUST NOT be
coroutine functions. Neither scheduling surface runs an implicit event loop.

`SessionIdentity(kind, subject)` requires explicit `person` or `batch` and a
nonempty host-authenticated subject. `SessionPolicy(people, batches, schema,
statement_timeout_ms=30000, lock_timeout_ms=5000)` copies both registries;
subjects map to native roles. Person and batch role sets MUST be disjoint.
Timeouts are integers from 1 through 300000 ms. Schema and role identifiers
must be nonempty, NUL-free and fit PostgreSQL's 63-byte bound; plugin schemas
cannot use the system `pg_` prefix. These inputs are trusted host configuration,
never generated wire parameters. Registry membership grants role selection;
the host remains responsible for authenticating the subject.

`SyncSession(factory, policy, transaction_owner="adapter")` and its async
counterpart accept explicit ownership `adapter` or `caller`. They call the
factory with the identity once per `open(identity, read_only=True)` operation.
The factory returns a lease context manager for a caller connection or host
pool. The adapter MUST NOT own a global pool, change autocommit, reuse a
connection concurrently within one adapter or use an inherited post-fork pool.
Construct sessions and pools in each child process. Separate adapters MUST NOT
lease the same connection concurrently; that is the factory's responsibility.

Adapter ownership requires an idle connection and opens a transaction, committed
on success and rolled back on any failure. Caller ownership requires an already
healthy transaction and opens a savepoint;
the adapter MUST NOT commit or roll back its outer transaction. A read lease
sets a new transaction read-only or requires an existing outer transaction to
already be read-only. Failed transactions and unsupported states MUST refuse.
Session role, row_security=on, pg_catalog-first plugin search path and both
timeouts are transaction-local. The adapter verifies effective role and rejects
superuser/BYPASSRLS authority before dispatch and before successful release.
The effective session user and normalized configured setting values MUST remain
unchanged during execution; any change MUST refuse and roll back the lease.
Successful savepoint release explicitly restores the caller's previous values;
rollback restores them after failure. Native ownership/privilege containment and
compiler catalog obligations remain separate executor checks.

`session_binding.SyncSessionTransport` / `AsyncSessionTransport` compose the
native lease with a Weft binding. Read executors receive `(connection, artifact,
original_request)`; action executors receive `(connection, action, inputs,
idempotency_key)`. Executors MUST enforce all Weft obligations, MUST NOT change
transaction ownership or session identity, and MUST NOT retry writes. Missing
action executors refuse. This composition does not qualify an arbitrary callback
as a Weft action implementation. Every error response rolls back the lease
before returning. Session refusal maps to DENIED; native read failure maps to
BUSY; uncertain action completion maps to WRITE_OUTCOME_UNKNOWN. Async task
cancellation propagates after shielded transaction and pool cleanup. Failed
transaction cleanup closes the connection before pool release. A factory MUST
discard closed/broken connections. Cancellation does not prove a dispatched
write did not commit, and MUST NOT cause automatic retry.

`SessionPolicy.cursor_secret(identity, root_secret)` derives a stable authority-
and policy-bound cursor secret from a host root of at least 32 bytes. Person,
batch and differently configured policy sessions MUST NOT accept one another's
page tokens. The generated wire protocol is unchanged. Native driver support
is qualified separately from full artifact execution and managed Lakebase.

`Psycopg2Session` accepts synchronous Psycopg2 2.9 connections with the same
factory, policy and ownership contract. Adapter ownership uses the driver's
transaction context, including autocommit connections; caller ownership MUST
use a library-named savepoint rather than the driver's connection context, which
would commit the outer transaction. `open` yields the original connection.
Psycopg2 async connections refuse; async access uses Psycopg3.

`SQLAlchemySession` and `AsyncSQLAlchemySession` accept SQLAlchemy 2 Core
Connection/AsyncConnection leases with PostgreSQL Psycopg drivers. They MUST use
SQLAlchemy `begin`/`begin_nested` and `exec_driver_sql` for session control,
preserving SQLAlchemy transaction bookkeeping. Reading native driver state is
permitted for admission; raw driver commit/rollback is forbidden. Driver and
SQLAlchemy transaction states MUST agree. DBAPI autocommit refuses, since a
SQLAlchemy transaction object alone does not establish a native transaction in
that mode. This adapter MUST NOT change isolation level or autocommit. Async
supports the Psycopg3 driver; ORM Session and other dialects/drivers refuse.
`open` yields the original Core connection. Failed cleanup MUST invalidate the
SQLAlchemy connection before it can return to the engine pool. Existing
cancellation shielding and person/batch policy apply without an event-loop
bridge. These contracts are not qualification evidence; exact native results
and bounded parameter transport are recorded separately.

Native semantics references: [Psycopg transaction contexts](https://www.psycopg.org/psycopg3/docs/basic/transactions.html),
[async cancellation](https://www.psycopg.org/psycopg3/docs/advanced/async.html),
and [PostgreSQL 18 SET ROLE](https://www.postgresql.org/docs/18/sql-set-role.html).
Driver-specific references: [Psycopg2 transaction contexts](https://www.psycopg.org/docs/usage.html#with-statement),
[SQLAlchemy Core transactions and autocommit](https://docs.sqlalchemy.org/en/20/core/connections.html),
and [SQLAlchemy async Core connections](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html).

## Historical proposed installed Python generator (P1-05; superseded)

The MiniRacer/V8 implementation direction in this section records the P1-05
proposal and its earlier evidence. ADR-006 and the R4 Rust migration supersede
that engine choice for current source and future releases. The byte, refusal,
CLI writer and drift-check obligations below remain migration comparisons;
the embedded-V8 and no-executable-fallback requirements are historical and
do not govern the native Rust successor.

`umf_codegen.generate_python_client(text, *, package, format="json", records=None,
actions=None, timeout_seconds=30)` MUST return the same sourceDigest, description,
file paths, complete UTF-8 bytes and hashes as `generatePythonClient` for the same
request. Records/actions use the same module/element and module/action selectors.
Format is `json` or `yaml`. A fresh bounded embedded V8 isolate runs the pinned
portable generator for each invocation; schema content MUST NOT become source
code, select executable imports or access the host. Engine version and packaged
payload hashes MUST match. Deadline is greater than zero and at most60 seconds;
source input is bounded at16 MiB. Refusals preserve portable code/message/path.
Unavailable engines, damaged payloads and deadline/resource failures refuse;
no fallback to an executable or network fetch is permitted.

`python -m umf_codegen generate|check --schema PATH --package NAME --output DIR`
is the authoring entry point; `umf-codegen` is its console alias. JSON is inferred
unless the schema filename ends in `.yaml` or `.yml`. Generation publishes the
complete single-package output, with original-inventory verification before
replacing existing files. Hand edits, untracked output files, unsafe paths or
symlinks MUST refuse; previously compiled catalog files remain separately owned.
Stage then replace, restore the original on failed installation, and retain a
recoverable backup if restoration also fails. Check MUST NOT create, edit or
delete output or lock files; it returns0 for exact bytes and1 for drift/refusal.
Generate returns0 on successful publication and1 on refusal/failure. Argparse
usage failures return2. Concurrent cooperating generators MUST serialize or
refuse; host filesystem races and untrusted concurrent filesystem writers are
outside the authoring boundary. No published release is inferred from this
proposed surface; wheel, sdist and installed parity evidence remain required.


## Native Rust installed-generator successor

`umf-codegen` 0.2.0 source depends on exactly `umf-core` 0.11.0 and invokes
the bundled native UMF CLI from that wheel. The bridge checks the installed
core version, Rust engine/protocol identities, resource manifest and matching
core resource bytes before execution. It has no MiniRacer, V8, Node or Bun
runtime dependency and no alternate executable or semantic fallback. The same
Python call and authoring CLI retain the P1-05 output, refusal and atomic-writer
obligations. A 16 MiB source ceiling, bounded request/response, positive
deadline and native-process cleanup remain explicit host controls. These
source declarations do not establish platform wheel publication; R4/R8
installed-artifact evidence must qualify each distributed wheel and sdist.

## Declared native table operation candidate — 2026-10-19

CONTRACT-081's `module.extensions["umf.tables"].commands` now has a separately
versioned declaration candidate, `umf.table-operation/0.1`. The exact shape is
[`operation.schema.json`](../../../../spec/extensions/tables/operation.schema.json).
This is metadata/type admission, not generated execution qualification. Existing
client generation remains guarded for selected lifecycle modules; Weft's
conditional table-read candidate still refuses nonempty command inventories.

Each declaration has stable `id`, `version`, required typed `parameters`, `body`,
`consistency`, `replay`, and optional write `batch:{maxItems}`. The module owns its
operation; `body.table` names one table ID in that module. Parameters name original
column Fields in the same module. Their logical domain, explicit availability
and native capacity must equal the selected operand/assignment column. Every
parameter is required and used; omitted input and explicit null are distinct.
Unknown versions and unknown members remain recoverable and block complete
interpretation. Invalid recognized declarations are errors. No declaration
contains SQL, a driver name, a connection, role selection or executable code.

A value is `{kind:"parameter",parameter:id}` or
`{kind:"literal",value:CoreLiteral}`. Predicates have explicit `all`, `and/or`
argument lists, `not`, `isNull`, bounded `in`, and field/value `eq/ne/lt/le/gt/ge/
startsWith` forms. Field references identify original Fields of the operation's
single table. `all` intentionally selects every authorized row; bounded writes
must roll back rather than clip effects above their declared maximum. Equality
and inequality use null-safe comparison; ordered comparisons and boolean
composition preserve SQL three-valued semantics. `startsWith` is literal prefix
comparison, never a LIKE-pattern or SQL fragment. Weft must independently admit
and lower every selected predicate before execution; inspection grants none.

Read bodies declare `fields`, `where`, `orderBy`, `result`, `maxRows` and optional
`cursorKey`. Results are `many`, `one`, `optional`, `page` or exact integer `count`.
Projection order follows the explicit Field list. Singleton/count result bounds
are exactly one. Count has no projected fields
or ordering. Row results require nonempty projections. `one` and `optional` must
verify their cardinality; `many` must refuse truncation. A page names an original
Key, orders by its complete component list ascending, and projects every Key
component. The host binds continuation to operation, exact inputs, source,
deployment/ledger generation, verified principal and current role/policy scope.
Statement consistency describes one native statement, never a cross-page
snapshot. Transaction consistency uses the caller's admitted transaction context.

Insert bodies declare `values`, `returning` and `maxRows:1`. Update adds explicit
`where` and a bound; delete has `where`, `returning` and a bound. Assignments are
unique original Fields. Creates must supply required columns unless source
provides a default or generated identity. Ordinary operations cannot assign
identity columns; updates cannot change any original Key, immutable or generated
column. Empty returning lists still return an exact affected count, with no
invented result rows. Upsert additionally declares original `conflictKey`,
`onConflict:"ignore"|"update"`, and `updateFields`. All conflict components are
present in create input. Ignore has no updates; update has a nonempty mutable
whitelist also present in create input. No conflict target is inferred from
observed indexes. Native ON CONFLICT/RETURNING and concurrent races remain gates.

Writes require `consistency:"transaction"` and explicit
`replay:"caller-key-required"|"caller-key-optional"`. Reads use `replay:"none"`
and cannot declare write batches. A write batch applies one declared operation
to at most `batch.maxItems` typed input objects, in one transaction; it cannot mix
modules or invent operations. Batch size is1–1000, parameters0–64, read bound1–1000,
update/delete bound1–10000 and write-single-row bounds are exactly1. The whole
batch is atomic and its durable replay binds the ordered exact inputs plus the
existing CONTRACT-081 authority/principal/generation context. Optional replay
means no automatic retry is safe without a supplied key. Read execution as a
scheduled batch identity is independently controlled by native table policy;
the write-batch shape grants no batch principal authority.

### SDK-owned declared read execution profile

`SyncTableReader` and `AsyncTableReader` accept a host-owned session factory,
approved bundle, committed installation reference, matching original-source
binding and at least256-bit cursor root secret. Each `read` selects an explicitly
authenticated `SessionIdentity` and declared module operation with exact
CoreLiteral inputs. The entry point accepts neither SQL nor compiled programs;
write declarations require a separate durable outcome executor. Selected source,
mapping, configuration and deployment pins MUST match before a lease is acquired.
The installed trusted Weft compiler MUST compile the original source. The host
checks the supported ABI, result and transport profile; it MUST NOT immediately
recompile that same in-process compiler output to prove the compiler's work.
Externally received or persisted programs require checking at their ingress;
this entry point accepts no such programs.

Execution requires the fixed `pg18-read-frame/0.1` Weft guard. The materialized
bounded native read MUST measure uncompressed visible value octets, including
lookahead, against8388608 bytes and fail with SQLSTATE22012 before delivering
an oversized frame. Hidden native sort fields preserve authored ordering without
becoming output Fields. Public aliases/order, arity, exact scalar carriers,
availability and result cardinality are checked. The final serialized wire frame
also has an8388608-byte limit; JSON escaping can increase size beyond native
octets. Either failure returns no partial frame. SQL NULL is represented as
`None` only for an admitted nullable Field. Count is exact nonnegative integer
text wrapped as `integerToken`; integer/decimal/UUID/bits128 results retain their
existing wire wrappers without a floating-point intermediary.

One authenticated, catalog-only, read-only native lease contains a shared module
lifecycle lock, a current installation-head/location check, the selected principal
and declared audience/group scope, and the compiled business read. Full native
catalog/privilege correspondence is an installation or explicit diagnostic check,
not a repeated data-operation prerequisite. The operation does not copy the full
native witness or rescan every table, role and ACL. The shared module advisory
lock remains held through the native transaction lifetime. Native privileges and
forced row policies enforce the business statement. A second full probe after
the statement or an outcome-lock wait is unnecessary under this lifecycle and
operator-quiescence boundary. Adapter-owned transactions complete before return;
caller-owned transactions must already be read-only and retain ownership after
savepoint success or failure. Native PostgreSQL catalogs are trusted server
infrastructure; privileged external DDL/role changes require operator quiescence
under the existing lifecycle contract.

Opaque `umf.table-cursor/0.1` tokens are bounded to16384 characters and use
HMAC-SHA256 with the host's identity-and-session-policy-derived secret. Their
closed payload binds module/operation, target, exact input digest, requested
size, source/configuration/bundle/head/reference digests, schema, verified
principal OID and live declared policy-scope digest to the complete typed key
tuple. The operation scope uses an explicitly versioned digest of the selected
principal, audience role and declared group MEMBER facts, including native OIDs;
it excludes unrelated configured-role and catalog inventories. Older broader
scope hashes safely refuse continuation or receipt metadata matching; an existing
durable outcome slot must not be missed and reexecuted because its scope digest
changed.
The internal digest encoding is explicitly `python-sorted-json/0.1`, not an
RFC8785 or cross-language cursor minting promise. Caller-supplied raw key tuples
are not a continuation interface. A valid cursor grants no snapshot across
pages, and source/principal/policy drift invalidates it. No read execution claim
admits durable writes, generated lifecycle modules or unverified native codecs.

### Durable write outcome protocol

Declared mutation execution and outcome observation are distinct typed results.
A fresh invocation may return its declared business projections plus direct
effect counts. Recovery returns a durable effect receipt with per-item exact
counts and an original response digest. Historical business rows are not retained
in the outcome store. A recovered outcome has an explicit discriminant and no
business-row payload; generated clients must preserve that distinction. This
allows a caller to establish a committed write after a lost response without
turning recovery into a historical-row access path. Fresh reads use their own
current RLS. Caller-owned transaction results remain pending until the caller
commits; an in-transaction receipt is not proof of durability.

The fixed `umf_lifecycle_outcomes` metadata table belongs to the plugin's isolated
schema. Its versioned native shape, owner, forced RLS, constraints, indexes,
policies and ACLs are source-proved during installation and pinned in a
`umf.table-installation/0.2` reference. Each ordinary principal has SELECT/INSERT
on its own outcome rows through native current-role RLS, with no UPDATE/DELETE
grant. Stored payloads carry HMAC-SHA256 authentication using a host-owned key
separate in purpose from cursor tokens; native row ownership alone cannot bless
a forged receipt. The host authenticates the subject outside the wire request.

The keyed slot binds the module, actual principal and authenticated subject,
operation and caller key. It excludes inputs and deployment generation so an
existing slot with changed inputs/source/head/scope refuses instead of silently
executing a second write. A separate invocation digest binds the ordered exact
inputs, original source, configuration, bundle, installed head, target, command
and live declared policy scope. A matching receipt requires current approved
source, installed head/location and selected principal/audience/declared-group
scope under the shared lifecycle lock and operator-quiescence boundary. Receipt
observation uses the outcome table's own current-role RLS and authenticated
payload; it does not rerun full correspondence or probe target-command privileges.
The outcome table's own current-role RLS governs its bounded effect metadata.

The shared generation lock precedes a transaction-scoped exclusive outcome-slot
lock. Competing attempts serialize before observing the slot under READ COMMITTED.
An absent slot permits one atomic invocation and authenticated receipt insert in
the same transaction. A present valid matching slot returns only the observed
outcome. A mismatched or forged slot refuses without mutation. No library retries
a dispatched write. Commit/response uncertainty is explicit and resolved by a
fresh authenticated outcome observation. Receipts have no implicit expiry or
deletion that could turn a retry into a second write. These requirements govern
the pending implementation; no release qualification follows from this contract.

This declaration subset covers single-table projections/counts and scalar
CRUD/upsert operations. Joins/aggregate business outputs, parameter lists,
optional-input omission and cross-operation transactions require explicit wire
extensions and qualification before selection. They are not converted to raw SQL
callbacks. Standard composed queries and graph Actions retain their existing
contracts and independent authority; this native declaration does not reinterpret
a graph-write recipe or authorize a Truss/Ashlar operation.

## Declared native module client candidate

For selected current-core Records owned by `umf.tables`0.1.0 modules, the JSON
source profile emits `Client.modules.<module>.<operation>` and its synchronous
counterpart. Native Records do not also acquire ordinary composed `.objects`
queries. The declared operation owns its keyword parameters, result projection,
cardinality, batch bound and required/optional replay key. Each operation has a
frozen input class and, when projected, a frozen result class. Bulk methods take
a tuple of that operation's input class. Generated names that collide refuse.
Bare table declarations without commands and unsupported selected meanings refuse
before output. YAML native execution is not qualified by this candidate.

The closed `kind="table"` wire carries original source identity, module,
operation, exact CoreLiteral inputs, optional page continuation and explicit
invoke/observe phase. It carries no SQL, connection, role or authentication
claim. `SyncNativeTableBinding` and `NativeTableBinding` mount one approved
module on the existing native session/reader/writer components. Their
`for_identity` transport receives an authenticated registered person/batch
identity outside the request. Every call retains the source check, native
admission, transaction ownership and cleanup contracts above; host query
callbacks are unnecessary.

Read methods return typed tuples, single/optional rows, `Page[Row]` or exact
integer counts. Writes return `Applied[Row] | Recovered`; observations return
`Recovered | NotObserved`. The frozen `status` literal discriminates these
unions. Only applied results have business rows. A malformed/lost mutation
response raises generated `WriteOutcomeUnknown` with the attempted key and
never triggers an automatic retry. Caller-owned durability stays explicit.
BaseException cancellation propagates after the underlying session cleanup.

The portable generator, embedded Python compiler and actual Chromium emit the
same deterministic package. The native packet in the implementation plan records
the scoped six-driver PG18 evidence; generation alone keeps
`nativeExecutionQualified=false`. Remaining native codecs, constraints,
seed/evolution and full consumer/cohort publication gates remain independent.


## Graph client adoption contract — 2026-10-20

### Source and naming

Only current UMF declarations are generated. Nonempty `module.actions` or
`module.extensions["umf.ddd"].actions` are unsupported legacy action content and
MUST refuse with ACCESS_UNSUPPORTED and the original path, even beside standard
actions. Hohfeld/Praxis owns conversion; changing `umf` alone is insufficient.
Malformed standard action inventories, unknown action-payload qualifiers and
unsupported action vocabulary versions also refuse before output. Malformed
action entries, ambiguous qualified action identities and Python-normalized
parameter name collisions refuse with their original source paths.
The example `tests/unified/adoption.json` is a canonical current-format source.

Record identity is `module.id + "." + record.id`; action identity is
`module.id + "." + action.id`. Field and parameter map keys are exact authored
IDs, never inferred name casing or prefixes. A field ID may itself contain dots.
Entity inputs and affected keys use exact generated-key component maps. Each
created/changed wire item is `{record: qualifiedRecordId, key: fieldIdMap}`.
Counts map exact host counter names to nonnegative integers. Tokens are opaque
nonempty strings scoped by the host to issuer/module/source and authority.
The description publishes wire `errorCodes`, separate `localErrorCodes`,
`limits.batchItems:100`, named action preconditions and supported client operations.
`LOCAL_ERROR_CODES` exposes the same local inventory in the generated package.
Local categories include `LIMIT`, `TYPE`, `KEY_TYPE` and `REQUIRED`; they report
client admission/codec/response failures and do not add permitted wire refusal
codes. In particular, local `LIMIT` and host `LIMIT_EXCEEDED` retain their existing
separate meanings. The generator's shared `MAX_BATCH_ITEMS` supplies both the
runtime snapshot check and published batch limit. Unknown host capabilities refuse;
client method availability is not native execution qualification.

### Typed actions and conditions

Each action emits `<ActionName>Input`, a frozen keyword-only dataclass suitable
for a batch, and `<ActionName>Precondition`, a string Enum of condition IDs
(uppercase normalized member names; collisions refuse). Error.precondition carries
the stable string ID and compares with these enum values. A supplied wire
precondition ID MUST belong to the invoked action's declaration, for apply,
advisory validation and batch refusal items. Unknown IDs are malformed responses:
write admission preserves uncertainty and key; validation raises INVALID_RESPONSE.
The exception field remains `str | None`, preserving its existing shared error
ABI rather than introducing action-specific exception types. Declared failure codes
remain in description.actions[action].declaration; PRECONDITION_FAILED is the
wire category, not a replacement for the condition identity. Conditions use
rules/1 `exists` over a declared key-selected read frame; absence is `not(exists)`.
The generator does not evaluate business conditions. Optional graph-write/2
assignment semantics are defined by CONTRACT-900.

### Advisory validation

`Actions.<name>_validate(**inputs)` and SyncActions counterpart send
`{kind:"validate", action, inputs}`. They return `ValidationResult(valid=True)`
only for `{schema, valid:true}`. A recognized error is raised as the same typed
refusal as apply; invalid or pending-shaped validation successes refuse. Validation
performs no mutation, reserves no key/token and provides no future guarantee.
Apply must recheck authorization and conditions at execution. No idempotency key
or commit token is issued by validate.

### Batch invocation and settlement

`Actions.<name>_batch(items: Sequence[<ActionName>Input], *, atomic=False,
stop_on_error=False, idempotency_key=None)` returns `BatchReceipt[Key, None]`.
The wire request is `{kind:"apply_batch",action,items:[inputMap,...],atomic,
stop_on_error,idempotency_key}`. Validate every item and flag before dispatch;
1–100 items, all of the exact generated input class, are required. Snapshot
iteration is bounded and the actual snapshot must satisfy this limit even when
a caller-supplied sequence reports an inconsistent length. The host
must reject unsupported modes before effects. The key covers the entire ordered
batch and flags; no automatic retries, chunking or client-side single-call loops.

Success is `{schema,status?:"committed",items:[outcome,...],consistency_token}`.
There is exactly one ordered outcome per input, with status:
`applied` plus `receipt:{created,changed,counts}`; `refused` plus `error`;
`rolled_back`; `unknown`; or `unattempted`. Refusals use the shared wire errors;
unknown uses no invented rollback. A batch token identifies the settled committed
cut, including the no-effect cut for a fully refused batch. All applied item
receipts use that same token. The token covers confirmed applied items; it
proves neither commit nor rollback for an unknown item. Atomic settlement is either all applied or contains
no applied/unknown items. A lost or malformed atomic outcome raises uncertainty.
Partial settlement may explicitly carry unknown items. With stop_on_error, the
first refused/unknown item ends attempted work; all later items are unattempted.
Without stop_on_error, unattempted items are invalid in both atomic and partial
settlement. In either mode, unattempted is permitted only as the complete suffix
immediately after the first refusal (or first unknown in partial mode), with
stop_on_error enabled. Leading unattempted items, gaps and resumed attempted work
are invalid. This deliberately tightens previously underspecified atomic preflight
ordering; hosts must return explicit refusals/rolled_back outcomes instead of
unattempted outcomes when stop_on_error is disabled.
An uncertain atomic commit MUST be returned as the whole-response
`{schema,error:{code:"WRITE_OUTCOME_UNKNOWN"}}` envelope, never per-item unknown
statuses. The client rejects an all-unknown atomic item list even without an
idempotency key; `.key=None` honestly preserves the caller's omitted key.
Atomic rolled_back items represent work undone with the complete batch; atomic
failures require at least one refusal. An unknown/unreadable whole response raises
WriteOutcomeUnknown rather than fabricating per-item conclusions.

### Commit acknowledgement and uncertainty

A successful graph apply envelope is a host acknowledgement that its transaction
committed. Optional `status:"committed"` makes that acknowledgement explicit;
omitting status retains the original umf.access/1 success meaning. Any other
status (including pending) is not a successful Receipt. Receipt.status is always
`"committed"`. Hosts with caller-owned uncommitted transactions must withhold a
graph success response until commit or report WRITE_OUTCOME_UNKNOWN. The separate
native table `Applied`/`Recovered` protocol retains its explicit durability model.
A consistency token issued before commit must never be encoded as graph success.

After dispatch, transport exceptions (including arbitrary AccessError exceptions),
wrong-schema responses, malformed error envelopes, missing/invalid
receipt fields or pending statuses raise WriteOutcomeUnknown carrying `.key`.
Only a well-formed matching-schema known-code error envelope acknowledges a refusal
without effects; WRITE_OUTCOME_UNKNOWN explicitly acknowledges uncertainty.
Local pre-dispatch type/bound errors retain their local error category. Reads and
validation retain ordinary transport/response errors. No client retries writes.

Graph success requires `created`, `changed`, `counts` and `consistency_token`,
including explicit empty `[]`, `[]` and `{}` collections when appropriate. Missing
collections must not default to empty. Only wire `status` is optional for legacy
committed acknowledgement; omission of a receipt field still means uncertainty.

Post-dispatch `asyncio.CancelledError` is a separate control-flow case: both
async and sync transports MUST propagate the original cancellation object and
class. The client MUST append a fresh WriteOutcomeUnknown with the invocation
key to private per-exception metadata before re-raising. This applies even when
the transport raises cancellation spontaneously and no task was cancelled.
The client MUST NOT clear cancellation state, replace cancellation with another
exception, retry, or claim commit/rollback. Before dispatch, cancellation creates
no new uncertainty annotation. Reads and validation likewise add none.

Every generated package exports:
`write_outcomes_unknown(error: BaseException) -> tuple[WriteOutcomeUnknown, ...]`.
The helper inspects the exception itself (including a direct WriteOutcomeUnknown)
and its invocation annotations, then follows `__cause__` when present, otherwise
unsuppressed `__context__`. It terminates cycles by exception identity and
deduplicates uncertainty objects by identity, preserving chain traversal and
annotation insertion order. Equal keys do not merge distinct invocations.
Reused/nested cancellation objects retain every annotation. Inspection is
read-only and uses no task-global or client-global last-error slot.
Each helper returns uncertainty objects from its own generated package's runtime
class. Foreign annotations remain intact; when independently generated packages
share a cancellation chain, invoke each involved package's helper to inspect its
invocations. No cross-package nominal exception-type compatibility is implied.

Timeout translation retains the original cancellation as its cause, so inspecting
the resulting TimeoutError recovers its invocation uncertainty. The helper reports
historical uncertainty represented by the displayed chain; it does not declare a
wrapper's own operation uncertain. Explicit `raise ... from None` hides unrelated
context, which the helper does not inspect. Callers must retain a caught exception
or task cancellation exception to inspect it; TaskGroup intentionally suppresses
cancelled children, so callers needing those keys must capture them inside the
child before re-raising. This replaces the earlier cancellation-to-WriteOutcomeUnknown
conversion while preserving ordinary transport error semantics and wire shapes.
`asyncio.gather(..., return_exceptions=True)` may return replacement cancellation
objects without the original annotations. Capture and inspect the original inside
each child when using combinators that suppress or replace child cancellation;
inspection cannot reconstruct metadata from a replacement exception.

For TaskGroup callers, retain uncertainty inside each cancelled child before its
cancellation is suppressed. The application owns this recovery collection and
its lifetime; the generated client keeps no outstanding-writes registry:

```python
retained_unknown_writes = []

async def tracked_write():
    try:
        return await Actions(client).open_project(**inputs, idempotency_key=key)
    except asyncio.CancelledError as error:
        retained_unknown_writes.extend(write_outcomes_unknown(error))
        raise
```

After the TaskGroup exits, inspect `retained_unknown_writes` as well as its
ExceptionGroup. The sibling's exception alone cannot recover a cancelled child's
key. Retaining keys before dispatch is also an application recovery option;
neither approach establishes whether a write committed.

### Platform and integration qualification

The historical P1-05 build required Python 3.11–3.14 and mini-racer 0.14.1.
Current native source builds instead require the pinned Rust/Cargo toolchain and
must install without MiniRacer or a V8 runtime. Declared Python support is
distinct from wheel availability and executed platform qualification.
Before claiming Linux x86_64/aarch64 support across these interpreters, execute
wheel-only installs and compare complete generated bytes for identical exact
source/package/selection and pinned generator payload. Current Bun/Chromium
parity does not prove that platform matrix. Generated packages need only stdlib;
a custom Praxis ontology transport does not require umf_access or a Weft backend.
Link-key projection (100 keys per requested link plus explicit truncation) remains
required separately; current relationship traversal does not satisfy projection.
The wire is versioned experimental integration surface; pin generator/source and
use binding conformance tests. No frozen external stability promise is inferred.
