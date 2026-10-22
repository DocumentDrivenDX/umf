"""Fresh empty-table schema admission; run only with an explicitly owned PG lease."""

import json
import os
import subprocess
from datetime import timedelta
from pathlib import Path

import psycopg
import weft
from umf_access.pages import ReadObligationUnmet
from umf_access.reviewed import ReadBuildError, ReviewedSQL
from umf_access.targets import (
    PostgresConfiguration,
    PostgresTarget,
    TargetMismatch,
    binding_digest,
)
from umf_access.types import StrictModel


class Empty(StrictModel):
    pass


class Row(StrictModel):
    id: str


class ObservedCursor:
    def __init__(self, cursor, owner):
        self.cursor = cursor
        self.owner = owner

    def __getattr__(self, name):
        return getattr(self.cursor, name)

    def __enter__(self):
        self.cursor.__enter__()
        return self

    def __exit__(self, *args):
        return self.cursor.__exit__(*args)

    def execute(self, sql, *args, **kwargs):
        if sql == self.owner.data_sql:
            self.owner.data_calls += 1
        return self.cursor.execute(sql, *args, **kwargs)


class ObservedConnection:
    def __init__(self, connection, data_sql):
        self.connection = connection
        self.data_sql = data_sql
        self.data_calls = 0

    def __getattr__(self, name):
        return getattr(self.connection, name)

    def cursor(self, *args, **kwargs):
        return ObservedCursor(self.connection.cursor(*args, **kwargs), self)


out = Path(os.environ["UMF_SOURCE_EXACT_OUTPUT"])
out.mkdir(parents=True, exist_ok=False)
(out / "socket").mkdir()
pg_bin = Path("/opt/homebrew/opt/postgresql@18/bin")
request_path = Path(os.environ["UMF_SOURCE_EXACT_REQUEST"])
request = json.loads(request_path.read_text())
legacy_red = os.environ.get("UMF_SOURCE_EXACT_LEGACY_RED") == "1"
if legacy_red:
    request.pop("verificationProfile", None)
    request["binding"].pop("nativeColumns", None)
(out / "request.json").write_text(json.dumps(request, indent=2) + "\n")
started = False
results = []


def command(*args):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


try:
    entry = ReviewedSQL(request["sql"], Empty, Row, row_cap=10).build(
        weft, target=request["target"], binding=request["binding"]
    )
    (out / "catalog.json").write_text(entry.artifact_json + "\n")
    artifact = entry.artifact()
    command(pg_bin / "initdb", "-D", out / "data", "-U", "sdk_test", "-A", "trust", "--no-sync")
    (out / "data/pg_hba.conf").write_text("local all erik peer\nlocal all sdk_test trust\nlocal all all reject\n")
    command(pg_bin / "pg_ctl", "-D", out / "data", "-l", out / "server.log", "-o",
            f"-F -k {out / 'socket'} -c listen_addresses='' -p 55511", "-w", "start")
    started = True
    dsn = f"host={out / 'socket'} port=55511 dbname=postgres"
    with psycopg.connect(dsn + " user=sdk_test", autocommit=True) as admin:
        admin.execute("CREATE ROLE erik LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS")
        admin.execute("CREATE SCHEMA native_schema")
        admin.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        admin.execute("GRANT USAGE ON SCHEMA native_schema TO erik")
        baseline = 'id TEXT COLLATE "C" PRIMARY KEY, status TEXT COLLATE "C", amount NUMERIC(12,2)'
        variants = {
            "baseline": baseline,
            "string_width": baseline.replace('status TEXT', 'status VARCHAR(2)'),
            "string_family": baseline.replace('status TEXT', 'status CHAR(10)'),
            "numeric_typmod": baseline.replace('NUMERIC(12,2)', 'NUMERIC(8,1)'),
            "nullable_tightening": baseline.replace('status TEXT COLLATE "C"', 'status TEXT COLLATE "C" NOT NULL'),
            "required_relaxation": baseline.replace('id TEXT COLLATE "C" PRIMARY KEY', 'id TEXT COLLATE "C" UNIQUE'),
            "extra_column": baseline + ', unexpected TEXT',
            "default_expression": baseline.replace('status TEXT COLLATE "C"', 'status TEXT COLLATE "C" DEFAULT \'seed\''),
            "stored_generation": baseline.replace('status TEXT COLLATE "C"', 'status TEXT COLLATE "C" GENERATED ALWAYS AS (id || \'generated\') STORED'),
            "collation": baseline.replace('status TEXT COLLATE "C"', 'status TEXT COLLATE "POSIX"'),
        }
        variants["inheritance"] = baseline
        admin.execute("CREATE TABLE native_schema.parent ()")
        native_ids = set()
        for name, columns in variants.items():
            admin.execute("DROP TABLE IF EXISTS native_schema.orders")
            admin.execute("CREATE TABLE native_schema.orders (" + columns + ")" + (" INHERITS (native_schema.parent)" if name == "inheritance" else ""))
            admin.execute("GRANT SELECT ON native_schema.orders TO erik")
            native_oid = admin.execute("SELECT 'native_schema.orders'::regclass::oid").fetchone()[0]
            assert native_oid not in native_ids
            native_ids.add(native_oid)
            oracle = admin.execute("SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),n.nspname,c.collname FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation c ON c.oid=a.attcollation LEFT JOIN pg_namespace n ON n.oid=c.collnamespace WHERE a.attrelid='native_schema.orders'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum").fetchall()
            assert admin.execute("SELECT count(*) FROM native_schema.orders").fetchone()[0] == 0
            with psycopg.connect(dsn + " user=erik") as connection:
                observed = ObservedConnection(connection, artifact["dbapiSql"])
                target = PostgresTarget(observed, PostgresConfiguration(
                    "native_schema", binding_digest(artifact["binding"]),
                    (connection.info.server_version,), timedelta(seconds=5),
                ), catalog_entries=(entry,))
                failure = None
                try:
                    target.verify()
                    if name != "baseline":
                        # An empty result is not evidence of correct schema admission.
                        target.read(entry, Empty())
                except (ReadBuildError, ReadObligationUnmet, TargetMismatch) as error:
                    failure = {"type": type(error).__name__, "message": str(error)}
                if name == "baseline":
                    assert failure is None, failure
                    assert observed.data_calls == 0
                    assert target.read(entry, Empty()) == []
                    assert observed.data_calls == 1
                else:
                    if not legacy_red:
                        assert failure is not None, (name, "first admission accepted incompatible empty table")
                        assert observed.data_calls == 0, (name, "business SQL executed before refusal")
                results.append({"case": name, "nativeOid": native_oid, "oracle": oracle,
                                "failure": failure, "dataSqlCalls": observed.data_calls})
                (out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
        admin.execute("DROP SCHEMA native_schema CASCADE")
    gaps = [case["case"] for case in results if case["case"] != "baseline" and case["failure"] is None]
    (out / "verification.json").write_text(json.dumps({"status": "demonstrated-gap" if gaps else "passed", "checks": len(results), "freshNativeIdentities": len(native_ids), "acceptedIncompatibleSchemas": gaps}, indent=2) + "\n")
    assert not gaps, gaps
finally:
    if started:
        command(pg_bin / "pg_ctl", "-D", out / "data", "-m", "immediate", "-w", "stop")
    (out / "cleanup.json").write_text(json.dumps({"ownedServerStopped": started and not (out / "data/postmaster.pid").exists()}) + "\n")
