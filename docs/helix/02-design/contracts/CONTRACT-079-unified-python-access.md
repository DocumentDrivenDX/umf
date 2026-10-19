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
WriteOutcomeUnknown; cancellation while awaiting a dispatched write does too.
Read cancellation propagates normally. The client never retries writes automatically.
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
