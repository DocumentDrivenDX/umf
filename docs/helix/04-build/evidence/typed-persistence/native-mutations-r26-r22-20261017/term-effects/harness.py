import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, os.environ["UMF_NATIVE_GENERATED_ROOT"])
from datetime import (
    timedelta,
)

import psycopg
import weft
from native_sales.actions import (
    ApproveInput,
)
from native_sales.keys import (
    OrderKey,
)
from umf_access.native_actions import (
    NativeProgram,
    NativeScope,
)
from umf_access.protocols import (
    ActionRefused,
)

pg = Path(os.environ["UMF_BULK_TERMS_OUTPUT"])
pg.mkdir(parents=True, exist_ok=False)
(pg / "socket").mkdir()
(pg / "harness.py").write_bytes(Path(__file__).read_bytes())
bin = Path("/opt/homebrew/opt/postgresql@18/bin")
started = False
cases = []


def command(*args):
    p = subprocess.run(
        list(map(str, args)), text=True, capture_output=True, check=False
    )
    if p.returncode:
        raise RuntimeError(p.stdout + p.stderr)
    return p.stdout


try:
    command(
        bin / "initdb", "-D", pg / "data", "-U", "sdk_test", "-A", "trust", "--no-sync"
    )
    (pg / "data/pg_hba.conf").write_text(
        "local all erik peer\nlocal all sdk_test trust\nlocal all deploy_actor trust\nlocal all all reject\n"
    )
    command(
        bin / "pg_ctl",
        "-D",
        pg / "data",
        "-l",
        pg / "server.log",
        "-o",
        f"-F -k {pg / 'socket'} -c listen_addresses='' -p 55516",
        "-w",
        "start",
    )
    started = True
    base = f"host={pg / 'socket'} port=55516 dbname=postgres"
    admin = psycopg.connect(base + " user=sdk_test", autocommit=True)
    admin.execute(
        "CREATE ROLE erik LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
    )
    admin.execute("CREATE ROLE native_approver NOLOGIN")
    admin.execute("GRANT native_approver TO erik")
    admin.execute(
        "CREATE ROLE deploy_actor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
    )

    admin.execute("CREATE SCHEMA native_app")
    admin.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    admin.execute(
        'CREATE TABLE native_app.orders (id text COLLATE "C" PRIMARY KEY,status text COLLATE "C" NOT NULL)'
    )
    admin.execute("INSERT INTO native_app.orders VALUES ('o-1','running')")
    admin.execute("GRANT USAGE ON SCHEMA native_app TO erik")
    admin.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON native_app.orders TO erik")
    scope = admin.execute(
        "SELECT system_identifier::text,(SELECT oid::text FROM pg_database WHERE datname=current_database()),pg_postmaster_start_time()::text FROM pg_control_system()"
    ).fetchone()
    store = json.dumps(
        {
            "systemIdentifier": scope[0],
            "databaseOid": scope[1],
            "databaseName": "postgres",
        },
        sort_keys=True,
    )
    epoch = scope[2]
    admin.execute(
        "CREATE FUNCTION native_app.sdk_scope() RETURNS TABLE(system_id text,database_oid text,epoch text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT system_identifier::text,(SELECT oid::text FROM pg_database WHERE datname=current_database()),pg_postmaster_start_time()::text FROM pg_control_system() $$"
    )
    admin.execute("REVOKE ALL ON FUNCTION native_app.sdk_scope() FROM PUBLIC")
    admin.execute("GRANT EXECUTE ON FUNCTION native_app.sdk_scope() TO erik")
    admin.execute("GRANT USAGE ON SCHEMA native_app TO deploy_actor")
    admin.execute(
        "CREATE FUNCTION native_app.revoke_approver() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_advisory_xact_lock(8117003); REVOKE native_approver FROM erik; END $$"
    )
    admin.execute("REVOKE ALL ON FUNCTION native_app.revoke_approver() FROM PUBLIC")
    admin.execute(
        "GRANT EXECUTE ON FUNCTION native_app.revoke_approver() TO deploy_actor"
    )

    request = json.loads(Path(os.environ["UMF_BULK_TERMS_REQUEST"]).read_text())
    owner_request = request
    request = owner_request["action"]
    unqualified = True
    from native_sales.actions import Approve
    from umf_access.postgres_bulk import native_bulk_plan
    program = NativeProgram.build(weft, owner_request, bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST)
    (pg / "original-request.json").write_text(json.dumps(owner_request, indent=2))
    (pg / "original-program.json").write_text(program.original_json)
    admin.execute("CREATE INDEX orders_status_text ON native_app.orders USING gin(pg_catalog.to_tsvector('pg_catalog.english'::regconfig,COALESCE(status,''::text)))")
    original = program.checked()
    fence = original["obligations"]["nativeCatalogFence"]
    deployment = fence["deployment"]
    deployment_program = fence["deploymentProgram"]
    from psycopg import sql as native_sql
    admin.execute(native_sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION").format(native_sql.Identifier(deployment["owner"])))
    admin.execute(native_sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(native_sql.Identifier(deployment["schema"]), native_sql.Identifier(deployment["owner"])))
    for relation in deployment_program["ownerPrerequisites"]["catalogMaintain"]:
        schema, table = relation.split(".")
        admin.execute(native_sql.SQL("GRANT MAINTAIN ON {}.{} TO {}").format(native_sql.Identifier(schema), native_sql.Identifier(table), native_sql.Identifier(deployment["owner"])))
    admin.execute(deployment_program["createViewSql"])
    admin.execute(deployment_program["alterOwnerSql"])
    admin.execute(native_sql.SQL("GRANT USAGE ON SCHEMA {} TO erik").format(native_sql.Identifier(deployment["schema"])))
    admin.execute(native_sql.SQL("GRANT MAINTAIN ON {}.{} TO erik").format(native_sql.Identifier(deployment["schema"]), native_sql.Identifier(deployment["view"])))
    cases.append("explicit original deploymentProgram applied only by owned deployment identity")
    class Admission:
        shadow = False

        def admit(self, conn, program, *, deadline):
            # The owner deployment fixture and the runtime share this transactional
            # fence. The application identity has no owner, DDL, role or bypass power.
            conn.execute("SELECT pg_advisory_xact_lock_shared(8117003)")
            if unqualified:
                schema = "shadow_app" if self.shadow else "native_app"
                conn.execute("SELECT pg_catalog.set_config('search_path',%s,true)",
                             (f"pg_catalog, {schema}, pg_temp",))
                assert conn.execute("SELECT current_schema()").fetchone() == ("pg_catalog",)
                resolved = conn.execute("SELECT to_regclass('orders')::oid='native_app.orders'::regclass::oid").fetchone()
                if resolved != (True,):
                    raise ActionRefused("NATIVE_DEPENDENCY_CONTEXT")
            roles = conn.execute(
                "SELECT session_user::text,current_user::text,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=session_user"
            ).fetchone()
            assert roles == ("erik", "erik", False, False, False)
            shape = conn.execute(
                "SELECT relkind,relhasrules,relhastriggers,relowner=(SELECT oid FROM pg_roles WHERE rolname=session_user) FROM pg_class WHERE oid='native_app.orders'::regclass"
            ).fetchone()
            if shape != ("r", False, False, False):
                raise ActionRefused("NATIVE_DEPENDENCY_CLOSURE")
            if conn.execute(
                "SELECT count(*) FROM pg_constraint WHERE conrelid='native_app.orders'::regclass AND contype IN ('c','f','x')"
            ).fetchone() != (0,):
                raise ActionRefused("NATIVE_DEPENDENCY_CLOSURE")
            if conn.execute(
                "SELECT count(*) FROM pg_attribute WHERE attrelid='native_app.orders'::regclass AND attnum>0 AND NOT attisdropped AND atthasdef"
            ).fetchone() != (0,):
                raise ActionRefused("NATIVE_DEPENDENCY_CLOSURE")
            if conn.execute(
                "SELECT relrowsecurity FROM pg_class WHERE oid='native_app.orders'::regclass"
            ).fetchone() != (False,):
                raise ActionRefused("NATIVE_RLS_PROFILE_UNQUALIFIED")
            cols = conn.execute(
                "SELECT attname,atttypid::regtype::text,attnotnull,attgenerated,attidentity FROM pg_attribute WHERE attrelid='native_app.orders'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum"
            ).fetchall()
            if cols != [("id", "text", True, "", ""), ("status", "text", True, "", "")]:
                raise ActionRefused("NATIVE_SHAPE")
            observed = conn.execute("SELECT * FROM native_app.sdk_scope()").fetchone()
            assert observed == (scope[0], scope[1], epoch)
            return NativeScope(store, epoch, "erik", "erik", self)

        def reconnect(self, conn, original, *, deadline):
            result = self.admit(conn, program.checked(), deadline=deadline)
            assert result.store == original.store and result.epoch == original.epoch
            return result

        def quarantine(self, conn, original):
            conn.close()

    conn = psycopg.connect(base + " user=erik", options="-c search_path=pg_catalog,native_app,pg_temp")
    admission = Admission()
    statements = json.loads(program.statements_json)
    class Transport:
        def __init__(self, raw, fault=False):
            self.raw, self.fault, self.changed, self.selection_calls = raw, fault, False, 0
        @property
        def info(self):
            return self.raw.info
        def execute(self, sql, parameters=None):
            if sql == statements["/selection"]["sql"]:
                self.selection_calls += 1
            cursor = self.raw.execute(sql, parameters)
            if self.fault and not self.changed and sql == statements["/update"]["sql"]:
                self.changed = True
                admin.execute("SET statement_timeout='250ms'")
                try:
                    admin.execute("ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple")
                except psycopg.errors.QueryCanceled as error:
                    assert error.sqlstate == "57014"
                    cases.append("native ALTER mapping blocked while public bulk transaction fence held")
                else:
                    raise AssertionError("native catalog fence failed to block ALTER mapping")
                finally:
                    admin.execute("RESET statement_timeout")
            return cursor
        def rollback(self):
            return self.raw.rollback()
        def commit(self):
            return self.raw.commit()
        def close(self):
            return self.raw.close()
    transport = Transport(conn)
    def plan(connection=transport):
        return native_bulk_plan(connection, program, Approve, {"terms": "run"}, admission, default_timeout=timedelta(seconds=5))
    def rows():
        return admin.execute('SELECT id,status FROM native_app.orders ORDER BY id COLLATE "C"').fetchall()
    mapping_sql = "SELECT m.maptokentype,m.mapseqno,m.mapdict,d.dictname FROM pg_ts_config_map m JOIN pg_ts_dict d ON d.oid=m.mapdict WHERE m.mapcfg='pg_catalog.english'::regconfig ORDER BY 1,2"
    mapping_before = admin.execute(mapping_sql).fetchall()
    config_identity = admin.execute("SELECT oid,cfgname,cfgnamespace FROM pg_ts_config WHERE oid='pg_catalog.english'::regconfig").fetchone()
    baseline = rows()
    assert plan().preview().selected == (OrderKey(id="o-1"),) and rows() == baseline
    outcome = plan().execute()
    assert (outcome.selected,outcome.changed) == (1,1) and rows() == [("o-1","approved")]
    cases.append("original term-filtered bulk preview and atomic commit")
    admin.execute("UPDATE native_app.orders SET status='running'")
    try:
        admin.execute("ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple")
        assert admin.execute("SELECT oid,cfgname,cfgnamespace FROM pg_ts_config WHERE oid='pg_catalog.english'::regconfig").fetchone() == config_identity
        assert admin.execute(mapping_sql).fetchall() != mapping_before
        before = rows()
        calls_before = transport.selection_calls
        try:
            drift_outcome = plan().execute()
        except ActionRefused as error:
            assert error.code == "NATIVE_TEXT_SEARCH_EFFECT_MISMATCH" or error.code == "NATIVE_TERM_MISMATCH", error
            assert rows() == before and transport.selection_calls == calls_before
            cases.append("same native configuration identity with changed dictionary mapping refused before mutation")
        else:
            if os.environ.get("UMF_BULK_TERMS_LEGACY_RED") != "1":
                raise AssertionError("dictionary drift reached bulk result")
            assert transport.selection_calls > calls_before
            cases.append({"expectedLegacyRed": True, "selectionDataCalls": transport.selection_calls-calls_before, "selected": drift_outcome.selected, "changed": drift_outcome.changed})
    finally:
        admin.execute("ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.english_stem")
    assert admin.execute(mapping_sql).fetchall() == mapping_before
    assert conn.info.transaction_status == 0
    admin.execute("UPDATE native_app.orders SET status='running'")
    fault = Transport(conn, fault=True)
    outcome = plan(fault).execute()
    assert fault.changed and fault.selection_calls == 1 and outcome.changed == 1
    assert rows() == [("o-1", "approved")]
    assert admin.execute(mapping_sql).fetchall() == mapping_before
    cases.append("blocked concurrent configuration mutation preserves original atomic public bulk outcome")
    admin.execute("UPDATE native_app.orders SET status='running'")
    admin.execute("CREATE INDEX undeclared_expression ON native_app.orders ((pg_catalog.length(status)))")
    try:
        before = rows()
        calls_before = transport.selection_calls
        try:
            plan().execute()
        except ActionRefused as error:
            assert error.code == "NATIVE_SCHEMA_MISMATCH", error
        else:
            raise AssertionError("undeclared expression index accepted")
        assert rows() == before and transport.selection_calls == calls_before
        cases.append("original unknown expression-index guard refuses before selection or mutation")
    finally:
        admin.execute("DROP INDEX native_app.undeclared_expression")
    conn.close()
    (pg / "verification.json").write_text(json.dumps({"status":"EXPECTED_LEGACY_RED" if os.environ.get("UMF_BULK_TERMS_LEGACY_RED") == "1" else "PASS","cases":cases,"configurationIdentity":config_identity,"mappingBeforeAfter":mapping_before},default=str,indent=2))
finally:
    if started:
        command(bin / "pg_ctl", "-D", pg / "data", "-m", "fast", "-w", "stop")
    (pg / "cleanup.json").write_text(json.dumps({"ownedServerStopped":True}))

if os.environ.get("UMF_BULK_TERMS_LEGACY_RED") == "1":
    raise SystemExit(1)
