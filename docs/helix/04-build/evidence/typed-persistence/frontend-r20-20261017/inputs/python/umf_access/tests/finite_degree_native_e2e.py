"""Actual generated catalog finite inverse degree and native equality admission E2E.

Caller owns an isolated PostgreSQL18 cluster; no emitted SQL is modified.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import sysconfig
from datetime import timedelta
from pathlib import Path

import psycopg
from psycopg import sql

DECLARATIONS = """from degree_shop import Order,Customer
from umf_access.dsl import query
@query
def joined():
    return Order.objects.join(Order.c.customer).select(Order.c.order_id,Customer.c.customer_id).order_by(Order.c.order_id.asc()).limit(20).all()
"""
BUSINESS = set()
OBSERVATIONS = []


class ObservedCursor(psycopg.Cursor):
    def execute(self, query, params=None, **kwargs):
        if isinstance(query, str) and query in BUSINESS:
            with psycopg.Cursor(self.connection) as witness:
                witness.execute("SHOW transaction_isolation")
                isolation = witness.fetchone()[0]
                witness.execute("SHOW transaction_read_only")
                readonly = witness.fetchone()[0]
            OBSERVATIONS.append(
                {"sql": query, "isolation": isolation, "readonly": readonly}
            )
            assert (isolation, readonly) == ("repeatable read", "on")
        return super().execute(query, params, **kwargs)


def main():
    root = Path(sys.argv[1]).resolve()
    schema = "sdk_finite_degree_fixture"
    schemas = []
    checks = []
    status = "FAILED"
    harness = Path(__file__).resolve()
    runtime = Path(sysconfig.get_path("purelib")) / "umf_access"

    def source():
        return {
            "harness": hashlib.sha256(harness.read_bytes()).hexdigest(),
            "stageOneRequest": hashlib.sha256(
                (root / "stage-one-request.json").read_bytes()
            ).hexdigest(),
            "installed": {
                str(p.relative_to(runtime)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted(runtime.rglob("*.py"))
            },
        }

    start = source()
    model = json.loads((root / "stage-one-request.json").read_text())["sources"][0][
        "text"
    ]
    binding = {
        "version": "umf.raw-read-binding/0.1",
        "schema": None,
        "modelJson": model,
        "modelSha256": hashlib.sha256(model.encode()).hexdigest(),
        "tables": [
            {
                "logical": ["commerce", "Order"],
                "native": "orders",
                "key": ["orderId"],
                "columns": [
                    {
                        "logical": "orderId",
                        "native": "id",
                        "carrier": "string",
                        "nullable": False,
                    },
                    {
                        "logical": "customerRef",
                        "native": "customer_code",
                        "carrier": "string",
                        "nullable": True,
                    },
                ],
            },
            {
                "logical": ["commerce", "Customer"],
                "native": "customers",
                "key": ["customerId"],
                "columns": [
                    {
                        "logical": "customerId",
                        "native": "id",
                        "carrier": "string",
                        "nullable": False,
                    },
                    {
                        "logical": "code",
                        "native": "code",
                        "carrier": "string",
                        "nullable": False,
                    },
                    {
                        "logical": "name",
                        "native": "name",
                        "carrier": "string",
                        "nullable": False,
                    },
                ],
            },
        ],
        "relationships": [
            {
                "module": "commerce",
                "id": "customer",
                "source": ["commerce", "Order"],
                "target": ["commerce", "Customer"],
                "pairs": [["customerRef", "code"]],
                "toOne": True,
            }
        ],
    }
    (root / "degree_declarations.py").write_text(DECLARATIONS)

    def case(name):
        checks.append(name)
        print("PASS", name, flush=True)

    try:
        with psycopg.connect(
            os.environ["UMF_PG_TEST_DSN"],
            autocommit=True,
            cursor_factory=ObservedCursor,
        ) as connection:
            assert connection.execute(
                "SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
            ).fetchone() == (False, False)
            version = connection.info.server_version
            assert 180000 <= version < 190000
            config = {
                "package": "degree_shop",
                "modules": ["degree_declarations"],
                "targets": [
                    {
                        "id": "local",
                        "kind": "postgresql",
                        "backendId": "weft-postgresql",
                        "backendVersion": "raw-read/0.1",
                        "targetProfile": "weft.raw-read/0.1",
                        "binding": binding,
                        "platform": [
                            {"name": "postgresql", "versions": [str(version)]}
                        ],
                    }
                ],
            }
            (root / "config.json").write_text(json.dumps(config, indent=2) + "\n")
            for label, tail in [("build", []), ("check", ["--check"])]:
                result = subprocess.run(
                    [
                        sys.executable,
                        "-I",
                        "-B",
                        "-m",
                        "umf_access.build.catalog",
                        "catalog",
                        "--config",
                        str(root / "config.json"),
                        "--root",
                        str(root),
                        *tail,
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                (root / f"cli-{label}.log").write_text(result.stdout + result.stderr)
                assert result.returncode == 0, result.stdout + result.stderr
            sys.path.insert(0, str(root))
            from degree_shop import queries
            from umf_access.pages import ReadObligationUnmet
            from umf_access.targets import (
                PostgresConfiguration,
                PostgresTarget,
                binding_digest,
            )

            entry = queries._Q0.variants[0].entry
            artifact = entry.artifact()
            assert artifact["binding"]["modelJson"] == model
            assert artifact["obligations"]["readIsolation"] == "repeatable-read"
            BUSINESS.add(artifact["dbapiSql"])
            case("actual-generated-public-cli-original-finite-degree-obligation")

            def ddl(statement, s):
                connection.execute(sql.SQL(statement).format(s=sql.Identifier(s)))

            def make(s, mode="normal"):
                assert not connection.execute(
                    "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s", (s,)
                ).fetchone()
                ddl("CREATE SCHEMA {s}", s)
                schemas.append(s)
                coll = sql.SQL('pg_catalog."C"')
                if mode == "casefold":
                    ddl(
                        "CREATE COLLATION {s}.casefold (provider=icu,locale='und-u-ks-level2',deterministic=false)",
                        s,
                    )
                    coll = sql.SQL("{s}.casefold").format(s=sql.Identifier(s))
                connection.execute(
                    sql.SQL(
                        "CREATE TABLE {s}.customers(id text PRIMARY KEY,code text COLLATE {c} NOT NULL,name text NOT NULL)"
                    ).format(s=sql.Identifier(s), c=coll)
                )
                connection.execute(
                    sql.SQL(
                        "CREATE TABLE {s}.orders(id text PRIMARY KEY,customer_code text COLLATE {c})"
                    ).format(s=sql.Identifier(s), c=coll)
                )
                if mode == "custom":
                    with psycopg.connect(
                        os.environ["UMF_PG_ADMIN_DSN"], autocommit=True
                    ) as admin:
                        admin.execute(
                            sql.SQL(
                                "CREATE OPERATOR CLASS {s}.text_clone_ops FOR TYPE text USING btree AS OPERATOR 1 pg_catalog.< (text,text), OPERATOR 2 pg_catalog.<= (text,text), OPERATOR 3 pg_catalog.= (text,text), OPERATOR 4 pg_catalog.>= (text,text), OPERATOR 5 pg_catalog.> (text,text), FUNCTION 1 pg_catalog.bttextcmp(text,text)"
                            ).format(s=sql.Identifier(s))
                        )
                    ddl(
                        "CREATE UNIQUE INDEX customer_code_key ON {s}.customers(code {s}.text_clone_ops)",
                        s,
                    )
                else:
                    ddl(
                        "CREATE UNIQUE INDEX customer_code_key ON {s}.customers(code)",
                        s,
                    )
                ddl(
                    "ALTER TABLE {s}.orders ADD CONSTRAINT customer_fk FOREIGN KEY(customer_code) REFERENCES {s}.customers(code) NOT DEFERRABLE",
                    s,
                )
                ddl(
                    "INSERT INTO {s}.customers VALUES('c1','Alpha','one'),('c2','Beta','two')",
                    s,
                )
                ddl(
                    "INSERT INTO {s}.orders VALUES('o1','Alpha'),('o2','Alpha'),('o3','Beta'),('o4',NULL)",
                    s,
                )
                return PostgresTarget(
                    connection,
                    PostgresConfiguration(
                        s, binding_digest(binding), (version,), timedelta(seconds=20)
                    ),
                    (entry,),
                )

            target = make(schema)
            expected = [("o1", "c1"), ("o2", "c1"), ("o3", "c2"), ("o4", None)]
            oracle = connection.execute(
                sql.SQL(
                    'SELECT o.id,c.id FROM {}.orders o LEFT JOIN {}.customers c ON o.customer_code=c.code ORDER BY o.id COLLATE "C"'
                ).format(sql.Identifier(schema), sql.Identifier(schema))
            ).fetchall()
            assert oracle == expected
            assert queries.joined(target) == oracle and OBSERVATIONS
            case("runtime-original-SQL-repeatable-read-readonly-and-zero-FK-not-edge")

            def refused(target, name):
                before = len(OBSERVATIONS)
                try:
                    queries.joined(target)
                except ReadObligationUnmet:
                    pass
                else:
                    raise AssertionError(name + " admitted")
                assert len(OBSERVATIONS) == before
                case(name)

            ddl("DELETE FROM {s}.orders WHERE id='o3'", schema)
            refused(target, "zero-source-neighbor-refused-before-business")
            ddl("INSERT INTO {s}.orders VALUES('o3','Beta')", schema)
            assert queries.joined(target) == expected
            case("zero-degree-restored-recovery")
            ddl("INSERT INTO {s}.orders VALUES('o5','Alpha')", schema)
            refused(target, "excess-source-neighbor-refused-before-business")
            ddl("DELETE FROM {s}.orders WHERE id='o5'", schema)
            assert queries.joined(target) == expected
            case("excess-degree-restored-recovery")
            ddl("ALTER TABLE {s}.customers ENABLE ROW LEVEL SECURITY", schema)
            ddl("ALTER TABLE {s}.customers FORCE ROW LEVEL SECURITY", schema)
            ddl("CREATE POLICY first_only ON {s}.customers USING(id='c1')", schema)
            refused(target, "native-RLS-filtered-degree-scope-refused")
            ddl("ALTER TABLE {s}.customers DISABLE ROW LEVEL SECURITY", schema)
            assert queries.joined(target) == expected
            case("native-RLS-restored-recovery")
            casefold = make(schema + "_casefold", "casefold")
            refused(casefold, "native-casefold-alternate-key-refused")
            folded_schema = schema + "_casefold"
            ddl("ALTER TABLE {s}.orders DROP CONSTRAINT customer_fk", folded_schema)
            ddl(
                'ALTER TABLE {s}.customers ALTER COLUMN code TYPE text COLLATE pg_catalog."C"',
                folded_schema,
            )
            ddl(
                'ALTER TABLE {s}.orders ALTER COLUMN customer_code TYPE text COLLATE pg_catalog."C"',
                folded_schema,
            )
            ddl(
                "ALTER TABLE {s}.orders ADD CONSTRAINT customer_fk FOREIGN KEY(customer_code) REFERENCES {s}.customers(code) NOT DEFERRABLE",
                folded_schema,
            )
            assert queries.joined(casefold) == expected
            case("native-casefold-restored-binary-recovery")
            custom = make(schema + "_custom", "custom")
            refused(custom, "native-custom-opclass-alternate-key-refused")
            custom_schema = schema + "_custom"
            ddl("ALTER TABLE {s}.orders DROP CONSTRAINT customer_fk", custom_schema)
            ddl("DROP INDEX {s}.customer_code_key", custom_schema)
            ddl(
                "CREATE UNIQUE INDEX customer_code_key ON {s}.customers(code)",
                custom_schema,
            )
            ddl(
                "ALTER TABLE {s}.orders ADD CONSTRAINT customer_fk FOREIGN KEY(customer_code) REFERENCES {s}.customers(code) NOT DEFERRABLE",
                custom_schema,
            )
            assert queries.joined(custom) == expected
            case("native-custom-opclass-restored-default-recovery")
            assert queries.joined(target) == expected
            case("final-unmodified-original-artifact-positive")
            assert len(checks) == 13 and len(OBSERVATIONS) == 7
            status = "PASS"
    finally:
        with psycopg.connect(os.environ["UMF_PG_TEST_DSN"], autocommit=True) as cleanup:
            for s in reversed(schemas):
                cleanup.execute(
                    sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(s))
                )
            absent = all(
                not cleanup.execute(
                    "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s", (s,)
                ).fetchone()
                for s in schemas
            )
        end = source()
        receipt = {
            "status": status,
            "checks": checks,
            "serverVersion": locals().get("version"),
            "sourceStart": start,
            "sourceEnd": end,
            "fixtureCleanupComplete": absent,
            "businessObservations": OBSERVATIONS,
            "temporal": "HELD",
        }
        (root / "finite-degree-result.json").write_text(
            json.dumps(receipt, indent=2) + "\n"
        )
        assert start == end and absent


if __name__ == "__main__":
    main()
