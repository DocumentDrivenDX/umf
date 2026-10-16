"""Real Weft compilation; native cases run only against an explicit test cluster."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import unittest
from decimal import Decimal
from pathlib import Path
from typing import ClassVar

from umf_access.capture import capture
from umf_access.dsl import (
    Column,
    FieldRef,
    Join,
    JoinProjection,
    Query,
    RecordRef,
    query,
)
from umf_access.postgres_read import (
    ReadObligationUnmet,
    TimedOut,
    execute_page,
    execute_read,
    execute_stream,
)
from umf_access.reviewed import CatalogRead, ReadBuildError, ReviewedSQL, build_query
from umf_access.types import StrictModel


class Compiler:
    def compile_raw_read_json(self, request: str) -> str:
        binary = os.environ.get("UMF_WEFT_RAW_COMPILER")
        if binary:
            return subprocess.check_output([binary], input=request, text=True)
        try:
            import weft
        except ImportError:
            raise unittest.SkipTest("install Weft with raw-postgresql-reads or set UMF_WEFT_RAW_COMPILER") from None
        return weft.compile_raw_read_json(request)

class Empty(StrictModel):
    pass
class Minimum(StrictModel):
    minimum: Decimal
class Totals(StrictModel):
    status: str
    total: Decimal | None
    average: Decimal | None
    smallest: Decimal | None
    largest: Decimal | None
    count: int
class Name(StrictModel):
    name: str

class JoinedRow(StrictModel):
    id: int
    customer: str | None
class Order:
    pass
class Customer:
    pass
OID = FieldRef("commerce", "Order", "id", logical_name="id")
CID = FieldRef("commerce", "Customer", "id", logical_name="id")
NAME = FieldRef("commerce", "Customer", "name", logical_name="name")
ORDER = RecordRef("commerce", "Order", (OID,), logical_namespace="commerce", logical_name="Order")
CUSTOMER = RecordRef("commerce", "Customer", (CID,), logical_namespace="commerce", logical_name="Customer")
CUSTOMER_REL = Join[Order, Customer, int](FieldRef("commerce", "Order", "customer"), CUSTOMER, True)
objects = Query[Order, Order, int](ORDER)
order_id = Column[Order, int](OID)
customer_name = Column[Customer, str](NAME)

class Projection(StrictModel):
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (OID, NAME)
    id: int
    customer: str | None
projection = JoinProjection[Order, Projection](Projection)


def binding(schema: str | None = None) -> dict[str, object]:
    def col(logical: str, carrier: str, nullable: bool = False) -> dict[str, object]:
        return {"logical": logical, "native": logical, "carrier": carrier, "nullable": nullable}
    result = {"version": "umf.raw-read-binding/0.1", "modelSha256": "a" * 64, "schema": schema,
            "tables": [{"logical": ["commerce", "Order"], "native": "orders", "key": ["id"], "columns": [col("id", "integer"), col("customer_id", "integer", True), col("status", "string"), col("amount", "decimal")]},
                       {"logical": ["commerce", "Customer"], "native": "customers", "key": ["id"], "columns": [col("id", "integer"), col("name", "string")]}],
            "relationships": [{"id": "customer", "source": ["commerce", "Order"], "target": ["commerce", "Customer"], "pairs": [["customer_id", "id"]], "toOne": True}]}

    modules = []
    for namespace in sorted({t["logical"][0] for t in result["tables"]}):
        module = {"id": namespace, "namespace": namespace, "elements": [], "relationships": [], "extensions": {}}
        for table in result["tables"]:
            if table["logical"][0] != namespace:
                continue
            rid = table["logical"][1]
            members = []
            for column in table["columns"]:
                fid = rid + "_" + column["logical"]
                members.append({"module": namespace, "element": fid})
                field = {"id": fid, "name": column["logical"], "kind": "field", "cardinality": "one", "scalarType": column["carrier"], "nullability": "absent-allowed" if column["nullable"] else "required", "extensions": {}}
                if column["carrier"] == "integer": field["facets"] = {"integerWidth": {"bits": 64, "signed": True}}
                if column["carrier"] == "decimal": field["facets"] = {"precision": 28, "scale": 6}
                module["elements"].append(field)
            module["elements"].append({"id": rid, "name": rid, "kind": "record", "members": members, "keys": [{"id": rid + "_key", "name": rid + " key", "primary": True, "fields": [{"module": namespace, "element": rid + "_" + k} for k in table["key"]]}], "extensions": {}})
        for rel in result["relationships"]:
            if rel["source"][0] == namespace:
                module["relationships"].append({"id": rel["id"], "name": rel["id"], "directed": True, "source": [{"module": rel["source"][0], "element": rel["source"][1]}], "target": [{"module": rel["target"][0], "element": rel["target"][1], "key": rel["target"][1] + "_key"}], "sourceMultiplicity": {"min": 0, "max": "*"}, "targetMultiplicity": {"min": 0, "max": 1}, "targetLifecycle": "independent"})
        modules.append(module)
    document = {"umf": "0.8.0", "id": "praxis-read-test", "vocabularies": {}, "modules": modules}
    result["modelJson"] = json.dumps(document, sort_keys=True, separators=(",", ":"))
    result["modelSha256"] = hashlib.sha256(result["modelJson"].encode()).hexdigest()
    return result

TOTAL_SQL = '''SELECT o.status AS status, sum(o.amount) AS total, avg(o.amount) AS average,
min(o.amount) AS smallest, max(o.amount) AS largest, count(*) AS count
FROM "commerce"."Order" AS o GROUP BY o.status HAVING sum(o.amount) > :minimum LIMIT 10'''
JOIN_SQL = '''SELECT o.id AS id, c.name AS customer FROM "commerce"."Order" AS o
LEFT JOIN "commerce"."Customer" AS c ON o.customer_id = c.id
ORDER BY c.name ASC NULLS LAST, o.id ASC LIMIT 2'''

class Compilation(unittest.TestCase):
    def test_exact_aggregate_signature_and_round_trip(self):
        entry = ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="postgresql18", binding=binding())
        self.assertEqual(entry.artifact()["outputs"][1], {"name": "total", "carrier": "decimal", "nullable": True})
        self.assertIn("pg_catalog.sum", entry.artifact()["sql"])
        self.assertEqual(CatalogRead(entry.artifact_json, Minimum, Totals).artifact(), entry.artifact())

    def test_left_join_keyset_compiles_bound_nullsafe_continuation(self):
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2, keyset=True).build(Compiler(), target="postgresql18", binding=binding())
        artifact = entry.artifact()
        self.assertEqual(len(artifact["cursorOutputs"]), 2)
        self.assertIn("IS NOT DISTINCT FROM", artifact["sql"])
        self.assertEqual(artifact["obligations"]["principal"], "caller-connection-role")

    def test_dsl_join_projection_reaches_actual_compiler(self):
        @query
        def declaration():
            return objects.join(CUSTOMER_REL).into(projection).limit(10).all()
        entry = build_query(capture(declaration), Compiler(), parameters=Empty, result=Projection, target="postgresql18", binding=binding(), row_cap=10)
        self.assertIn('LEFT JOIN "customers"', entry.artifact()["sql"])

    def test_read_only_and_scope_refusals_happen_at_build(self):
        bad = [
            'DELETE FROM "commerce"."Order"',
            TOTAL_SQL + '; SELECT 1',
            TOTAL_SQL.replace('sum(o.amount)', 'evil(o.amount)'),
            TOTAL_SQL.replace('sum(o.amount)', 'sum(o.status)'),
            TOTAL_SQL.replace('HAVING sum(o.amount) > :minimum', 'HAVING o.amount > :minimum'),
            TOTAL_SQL.replace('"commerce"."Order"', 'other.orders'),
            TOTAL_SQL.replace('o.status AS status', 'o.customer_id AS status'),
            JOIN_SQL.replace('o.customer_id = c.id', 'o.id = c.id'),
            JOIN_SQL.replace('LEFT JOIN', 'CROSS JOIN'),
            JOIN_SQL.replace('LIMIT 2', 'LIMIT 1001'),
            JOIN_SQL + ' FOR UPDATE',
            'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x',
        ]
        for sql in bad:
            with self.subTest(sql=sql), self.assertRaises(ReadBuildError):
                ReviewedSQL(sql, Minimum, Totals, 10).build(Compiler(), target="postgresql18", binding=binding())
        with self.assertRaises(ReadBuildError):
            ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="postgresql17", binding=binding())
        pinned = binding(); pinned["modelSha256"] = "0" * 64
        with self.assertRaises(ReadBuildError):
            ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="postgresql18", binding=pinned)
        other = binding(); other["relationships"] = []
        with self.assertRaises(ReadBuildError):
            ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2).build(Compiler(), target="postgresql18", binding=other)

    def test_lakebase18_compiles_without_claiming_a_service_execution(self):
        entry = ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="lakebase18", binding=binding())
        self.assertEqual(entry.artifact()["target"], "lakebase18")

    def test_dsl_build_rejects_ambiguous_or_unjoined_owners(self):
        @query
        def repeated():
            return objects.join(CUSTOMER_REL).join(CUSTOMER_REL).limit(10).all()
        with self.assertRaises(ValueError):
            capture(repeated)
        @query
        def unjoined():
            return objects.filter(customer_name == "Alpha").limit(10).all()
        with self.assertRaises(TypeError):
            capture(unjoined)

    def test_mismatched_result_and_tampered_catalog_refuse(self):
        with self.assertRaises(ReadBuildError):
            ReviewedSQL(TOTAL_SQL, Minimum, JoinedRow, 10).build(Compiler(), target="postgresql18", binding=binding())
        entry = ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="postgresql18", binding=binding())
        artifact = json.loads(entry.artifact_json); artifact["dbapiSql"] = "SELECT evil()"
        with self.assertRaises(ReadBuildError):
            CatalogRead(json.dumps(artifact), Minimum, Totals).artifact()

@unittest.skipUnless(os.environ.get("UMF_PG_TEST_DSN"), "explicit isolated PostgreSQL test cluster required")
class Native(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.connect = staticmethod(psycopg.connect)
        cls.admin = psycopg.connect(os.environ["UMF_PG_TEST_DSN"], autocommit=True)
        if not cls.admin.execute("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'praxis_a'").fetchone():
            cls.admin.execute("CREATE ROLE praxis_a LOGIN")
            cls.admin.execute("CREATE ROLE praxis_b LOGIN")
        for schema in ("praxis_test", "praxis_other"):
            if cls.admin.execute("SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = %s", (schema,)).fetchone():
                continue
            cls.admin.execute(f"CREATE SCHEMA {schema}")
            cls.admin.execute(f"CREATE TABLE {schema}.orders (id bigint PRIMARY KEY, customer_id bigint, status text NOT NULL, amount numeric NOT NULL, owner_role text NOT NULL)")
            cls.admin.execute(f"CREATE TABLE {schema}.customers (id bigint PRIMARY KEY, name text NOT NULL, owner_role text NOT NULL)")
            cls.admin.execute(f"ALTER TABLE {schema}.orders ENABLE ROW LEVEL SECURITY")
            cls.admin.execute(f"ALTER TABLE {schema}.customers ENABLE ROW LEVEL SECURITY")
            cls.admin.execute(f"CREATE POLICY own_order ON {schema}.orders USING (owner_role = current_user)")
            cls.admin.execute(f"CREATE POLICY own_customer ON {schema}.customers USING (owner_role = current_user)")
            cls.admin.execute(f"GRANT USAGE ON SCHEMA {schema} TO praxis_a, praxis_b")
            cls.admin.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema} TO praxis_a, praxis_b")
            cls.admin.execute(f"INSERT INTO {schema}.customers VALUES (1, 'Alpha', 'praxis_a'), (2, 'Beta', 'praxis_b')")
            cls.admin.execute(f"INSERT INTO {schema}.orders VALUES (1,1,'open',0.10,'praxis_a'),(2,1,'open',0.20,'praxis_a'),(3,2,'open',123.45,'praxis_b'),(4,2,'closed',0.30,'praxis_a'),(5,NULL,'closed',0.40,'praxis_a')")
        cls.a = psycopg.connect(os.environ["UMF_PG_TEST_DSN"], user="praxis_a", autocommit=True)
        cls.b = psycopg.connect(os.environ["UMF_PG_TEST_DSN"], user="praxis_b", autocommit=True)

    @classmethod
    def tearDownClass(cls):
        cls.a.close(); cls.b.close(); cls.admin.close()

    def test_stream_uses_one_snapshot_and_releases_connection(self):
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2, keyset=True).build(Compiler(), target="postgresql18", binding=binding())
        stream = execute_stream(self.a, entry, Empty(), app_schema="praxis_test", max_rows=1001)
        try:
            first = next(stream)
            self.assertEqual(first.id, 1)
            self.assertEqual(self.a.execute("SHOW transaction_isolation").fetchone()[0], "repeatable read")
            self.assertEqual(self.a.execute("SHOW transaction_read_only").fetchone()[0], "on")
            self.admin.execute("UPDATE praxis_test.orders SET owner_role='praxis_b' WHERE id=4")
            self.assertEqual([first.id] + [row.id for row in stream], [1,2,4,5])
            self.assertEqual(self.a.info.transaction_status, 0)
        finally:
            stream.close()
            self.admin.execute("UPDATE praxis_test.orders SET owner_role='praxis_a' WHERE id=4")
        early = execute_stream(self.a, entry, Empty(), app_schema="praxis_test", max_rows=3)
        next(early)
        self.assertEqual(self.a.info.transaction_status, 2)
        early.close()
        self.assertEqual(self.a.info.transaction_status, 0)
        self.assertEqual(len(list(execute_stream(self.a, entry, Empty(), app_schema="praxis_test", max_rows=3))), 3)
        for limit in (0, -1, True):
            with self.assertRaises(ValueError):
                execute_stream(self.a, entry, Empty(), app_schema="praxis_test", max_rows=limit)
        with self.a.transaction():
            self.a.execute("SELECT 1")
            with self.assertRaises(ReadObligationUnmet):
                execute_stream(self.a, entry, Empty(), app_schema="praxis_test", max_rows=3)

    def test_async_reads_pages_snapshot_close_and_timeout_match_sync(self):
        import asyncio

        from psycopg import AsyncConnection
        from umf_access.postgres_read import (
            execute_page_async,
            execute_read_async,
            execute_stream_async,
        )
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2, keyset=True).build(Compiler(), target="postgresql18", binding=binding())
        async def scenario():
            async with await AsyncConnection.connect(os.environ["UMF_PG_TEST_DSN"], user="praxis_a", autocommit=True) as connection:
                first = await execute_page_async(connection, entry, Empty(), app_schema="praxis_test")
                second = await execute_page_async(connection, entry, Empty(), app_schema="praxis_test", after=first.next_after)
                self.assertEqual([r.id for r in (*first.items, *second.items)], [1,2,4,5])
                self.assertEqual(await execute_read_async(connection, entry, Empty(), app_schema="praxis_test"), list(first.items))
                stream = execute_stream_async(connection, entry, Empty(), app_schema="praxis_test", max_rows=1001)
                try:
                    first_row = await anext(stream)
                    self.admin.execute("UPDATE praxis_test.orders SET owner_role='praxis_b' WHERE id=4")
                    self.assertEqual([first_row.id] + [r.id async for r in stream], [1,2,4,5])
                finally:
                    await stream.aclose()
                    self.admin.execute("UPDATE praxis_test.orders SET owner_role='praxis_a' WHERE id=4")
                early = execute_stream_async(connection, entry, Empty(), app_schema="praxis_test", max_rows=1001)
                await anext(early)
                self.assertEqual(connection.info.transaction_status, 2)
                await early.aclose()
                self.assertEqual(connection.info.transaction_status, 0)
                with self.admin.transaction():
                    self.admin.execute("LOCK TABLE praxis_test.orders IN ACCESS EXCLUSIVE MODE")
                    with self.assertRaises(TimedOut):
                        await execute_read_async(connection, entry, Empty(), app_schema="praxis_test", timeout_ms=30)
                self.assertEqual(connection.info.transaction_status, 0)
                self.assertEqual((await execute_read_async(connection, entry, Empty(), app_schema="praxis_test"))[0].id, 1)
                async with connection.transaction():
                    await connection.execute("SELECT 1")
                    with self.assertRaises(ReadObligationUnmet):
                        await execute_read_async(connection, entry, Empty(), app_schema="praxis_test")
        asyncio.run(scenario())

    def test_two_roles_see_only_own_totals(self):
        entry = ReviewedSQL(TOTAL_SQL, Minimum, Totals, 10).build(Compiler(), target="postgresql18", binding=binding())
        a = execute_read(self.a, entry, Minimum(minimum=Decimal(0)), app_schema="praxis_test")
        b = execute_read(self.b, entry, Minimum(minimum=Decimal(0)), app_schema="praxis_test")
        self.assertEqual({r.total for r in a}, {Decimal("0.30"), Decimal("0.70")})
        self.assertEqual(b[0].total, Decimal("123.45"))
        self.assertEqual(self.a.info.transaction_status, 0)

    def test_join_pages_include_nulls_without_gaps_and_bind_identity(self):
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2, keyset=True).build(Compiler(), target="postgresql18", binding=binding())
        first = execute_page(self.a, entry, Empty(), app_schema="praxis_test")
        second = execute_page(self.a, entry, Empty(), app_schema="praxis_test", after=first.next_after)
        self.assertEqual([r.id for r in (*first.items, *second.items)], [1,2,4,5])
        self.assertEqual([r.customer for r in second.items], [None,None])
        with self.assertRaises(ReadObligationUnmet):
            execute_page(self.b, entry, Empty(), app_schema="praxis_test", after=first.next_after)
        with self.assertRaises(ReadObligationUnmet):
            execute_page(self.a, entry, Empty(), app_schema="praxis_other", after=first.next_after)

    def _generated_binding(self):
        import commerce
        if not self.admin.execute("SELECT pg_catalog.to_regclass('praxis_test.generated_orders')").fetchone()[0]:
            self.admin.execute("CREATE TABLE praxis_test.generated_orders (order_id text PRIMARY KEY, owner_role text NOT NULL)")
            self.admin.execute("CREATE TABLE praxis_test.generated_customers (customer_id text PRIMARY KEY, name text NOT NULL, owner_role text NOT NULL)")
            for table in ("generated_orders", "generated_customers"):
                self.admin.execute(f"ALTER TABLE praxis_test.{table} ENABLE ROW LEVEL SECURITY")
                self.admin.execute(f"CREATE POLICY own_generated ON praxis_test.{table} USING (owner_role = current_user)")
                self.admin.execute(f"GRANT SELECT ON praxis_test.{table} TO praxis_a, praxis_b")
            self.admin.execute("INSERT INTO praxis_test.generated_orders VALUES ('a1','praxis_a'),('a2','praxis_a'),('b1','praxis_b')")
            self.admin.execute("INSERT INTO praxis_test.generated_customers VALUES ('a1','Alpha','praxis_a'),('a2','Hidden','praxis_b'),('b1','Beta','praxis_b')")
        request = json.loads((Path(commerce.__file__).parent.parent / "stage-one-request.json").read_text())
        model = request["sources"][0]["text"]
        bound = {"version": "umf.raw-read-binding/0.1", "schema": None, "modelJson": model, "modelSha256": hashlib.sha256(model.encode()).hexdigest(),
                 "tables": [{"logical": ["commerce", "Order"], "native": "generated_orders", "key": ["orderId"], "columns": [{"logical": "orderId", "native": "order_id", "carrier": "string", "nullable": False}]},
                            {"logical": ["commerce", "Customer"], "native": "generated_customers", "key": ["customerId"], "columns": [{"logical": "customerId", "native": "customer_id", "carrier": "string", "nullable": False}, {"logical": "name", "native": "name", "carrier": "string", "nullable": False}]}],
                 "relationships": [{"id": "customer", "source": ["commerce", "Order"], "target": ["commerce", "Customer"], "pairs": [["orderId", "customerId"]], "toOne": True}]}
        return bound

    @unittest.skipUnless(os.environ.get("UMF_GENERATED_REPORTING_PACKAGE"), "generated reporting fixture required")
    def test_actual_generated_join_runs_through_weft_and_postgres(self):
        import commerce
        from commerce import Order, OrderCustomer, OrderCustomerProjection, OrderKey
        schema = "praxis_test"
        bound = self._generated_binding()
        @query
        def declaration():
            return Order.objects.join(Order.c.customer).order_by(Order.c.order_id.asc()).into(OrderCustomerProjection).limit(10).all()
        entry = build_query(capture(declaration), Compiler(), parameters=Empty, result=OrderCustomer, target="postgresql18", binding=bound, row_cap=10)
        pins = entry.artifact()["stageOne"]
        self.assertEqual(pins["inputDigest"], OrderCustomer.UMF_BUNDLE_INPUT_DIGEST)
        class NoConnection:
            @property
            def info(self):
                raise AssertionError("stale catalog touched the connection")
        old_digest, old_abi = OrderCustomer.UMF_BUNDLE_INPUT_DIGEST, OrderCustomer.UMF_RUNTIME_ABI
        try:
            for name, value in (("UMF_BUNDLE_INPUT_DIGEST", "0" * 64), ("UMF_RUNTIME_ABI", ("umf_access", "different", "umf-access-runtime/0.1"))):
                setattr(OrderCustomer, name, value)
                with self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
                    execute_read(NoConnection(), entry, Empty(), app_schema=schema)
                OrderCustomer.UMF_BUNDLE_INPUT_DIGEST, OrderCustomer.UMF_RUNTIME_ABI = old_digest, old_abi
        finally:
            OrderCustomer.UMF_BUNDLE_INPUT_DIGEST, OrderCustomer.UMF_RUNTIME_ABI = old_digest, old_abi

        rows = execute_read(self.a, entry, Empty(), app_schema=schema)
        self.assertEqual([(r.order_id, r.name) for r in rows], [("a1", "Alpha"), ("a2", None)])
        from umf_access.dsl import Param
        # Annotations must be resolvable by capture's get_type_hints.
        globals()["GeneratedOrderKey"] = OrderKey
        globals()["Param"] = Param
        @query
        def paged(after: Param[GeneratedOrderKey | None]):  # noqa: F821 -- Generated Key type is injected into globals for get_type_hints.
            return Order.objects.join(Order.c.customer).order_by(Customer.c.name.asc()).into(OrderCustomerProjection).page(size=1, after=after)
        # Customer is another actual emitted Record, not a handwritten stand-in.
        globals()["Customer"] = commerce.Customer
        page_entry = build_query(capture(paged), Compiler(), parameters=Empty, result=OrderCustomer, target="postgresql18", binding=bound, row_cap=10)
        first = execute_page(self.a, page_entry, Empty(), app_schema=schema)
        second = execute_page(self.a, page_entry, Empty(), app_schema=schema, after=first.next_after)
        self.assertEqual([r.order_id for r in (*first.items, *second.items)], ["a1", "a2"])


    @unittest.skipUnless(os.environ.get("UMF_GENERATED_REPORTING_PACKAGE"), "generated reporting fixture required")
    def test_catalog_cli_public_functions_sync_async_and_drift(self):
        import shutil
        import sys
        import tempfile

        bound = self._generated_binding()
        source = Path(__file__).parent / "catalog_e2e.py"
        with tempfile.TemporaryDirectory(prefix="umf-catalog-native-") as temporary:
            root=Path(temporary)
            generated=subprocess.run(['bun',str(Path(__file__).resolve().parents[3]/'scripts/generate-access-reporting-fixture.ts'),str(root),'--reads-only'],cwd=Path(__file__).resolve().parents[3],capture_output=True,text=True, check=False)
            self.assertEqual(generated.returncode,0,generated.stdout+generated.stderr)
            # Previous stage-two artifacts, if present, belong to another explicit module selection.
            for path in ("queries.py","_umf/catalog.json","_umf/catalog-manifest.json","_umf/privileges.json"):
                (root/"commerce"/path).unlink(missing_ok=True)
            config={'package':'commerce','modules':['declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':bound,'platform':[{'name':'postgresql','versions':[str(self.a.info.server_version)]}]}]}
            (root/'config.json').write_text(json.dumps(config))
            shutil.copyfile(Path(__file__).parent/'catalog_declarations.py',root/'declarations.py')
            env=dict(os.environ)
            for name in ('PYTHONPATH','PYTHONHOME','MYPYPATH'):env.pop(name,None)
            result=subprocess.run([sys.executable,'-I','-B',str(source),str(root)],env=env,capture_output=True,text=True, check=False)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertIn('catalog native E2E: pass',result.stdout)

    def test_inner_join_and_bound_string_parameter(self):
        sql = JOIN_SQL.replace("LEFT JOIN", "INNER JOIN").replace("ORDER BY", "WHERE c.name = :name ORDER BY")
        entry = ReviewedSQL(sql, Name, JoinedRow, 2).build(Compiler(), target="postgresql18", binding=binding())
        self.assertEqual([r.id for r in execute_read(self.a, entry, Name(name="Alpha"), app_schema="praxis_test")], [1,2])
        self.assertEqual(execute_read(self.a, entry, Name(name="Alpha' OR TRUE --"), app_schema="praxis_test"), [])

    def test_keyset_directions_and_null_placement(self):
        for direction, nulls, expected in [("ASC", "FIRST", [4,5,1,2]), ("DESC", "FIRST", [4,5,1,2]), ("DESC", "LAST", [1,2,4,5])]:
            entry = ReviewedSQL(JOIN_SQL.replace("c.name ASC NULLS LAST", f"c.name {direction} NULLS {nulls}"), Empty, JoinedRow, 2, keyset=True).build(Compiler(), target="postgresql18", binding=binding())
            first = execute_page(self.a, entry, Empty(), app_schema="praxis_test")
            second = execute_page(self.a, entry, Empty(), app_schema="praxis_test", after=first.next_after)
            self.assertEqual([r.id for r in (*first.items, *second.items)], expected)

    def test_superuser_nested_transaction_and_wrong_schema_refuse(self):
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2).build(Compiler(), target="postgresql18", binding=binding("praxis_test"))
        with self.assertRaises(ReadObligationUnmet):
            execute_read(self.admin, entry, Empty(), app_schema="praxis_test")
        with self.assertRaises(ReadObligationUnmet):
            execute_read(self.a, entry, Empty(), app_schema="praxis_other")
        with self.a.transaction(), self.assertRaises(ReadObligationUnmet):
            execute_read(self.a, entry, Empty(), app_schema="praxis_test")

    def test_timeout_is_typed_and_caller_connection_remains_usable(self):
        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2).build(Compiler(), target="postgresql18", binding=binding())
        with self.admin.transaction():
            self.admin.execute("LOCK TABLE praxis_test.orders IN ACCESS EXCLUSIVE MODE")
            with self.assertRaises(TimedOut):
                execute_read(self.a, entry, Empty(), app_schema="praxis_test", timeout_ms=30)
        self.assertEqual(execute_read(self.a, entry, Empty(), app_schema="praxis_test")[0].id, 1)
