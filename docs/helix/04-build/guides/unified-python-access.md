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
