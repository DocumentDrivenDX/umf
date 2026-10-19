# SPDX-License-Identifier: MIT OR Apache-2.0
"""Detach only an owned fixture type's extension membership; retain native IO."""

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


out = Path(os.environ["UMF_VECTOR_MEMBERSHIP_OUTPUT"])
out.mkdir(parents=True, exist_ok=False)
(out / "socket").mkdir()
(out / "harness.py").write_bytes(Path(__file__).read_bytes())
request = json.loads(Path(os.environ["UMF_VECTOR_MEMBERSHIP_REQUEST"]).read_text())
(out / "request.json").write_text(json.dumps(request, indent=2) + "\n")
control = Path(os.environ["UMF_PGVECTOR_CONTROL_ROOT"]).resolve()
assert not any(character.isspace() for character in str(control))
expected_refusal = os.environ.get("UMF_VECTOR_MEMBERSHIP_LEGACY_RED") != "1"
pg_bin = Path("/opt/homebrew/opt/postgresql@18/bin")
started = False
restored = False


def command(*args):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


class ObservedCursor:
    def __init__(self, cursor, owner):
        self.cursor, self.owner = cursor, owner

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
        self.connection, self.data_sql = connection, data_sql
        self.data_calls = 0

    def __getattr__(self, name):
        return getattr(self.connection, name)

    def cursor(self, *args, **kwargs):
        return ObservedCursor(self.connection.cursor(*args, **kwargs), self)


membership_sql = """SELECT d.deptype::text FROM pg_catalog.pg_depend d
JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
WHERE d.classid='pg_catalog.pg_type'::regclass AND d.objid='public.vector'::regtype
AND d.objsubid=0 AND d.refclassid='pg_catalog.pg_extension'::regclass
AND d.refobjsubid=0 AND e.extname='vector' AND e.extversion='0.8.7' AND d.deptype='e'"""
try:
    entry = ReviewedSQL(request["sql"], Empty, Row, row_cap=10).build(
        weft, target="postgresql18", binding=request["binding"])
    artifact = entry.artifact()
    (out / "catalog.json").write_text(entry.artifact_json + "\n")
    command(pg_bin / "initdb", "-D", out / "data", "-U", "sdk_test", "-A", "trust", "--no-sync")
    (out / "data/pg_hba.conf").write_text("local all erik peer\nlocal all sdk_test trust\nlocal all all reject\n")
    command(pg_bin / "pg_ctl", "-D", out / "data", "-l", out / "server.log", "-o",
            f"-F -k {out / 'socket'} -c listen_addresses='' -c extension_control_path={control} -p 55512", "-w", "start")
    started = True
    dsn = f"host={out / 'socket'} port=55512 dbname=postgres"
    with psycopg.connect(dsn + " user=sdk_test", autocommit=True) as admin:
        admin.execute("CREATE EXTENSION vector VERSION '0.8.7'")
        assert admin.execute(membership_sql).fetchall() == [("e",)]
        admin.execute("CREATE ROLE erik LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS")
        admin.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        admin.execute("CREATE SCHEMA native_vector")
        admin.execute("CREATE TABLE native_vector.docs (id TEXT PRIMARY KEY, body TEXT NOT NULL, embedding public.vector(3) NOT NULL, count BIGINT NOT NULL, amount NUMERIC(38,10) NOT NULL, payload BYTEA NOT NULL)")
        admin.execute("GRANT USAGE ON SCHEMA native_vector TO erik")
        admin.execute("GRANT SELECT ON native_vector.docs TO erik")

        def target(connection):
            observed = ObservedConnection(connection, artifact["dbapiSql"])
            return observed, PostgresTarget(observed, PostgresConfiguration(
                "native_vector", binding_digest(artifact["binding"]),
                (connection.info.server_version,), timedelta(seconds=5)), catalog_entries=(entry,))

        with psycopg.connect(dsn + " user=erik") as connection:
            observed, native = target(connection)
            native.verify()
            assert observed.data_calls == 0
            assert native.read(entry, Empty()) == []
            assert observed.data_calls == 1
        detached = False
        failure = None
        try:
            admin.execute("ALTER EXTENSION vector DROP TYPE public.vector")
            detached = True
            assert admin.execute(membership_sql).fetchall() == []
            # Type identity and native IO still exist; membership alone changed.
            assert admin.execute("SELECT '[1,2,3]'::public.vector::text").fetchone() == ("[1,2,3]",)
            with psycopg.connect(dsn + " user=erik") as connection:
                observed, native = target(connection)
                try:
                    native.verify()
                    assert native.read(entry, Empty()) == []
                except (ReadBuildError, ReadObligationUnmet, TargetMismatch) as error:
                    failure = {"type": type(error).__name__, "message": str(error)}
                detached_calls = observed.data_calls
                if expected_refusal:
                    assert failure is not None and detached_calls == 0
                else:
                    assert failure is None and detached_calls == 1
        finally:
            if detached:
                admin.execute("ALTER EXTENSION vector ADD TYPE public.vector")
            restored = admin.execute(membership_sql).fetchall() == [("e",)]
            assert restored
        with psycopg.connect(dsn + " user=erik") as connection:
            observed, native = target(connection)
            native.verify()
            assert native.read(entry, Empty()) == [] and observed.data_calls == 1
        (out / "verification.json").write_text(json.dumps({
            "status": "passed" if expected_refusal else "demonstrated-gap",
            "baselineAndRestoredNativeRead": "passed", "nativeTypeIOWhileDetached": "passed",
            "detachedMembershipRefusal": failure, "detachedBusinessSqlCalls": detached_calls,
            "membershipRestored": restored, "temporal": "HELD",
        }, indent=2) + "\n")
        assert expected_refusal, "original R19 accepted detached native extension type"
finally:
    if started:
        command(pg_bin / "pg_ctl", "-D", out / "data", "-m", "immediate", "-w", "stop")
    (out / "cleanup.json").write_text(json.dumps({"membershipRestored": restored, "ownedServerStopped": started and not (out / "data/postmaster.pid").exists()}) + "\n")
