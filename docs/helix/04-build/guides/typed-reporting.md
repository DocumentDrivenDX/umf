# Typed joins and reviewed reporting SQL

This is the experimental PostgreSQL 18 read profile. [Evidence and limits](../evidence/typed-reporting/README.md) identify the tested versions. Lakebase 18 compiles; service execution is still unverified.

## Build a joined read

Select both Records and a cross-record projection in the stage-one generation request. The generated package exposes the to-one relationship and a typed projection handle, such as `Order.c.customer` and `OrderCustomerProjection`.

```python
import weft                       # build environment only
from shop import Order, Customer, OrderKey, OrderCustomer, OrderCustomerProjection
from umf_access import capture, query, Param
from umf_access.reviewed import build_query
from umf_access.types import StrictModel

class Empty(StrictModel):
    pass

@query
def customer_orders(after: Param[OrderKey | None]):
    return (Order.objects.join(Order.c.customer)
            .order_by(Customer.c.name.asc())
            .into(OrderCustomerProjection)
            .page(size=50, after=after))

joined_entry = build_query(capture(customer_orders), weft,
                    parameters=Empty, result=OrderCustomer,
                    target="postgresql18", binding=binding)
```

The binding is reviewed build input with version `umf.raw-read-binding/0.1`. It retains exact `modelJson` and `modelSha256`, logical-to-native table/column mappings, ordered unique keys and relationship key pairs. Set its `schema` to the app schema for qualified SQL, or `None` for schema-neutral statements. Weft checks the supplied mappings against the actual pinned UMF model and refuses unsupported forms before producing a catalog.

Selected PostgreSQL text-search bindings additionally require the explicit original catalog fence and deployment prerequisites in the [fence guide](native-postgresql-fences.md). Configuration-free reads are unchanged by that requirement. The successor fence profile remains a candidate until its exact installed/native cohort passes.

The default join is inner for required relationships and left for optional relationships. `how="inner"` and `how="left"` select either explicitly. Joins are limited to three declared to-one edges. Named projection handles keep the projection's owning root in the type system; an unrelated projection is rejected by all three checkers.

For Truss `@command` catalogs, the separate [manifest command guide](truss-manifest-commands.md) describes original portable plan custody and the engine-owned provider boundary. It does not grant mutation authority to a reporting target.

## Build a reviewed aggregate

```python
from decimal import Decimal
from umf_access.reviewed import ReviewedSQL

class Parameters(StrictModel):
    minimum: Decimal

class Totals(StrictModel):
    status: str
    total: Decimal | None
    count: int

statement = ReviewedSQL('''
    SELECT o.status AS status, sum(o.amount) AS total, count(*) AS count
    FROM "commerce"."Order" AS o
    GROUP BY o.status HAVING sum(o.amount) > :minimum
    LIMIT 100
''', Parameters, Totals, row_cap=100)
entry = statement.build(weft, target="postgresql18", binding=binding)
```

SQL names are authored logical names, not Python aliases or native table names. Parameters and output aliases must match their strict models. The closed reviewed-SQL profile admits count/sum/avg/min/max, grouping and aggregate comparisons; it refuses unsupported expressions and side-effecting functions. SQL input misuse is a build-time Weft diagnostic; Python checkers validate parameter/result/projection usage.

Write `entry.artifact_json` into the application's checked-in catalog during the build. Runtime restores it with `CatalogRead(catalog_text, Parameters, Totals)` and never imports Weft or generates SQL from caller input. Catalog hashes detect drift; restore only trusted application artifacts.

## Execute on the caller's connection

```python
from umf_access.postgres_read import execute_read, execute_page, TimedOut

rows = execute_read(caller_connection, entry,
                    Parameters(minimum=Decimal("0")),
                    app_schema="prebill", timeout_ms=2000)

# For the joined page entry above:
page = execute_page(caller_connection, joined_entry, Empty(),
                    app_schema="prebill", timeout_ms=2000)
next_page = execute_page(caller_connection, joined_entry, Empty(),
                         app_schema="prebill", after=page.next_after,
                         timeout_ms=2000)
```

Pass the host's existing idle per-user psycopg connection. The SDK creates no pool, switches no role and requires no stored code in the app schema. PostgreSQL evaluates every joined scan and aggregate under the caller's role and native RLS. Native identity/grant/policy deployment remains the host's responsibility. The read-only transaction, deadline, row cap and timeout recovery apply to every form. Pages are live keyset reads; a full final page may yield a continuation whose next page is empty.
