"""Owned local read-consistency regression; review source before explicit execution.

Executes the unchanged original R22 query and admissions, using R25's original
role-observation SQL. This is an execution-order test, not full SDK actor,
permission, deployment or release qualification. No grants or roles are changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import psycopg
import umf_access
from umf_access.postgres_read import _ROLE, _projection_admissions

PG = Path("/opt/homebrew/opt/postgresql@18/bin")
INPUT = Path("/private/tmp/sdk-rr-read-consistency-prep/original-request.json")
PROGRAM = Path("/private/tmp/sdk-rr-read-consistency-prep/original-program.json")
PINS = Path("/private/tmp/sdk-r25-r22-byte-correspondence.json")
KNOWN = [("row-1", "alpha", "1.00"), ("row-2", "beta", "2.00")]
REWRITE = ('ALTER TABLE native_app.orders ALTER COLUMN status TYPE text '
           'COLLATE pg_catalog."C" USING (status || \'\')')
ORACLE = ('SELECT id,status,amount::text FROM native_app.orders '
          'ORDER BY id COLLATE pg_catalog."C"')
NATIVE = """SELECT c.oid::text,c.relfilenode::text,c.xmin::text,c.ctid::text,
 a.atttypid::pg_catalog.regtype::text,a.atttypmod,a.attnotnull,
 a.attcollation::pg_catalog.regcollation::text
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 WHERE c.oid='native_app.orders'::pg_catalog.regclass AND a.attname='status'"""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def command(*args: object) -> str:
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                            check=False, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, default=str) + "\n")


def original_query(connection, program):
    # Native owner SQL is passed unchanged; there are no input parameters.
    assert program["parameters"] == [] and program["parameterOrder"] == []
    with psycopg.RawCursor(connection) as cursor:
        cursor.execute(program["sql"])
        return cursor.fetchall()


def admissions(connection, programs):
    return [{"sql": sql, "parameters": values,
             "rows": connection.execute(sql, values).fetchall()}
            for sql, values in programs]


def all_true(observations):
    return all(item["rows"] == [(True,)] for item in observations)


def restore_rows(connection):
    connection.execute("TRUNCATE native_app.orders")
    for row in KNOWN:
        connection.execute("INSERT INTO native_app.orders VALUES (%s,%s,%s)", row)
    assert connection.execute(ORACLE).fetchall() == KNOWN


def observe_case(dsn, fixture, program, guard_programs, *, lock_first):
    before_native = fixture.execute(NATIVE).fetchone()
    expected = fixture.execute(ORACLE).fetchall()
    fresh_before = admissions(fixture, guard_programs)
    assert expected == KNOWN and all_true(fresh_before)
    with psycopg.connect(dsn, autocommit=True) as reader:
        reader.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        reader.execute("SET LOCAL statement_timeout='4000ms'")
        # Only this explicit test order differs. The program and SQL stay intact.
        if lock_first:
            for statement in program["lockSql"]:
                reader.execute(statement)
        pid = reader.info.backend_pid
        snapshot_after_early_locks = None
        if lock_first:
            snapshot_after_early_locks = fixture.execute(
                "SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s",
                (pid,),
            ).fetchone()
            assert snapshot_after_early_locks == (None,), snapshot_after_early_locks
        role = reader.execute(_ROLE).fetchone()
        snapshot_before_lock = fixture.execute(
            "SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s",
            (pid,),
        ).fetchone()
        assert snapshot_before_lock is not None
        ddl_error = None
        fixture.execute("SET lock_timeout='350ms'")
        try:
            fixture.execute(REWRITE)
        except (psycopg.errors.LockNotAvailable, psycopg.errors.QueryCanceled) as error:
            ddl_error = {"type": type(error).__name__, "sqlstate": error.sqlstate,
                         "message": str(error)}
        finally:
            fixture.execute("RESET lock_timeout")
        after_native = fixture.execute(NATIVE).fetchone()
        independent_rows = fixture.execute(ORACLE).fetchall()
        assert independent_rows == KNOWN  # The rewrite must preserve every value.
        if not lock_first:
            for statement in program["lockSql"]:
                reader.execute(statement)
        before_query = admissions(reader, guard_programs)
        rows = original_query(reader, program)
        after_query = admissions(reader, guard_programs)
        fresh_after = admissions(fixture, guard_programs)
        reader.execute("ROLLBACK")
    return {"order": "original-locks-before-role" if lock_first else "role-before-original-locks",
            "roleObservation": role, "snapshotBeforeRelationLock": snapshot_before_lock,
            "snapshotAfterEarlyLocksBeforeRole": snapshot_after_early_locks,
            "originalLockSql": program["lockSql"], "rewriteSql": REWRITE,
            "rewriteError": ddl_error, "nativeBefore": before_native,
            "nativeAfter": after_native,
            "relfilenodeChanged": before_native[1] != after_native[1],
            "knownRows": expected, "freshRowsAfterRewrite": independent_rows,
            "freshAdmissionsBefore": fresh_before, "readerAdmissionsBeforeQuery": before_query,
            "readerOriginalQueryRows": rows, "readerAdmissionsAfterQuery": after_query,
            "freshAdmissionsAfter": fresh_after}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-owned-fixture", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, default=55523)
    args = parser.parse_args()
    if not args.run_owned_fixture:
        parser.error("review first; explicit --run-owned-fixture is required")
    out = args.output.resolve()
    if out.parent != Path("/private/tmp") or not out.name.startswith("sdk-rr-read-consistency-"):
        parser.error("a fresh owned /private/tmp/sdk-rr-read-consistency-* output is required")
    if not 1024 <= args.port <= 65535:
        parser.error("invalid local fixture port")
    pins = json.loads(PINS.read_text())
    site = Path(umf_access.__file__).parent.parent
    assert "site-packages" in str(site)
    for name, expected in pins["payloads"].items():
        assert digest((site / name).read_bytes()) == expected, name
    program = json.loads(PROGRAM.read_text())
    request = json.loads(INPUT.read_text())
    assert program["version"] == "weft.raw-read/0.1" and program["target"] == "postgresql18"
    assert program["binding"] == request["binding"]
    assert program["obligations"]["nativeProjection"]["verificationProfile"] == "source-exact/0.1"
    guards = _projection_admissions(program["obligations"], "native_app")
    out.mkdir(exist_ok=False)
    (out / "socket").mkdir()
    shutil.copyfile(__file__, out / "harness.py")
    shutil.copyfile(INPUT, out / "original-request.json")
    shutil.copyfile(PROGRAM, out / "original-program.json")
    started = initialized = start_attempted = False
    fixture = None
    cleanup = {"fixtureRestored": False, "ownedServerStopped": False}
    try:
        command(PG / "initdb", "-D", out / "data", "-A", "trust", "--no-sync")
        start_attempted = True
        command(PG / "pg_ctl", "-D", out / "data", "-l", out / "server.log", "-o",
                f"-F -k {out / 'socket'} -c listen_addresses='' -p {args.port}", "-w", "start")
        started = True
        dsn = f"host={out / 'socket'} port={args.port} dbname=postgres options='-c search_path=pg_catalog,native_app,pg_temp'"
        fixture = psycopg.connect(dsn, autocommit=True)
        assert fixture.info.server_version == 180006
        fixture.execute("CREATE SCHEMA native_app")
        fixture.execute('CREATE TABLE native_app.orders(id text COLLATE pg_catalog."C" PRIMARY KEY,'
                        'status text COLLATE pg_catalog."C",amount numeric(12,2))')
        initialized = True
        restore_rows(fixture)
        observations = []
        for lock_first in (False, True):
            restore_rows(fixture)
            observations.append(observe_case(dsn, fixture, program, guards, lock_first=lock_first))
        ordinary, early = observations
        # Native mechanism controls; do not infer a rewrite from the SQL spelling.
        assert ordinary["rewriteError"] is None and ordinary["relfilenodeChanged"]
        assert early["rewriteError"] is not None and not early["relfilenodeChanged"]
        assert early["readerOriginalQueryRows"] == [(row[0],) for row in KNOWN]
        assert all_true(early["readerAdmissionsBeforeQuery"]) and all_true(early["readerAdmissionsAfterQuery"])
        mismatch = ordinary["readerOriginalQueryRows"] != [(row[0],) for row in KNOWN]
        reader_admissions_true = (all_true(ordinary["readerAdmissionsBeforeQuery"])
                                  and all_true(ordinary["readerAdmissionsAfterQuery"]))
        status = ("INCONCLUSIVE_READER_ADMISSION_REFUSED" if not reader_admissions_true
                  else "READ_CONSISTENCY_WINDOW_REPRODUCED" if mismatch else "NOT_REPRODUCED")
        report = {"status": status, "readerRowMismatch": mismatch,
                  "readerBothAdmissionSetsTrue": reader_admissions_true,
                  "scope": "Owned local original-query/admission execution-order regression; not full SDK actor/deployment qualification",
                  "roleScope": "Fresh fixture bootstrap identity; flags recorded, no GRANT/REVOKE/CREATE ROLE/SET ROLE",
                  "originalRequestSHA256": digest(INPUT.read_bytes()),
                  "originalProgramSHA256": digest(PROGRAM.read_bytes()),
                  "originalRoleSql": _ROLE, "observations": observations,
                  "sdkCompilerPayloads": pins["payloads"]}
        dump(out / "verification.json", report)
        return 2 if not reader_admissions_true else 1 if mismatch else 0
    finally:
        try:
            if fixture is not None:
                try:
                    if initialized:
                        restore_rows(fixture)
                        cleanup["fixtureRestored"] = True
                except psycopg.Error as error:
                    cleanup["restoreError"] = {"type": type(error).__name__, "message": str(error)}
                finally:
                    fixture.close()
        finally:
            try:
                if started or (start_attempted and (out / "data/postmaster.pid").exists()):
                    command(PG / "pg_ctl", "-D", out / "data", "-m", "fast", "-w", "stop")
                cleanup["ownedServerStopped"] = True
            finally:
                dump(out / "cleanup.json", cleanup)


if __name__ == "__main__":
    raise SystemExit(main())
