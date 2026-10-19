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
execution. The async WeftTableBinding retains its existing contract; native
synchronous Weft/driver adapters and request-scoped session lifecycle are the
next P1 slice, with separate native acceptance gates.

The host runtime's Pydantic requirement is >=2.13,<3. Its MISSING compatibility
import uses the actual Pydantic sentinel, preserving absence/null across 2.13.5
and 2.14.1. Generated stdlib-only clients do not require Pydantic. See
[P1 evidence](../evidence/praxis-p1.md) for commands, tested subset and limits.
