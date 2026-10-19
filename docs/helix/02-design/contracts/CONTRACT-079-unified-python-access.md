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
  INVALID, DENIED, CONFLICT, PRECONDITION_FAILED, TOO_MANY_ROWS, BUSY,
  UNSUPPORTED, SCHEMA_MISMATCH, WRITE_OUTCOME_UNKNOWN, NOT_YET_CURRENT and
  INVALID_CURSOR. Unknown/malformed responses fail closed.

Integers and decimals use `integerToken` / `decimalToken` tagged strings;
UUID uses `uuid`; bits128 uses exactly 16 bytes encoded as `bits128Hex`;
binary uses `binaryHex`. Dates use `date`, exact timestamps use `timestamp`.
Python carriers are int, Decimal, UUID, bytes, date and ExactTimestamp respectively.
Missing is an explicit sentinel distinct from None. No numeric carrier uses float.

Read transport failures are sanitized. A lost action response raises
WriteOutcomeUnknown; the client never retries writes automatically. Authorization,
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

## Proposed installed Python generator (P1-05)

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
