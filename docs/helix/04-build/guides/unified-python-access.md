# Generate and use one Python API

Generate from the UMF schema you already have (UMF 0.10.0):

```sh
bun scripts/umf-client-generate.ts generate --schema tests/unified/commerce.json --package shop --output /private/tmp/my-shop-client
bun scripts/umf-client-generate.ts check --schema tests/unified/commerce.json --package shop --output /private/tmp/my-shop-client
```

Put the output directory on Python's import path. The generated package needs
Python 3.11+ and no installed dependencies. Application code is identical for
a table binding and an ontology binding:

```python
from decimal import Decimal
from shop import Actions, Client, Order, OrderKey

async def ship(client: Client):
    customer = await (
        Order.objects.using(client)
        .filter(Order.c.amount >= Decimal("24.50"))
        .by_key(OrderKey(order_id="o-100"))
        .related(Order.c.customer)
        .first()
    )
    receipt = await Actions(client).ship_order(order=OrderKey(order_id="o-100"))
    return customer, receipt
```

Use `.eq(value)` for equality, `.order_by(Order.c.amount.desc())` for ordering,
`.page(size=50, after=cursor)` for paging and `.get_many(keys)` for bulk key reads.
Relationships expose named forward/inverse attributes; `.inverse()` is also
available. Rows, keys, query results and action signatures are typed.

Construct `Client(your_transport)` at the application boundary. A transport
implements the async execute method in [CONTRACT-079](../../02-design/contracts/CONTRACT-079-unified-python-access.md).
For tables, use `umf_access.unified.WeftTableBinding` on the host; pass Weft,
the native binding and your database execution/action callbacks. The runnable
[test adapter](../../../../tests/unified/table_binding_e2e.py) shows the complete
PostgreSQL setup. The [graph fixture](../../../../tests/unified/ontology_transport.py)
shows an independent ontology transport. It is test support, not a production
ontology integration.

The compiler lives in Weft. Generated Python builds schema-referenced requests;
the host authorizes and executes them. Backend limitations raise typed failures.
The [execution evidence](../evidence/unified-python-access.md) records what is
implemented and tested.

## Synchronous calling mode

The same generated package exposes SyncClient/SyncActions and explicit
AsyncClient/AsyncActions aliases for the existing Client/Actions API:

```python
from shop import SyncClient, SyncActions, Order, OrderKey

def ship(sync_transport):
    client = SyncClient(sync_transport)
    order = Order.objects.using(client).get(OrderKey(order_id="o-100"))
    receipt = SyncActions(client).ship_order(order=OrderKey(order_id="o-100"))
    return order, receipt
```

`SyncTransport.execute(request)` returns a mapping directly. Sync query terminals
and actions return their values directly, including when called from within a
running event loop. No generated code creates/runs an event loop or retries an
uncertain write. Bind an unbound query to the desired mode; changing a query
already bound to the other mode refuses. Keys, fields, relationship builders,
wire documents and error codes are shared. Hosts still own resources and
execution. The async WeftTableBinding retains its existing contract. Native sync/async
session adapters now have scoped local PostgreSQL18.6 qualification. The
remaining production compiler-obligation executor and lifecycle profile remain
release gates; see the exact native receipt below.

The host runtime's Pydantic requirement is >=2.13,<3. Its MISSING compatibility
import uses the actual Pydantic sentinel, preserving absence/null across 2.13.5
and 2.14.1. Generated stdlib-only clients do not require Pydantic. See
[P1 evidence](../evidence/praxis-p1.md) for commands, tested subset and limits.

Use `SyncSession` / `AsyncSession` with Psycopg3, `Psycopg2Session` with
synchronous Psycopg2 2.9, or `SQLAlchemySession` / `AsyncSQLAlchemySession` with
SQLAlchemy2 Core connections. SQLAlchemy sync supports PostgreSQL Psycopg2 and
Psycopg3; async supports Psycopg3. Supply a lease factory per authenticated
identity, such as `lambda identity: engine.connect()`. These adapters never
create an engine or pool. `transaction_owner="adapter"` requires an idle
connection; `"caller"` requires a healthy active native transaction and uses a
savepoint. SQLAlchemy DBAPI-autocommit connections refuse; configure the engine
for transactional use. `open` yields the original driver/Core connection.

Construct `SessionPolicy(people, batches, schema)` from trusted configuration
and `SessionIdentity("person", subject)` or `SessionIdentity("batch", run)`
after authentication. Registries authorize role selection; native grants/RLS
decide rows and commands. `SyncSessionTransport` / `AsyncSessionTransport`
compose sessions with the generated client and trusted Weft artifact executors.
The [native harness](../../../../tests/unified/session_native_e2e.py) currently
uses a bounded fixture executor: Psycopg2/SQLAlchemy generated reads are
parameter-free. Parameterized driver transport, complete artifact admission and
Weft mutations are separate pending work. The
[native receipt](../evidence/praxis-p1/session-native-postgresql.json) records
versions, source hashes, transaction/pool/cancellation checks and these limits.


## Python build entry point (local P1-05 candidate)

The separate `umf-codegen`0.1.0a1 candidate embeds the same portable generator
inside `mini-racer==0.14.1` / V8 14.4.258.23. After installing the candidate
wheel and its pinned runtime dependency, generation needs no Bun, Node, external
JavaScript process or SDK tarball:

```sh
python -m umf_codegen generate --schema plugin.json --package plugin_client --output generated
python -m umf_codegen check --schema plugin.json --package plugin_client --output generated
```

`check` returns nonzero for drift without mutating output. Generation protects
original inventory and refuses hand edits, extra files and symlinks. Use physical
paths with ordinary directory ancestors. Generation uses a cooperating output
lock; a lock retained after process death requires host recovery before retry.
Installation failures restore the old directory; failed restoration retains a
backup and reports its path. Neither command runs schema-selected code.

Programmatic authoring exposes `generate_python_client` with record/action
selections and complete file bytes/hashes. Generated runtime clients keep their
stdlib-only imports. The embedded engine is a build-tool dependency; it is not
required by generated application clients. The wheel and self-contained source
distribution have local macOS arm64 Python3.11 evidence; Linux CI is configured
but not executed, and no new package/index release has been published. See
[P1 evidence](../evidence/praxis-p1.md) for the exact candidate and remaining gates.

## Declared native reader candidate

The unpublished SDK reader executes `umf.table-operation/0.1` read declarations
through the checked Weft compiler and native per-call sessions. Host configuration
supplies the approved original bundle, its committed installation reference and
matching binding. Authentication supplies the identity separately from inputs:

```python
from umf_access.unified import SyncTableReader

reader = SyncTableReader(session, approved_bundle, committed_reference, binding,
                         cursor_secret=host_cursor_secret)
first = reader.read(identity, "list_notes", {"owner": {"string": owner_value}}, size=25)
next_page = reader.read(identity, "list_notes", {"owner": {"string": owner_value}},
                        size=25, cursor=first["cursor"]) if first["cursor"] else None
```

Use `AsyncTableReader` with an async session and await `read`. Existing Psycopg3,
Psycopg2 and supported SQLAlchemy Core session adapters supply all IO; no query
callback or process-global pool is needed. Set `SessionPolicy.catalog_only=True`.
Caller-owned read transactions must already be read-only. Pages use authenticated
opaque continuation, and count/single/optional/many operations preserve their
authored bounds. Returned integer and decimal wire values keep exact tokens.

The same lease checks source-proved live correspondence before and after the
native read. Rows exceeding the authored cardinality or the8MiB native/wire
frame limit fail without partial results. Cursors expire on source/head,
identity, role scope, inputs or size changes; they promise no cross-page snapshot.
This reader is a native execution component. Generated lifecycle module methods,
remaining codecs/evolution and full Praxis/Lakebase acceptance
remain release gates. No complete Praxis prerelease has been published.

## Declared native mutation and outcome candidate

New installations add verified outcome storage and issue a version0.2
installation reference. `SyncTableWriter`/`AsyncTableWriter` use the same
source-approved binding and per-call sessions as the reader:

```python
from umf_access.unified import SyncTableWriter, WriteOutcomeUnknown

writer = SyncTableWriter(session, approved_bundle, committed_reference, binding,
                         outcome_secret=host_outcome_secret)
params = {"id": {"string": note_id}, "owner": {"string": owner_role}}
try:
    result = writer.write(identity, "create_note", params, key=operation_key)
except WriteOutcomeUnknown:
    result = writer.observe(identity, "create_note", params, key=operation_key)
```

Choose a stable caller key when the declaration requires it. Optional-key
declarations can mint a key for the current invocation; recovery after a fully
lost response needs a key the caller retained. There are no automatic retries.
`write_batch`/`observe_batch` take the ordered item list for one declared batch
operation; batch shape does not select batch identity. Only an authenticated
`SessionIdentity("batch", subject)` and its native source grant provide that
authority.

`status="applied"` includes fresh wire projections and a signed direct-effect
receipt. `status="recovered"` includes the receipt without historical business
rows. `status="not-observed"` records an observation, not a future guarantee
that no attempt can commit. Inspect `durability`: caller-owned writes and
recovered receipts stay `pending-caller-commit`. Cancellation propagates after cleanup
and can occur after commit; observe the original key afresh. Effect counts
exclude source-declared native FK cascade effects. Empty RETURNING lists produce
an affected count and no invented business rows.

Receipt authentication requires a host-owned secret of at least32 bytes. Keep
the verifier available for retained receipts; a changed verifier refuses an
occupied slot and cannot silently execute a second write. Native RLS isolates
principal rows, with no ordinary UPDATE/DELETE grant. Source/head/role drift,
changed inputs and forged receipts refuse. Each invocation and its receipt are
atomic;8MiB native RETURNING and cumulative wire bounds fail before commit.
Receipt retention has no implicit expiry. Existing outcome-free version0.1
installations keep head reads and require an explicit storage upgrade for writes.
The administrative upgrade operation for those earlier installations remains a
separate pending lifecycle gate.
These unpublished components still require generated module integration,
remaining lifecycle/codec work and full private consumer/release acceptance.

## Generated declared module clients

The local unpublished JSON-native candidate connects generated module methods
to the SDK-owned executor. Generate from the exact approved bundle source using
`umf_codegen.generate_python_client` or the pinned portable API, then mount it:

```python
from umf_access.unified import SyncNativeTableBinding
from my_plugin import SyncClient, Applied, WriteOutcomeUnknown

host = SyncNativeTableBinding(
    session, approved_bundle, committed_reference, binding,
    cursor_secret=host_cursor_secret, outcome_secret=host_outcome_secret,
)
client = SyncClient(host.for_identity(authenticated_identity))
notes = client.modules.demo.read_many(owner=owner_role)
try:
    outcome = client.modules.demo.create(
        id=note_id, owner=owner_role, idempotency_key=operation_key,
    )
except WriteOutcomeUnknown:
    outcome = client.modules.demo.create_observe(
        id=note_id, owner=owner_role, idempotency_key=operation_key,
    )
if isinstance(outcome, Applied):
    fresh_rows = outcome.items[0].rows
```

Names above follow the public synthetic `demo` declaration; use the generated
names for your own module. With an optional key, retain the chosen key yourself
when recovery must survive a fully lost response. Use `NativeTableBinding` and
`Client` for async sessions and await methods. The transport acquires through
the supplied per-call session factory. `for_identity` does not create a pool or
accept identity from wire parameters. Batch input classes belong to their
specific declared operation; bulk methods use the `_batch` suffix, while outcome
observation uses `_observe`. A batch-capable operation literally named
`create_batch` therefore exposes `create_batch_batch` for multiple items.

Inspect `outcome.status` and `durability`. Recovered results contain effect
receipts without historical business rows. An unobserved receipt is no guarantee
against a still-running attempt. Cancellation can follow commit; use fresh
observation with the same key. Generation currently requires original JSON for
this native profile. The scoped native fixture covers text projections/counts;
remaining exact native codecs, lifecycle evolution and private Praxis/Lakebase
release acceptance remain open. These candidates have not been published.
