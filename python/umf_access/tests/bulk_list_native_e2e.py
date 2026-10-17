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

pg = Path(os.environ["UMF_BULK_LIST_OUTPUT"])
pg.mkdir(parents=True, exist_ok=False)
(pg / "socket").mkdir()
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
        f"-F -k {pg / 'socket'} -c listen_addresses='' -p 55503",
        "-w",
        "start",
    )
    started = True
    base = f"host={pg / 'socket'} port=55503 dbname=postgres"
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
    admin.execute("INSERT INTO native_app.orders VALUES ('o-1','draft')")
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

    request = json.loads(
        (root / "fixtures/access/native-bulk-list/request.json").read_text()
    )
    request["binding"]["schema"] = "native_app"
    generated = Path(os.environ["UMF_NATIVE_GENERATED_ROOT"])
    (generated / "native_declarations.py").write_text(
        "from umf_access import command, Param\nfrom native_sales.models import Order\nfrom native_sales.actions import SetStatus\n@command(action=SetStatus)\ndef set_selected(ids: Param[list[str | None]], before: Param[str], after: Param[str]):\n    return Order.objects.filter(Order.c.id.is_in(ids), Order.c.status == before).update(status=after)\n@command(action=SetStatus)\ndef set_outside(ids: Param[list[str | None]], after: Param[str]):\n    return Order.objects.filter(Order.c.id.not_in(ids)).update(status=after)\n"
    )
    configuration = {
        "package": "native_sales",
        "modules": ["native_declarations"],
        "targets": [
            {
                "id": "local",
                "kind": "postgresql",
                "backendId": "weft-postgresql",
                "backendVersion": "raw-read/0.1",
                "targetProfile": "weft.raw-read/0.1",
                "binding": request["binding"],
                "platform": [{"name": "postgresql", "versions": ["180006"]}],
                "security": request["security"],
                "roleMappings": request["roleMappings"],
                "sessionPrincipal": "human",
                "maxItems": 3,
            }
        ],
    }
    (generated / "native-catalog-config.json").write_text(json.dumps(configuration))
    for extra in ([], ["--check"]):
        command(
            sys.executable,
            "-B",
            "-m",
            "umf_access.build.catalog",
            "catalog",
            "--config",
            generated / "native-catalog-config.json",
            "--root",
            generated,
            *extra,
        )
    from native_sales import queries

    cases.append(
        "real catalog CLI publishes and checks all selected action programs and captured bulk command"
    )
    import copy

    from umf_access.reviewed import parameter_signature

    original_action = copy.deepcopy(request)
    original_action["source"].update(
        action="setStatus", actionPointer="/modules/0/extensions/umf.actions/actions/5"
    )
    list_parameter = {"name": "ids", **parameter_signature(list[str | None])}
    scalar_parameters = [
        {"name": "before", **parameter_signature(str)},
        {"name": "after", **parameter_signature(str)},
    ]
    owner_request = {
        "version": "weft.native-bulk/0.1",
        "action": original_action,
        "selection": {
            "version": "weft.raw-read/0.1",
            "target": "postgresql18",
            "sql": "SELECT r.id AS id,r.status AS status FROM sales.order r WHERE r.id IN (:ids) AND r.status=:before ORDER BY r.id ASC",
            "binding": request["binding"],
            "parameters": [list_parameter, scalar_parameters[0]],
            "rowCap": 4,
        },
        "maxItems": 3,
        "actionInputs": {"status": "after"},
        "parameters": [list_parameter, *scalar_parameters],
    }
    original_program = json.loads(
        weft.compile_native_bulk_json(json.dumps(owner_request))
    )
    assert original_program["status"] == "compiled", original_program
    assert original_program["parameters"] == owner_request["parameters"]
    slots = [
        slot
        for slot in original_program["selection"]["parameters"]
        if slot["source"] == {"bulkInput": "ids"}
    ]
    assert len(slots) == 1
    assert {
        name: slots[0][name]
        for name in ("carrier", "container", "elementNullable", "maxItems")
    } == {
        name: list_parameter[name]
        for name in ("carrier", "container", "elementNullable", "maxItems")
    }
    (pg / "original-bulk-list-request.json").write_text(
        json.dumps(owner_request, indent=2)
    )
    (pg / "original-bulk-list-program.json").write_text(
        json.dumps(original_program, indent=2)
    )
    faults = []
    for field, value in (
        ("container", None),
        ("elementNullable", False),
        ("maxItems", 999),
        ("nullable", True),
    ):
        changed = copy.deepcopy(owner_request)
        changed["parameters"] = copy.deepcopy(changed["parameters"])
        changed["parameters"][0][field] = value
        assert changed["parameters"][0] != changed["selection"]["parameters"][0]
        result = json.loads(weft.compile_native_bulk_json(json.dumps(changed)))
        assert result["status"] == "blocked", (field, result)
        faults.append({"field": field, "original": result})
    (pg / "conflicting-list-facet-refusals.json").write_text(
        json.dumps(faults, indent=2)
    )
    cases.append(
        "matching original compiler preserves every bounded-list facet in admission and native binding slots; conflicting facets refuse"
    )

    programs = []
    for index, action in enumerate(
        json.loads(request["binding"]["modelJson"])["modules"][0]["extensions"][
            "umf.actions"
        ]["actions"]
    ):
        import copy

        selected = copy.deepcopy(request)
        selected["source"]["action"] = action["id"]
        selected["source"]["actionPointer"] = (
            f"/modules/0/extensions/umf.actions/actions/{index}"
        )
        programs.append(
            NativeProgram.build(
                weft, selected, bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST
            )
        )
    program = programs[0]

    class Admission:
        def admit(self, conn, program, *, deadline):
            # The owner deployment fixture and the runtime share this transactional
            # fence. The application identity has no owner, DDL, role or bypass power.
            conn.execute("SELECT pg_advisory_xact_lock_shared(8117003)")
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

    conn = psycopg.connect(base + " user=erik")
    from pydantic import ValidationError
    from umf_access.postgres_bulk import PostgresBulkTarget
    from umf_access.protocols import ActionDenied
    from umf_access.reviewed import ReadBuildError
    from umf_access.targets import PostgresConfiguration, binding_digest

    target = PostgresBulkTarget(
        conn,
        PostgresConfiguration(
            "native_app",
            binding_digest(request["binding"]),
            (180006,),
            timedelta(seconds=5),
        ),
        Admission(),
    )
    admin.execute(
        "INSERT INTO native_app.orders VALUES ('o-2','draft'),('o-3','draft')"
    )

    def rows():
        return admin.execute(
            'SELECT id,status FROM native_app.orders ORDER BY id COLLATE "C"'
        ).fetchall()

    baseline = rows()
    selected = queries.set_selected(
        target, ids=["o-1", None, "o-1"], before="draft", after="first"
    )
    assert selected.preview().selected == (OrderKey(id="o-1"),) and rows() == baseline
    outcome = selected.execute()
    assert (outcome.selected, outcome.changed) == (1, 1)
    assert rows() == [("o-1", "first"), ("o-2", "draft"), ("o-3", "draft")]
    assert admin.execute(
        "SELECT pg_xact_status(%s::xid8)", (outcome.receipt.version,)
    ).fetchone() == ("committed",)
    assert outcome.original.profile == "umf.actions.native-bulk/0.1"
    cases.append(
        "generated list selection preserves nullable members and duplicates, scalar filter/assignment, read-only preview and exact committed native receipt"
    )

    for values in ([], [None], ["not-present"]):
        before = rows()
        result = queries.set_selected(
            target, ids=values, before="draft", after="not-written"
        ).execute()
        assert (result.selected, result.changed) == (0, 0) and rows() == before
    # Governed S8 ignores null list members for nonnull x; NOT IN is S2
    # negation, not the different SQL NOT IN (..., NULL) truth table.
    result = queries.set_outside(target, ids=[None], after="null-ignored").execute()
    assert (result.selected, result.changed) == (3, 3)
    assert rows() == [
        ("o-1", "null-ignored"),
        ("o-2", "null-ignored"),
        ("o-3", "null-ignored"),
    ]
    result = queries.set_outside(target, ids=[], after="all").execute()
    assert (result.selected, result.changed) == (3, 3)
    assert rows() == [("o-1", "all"), ("o-2", "all"), ("o-3", "all")]
    cases.append(
        "original native SQL implements governed S8 empty/null-list membership and S2 NOT IN with independent exact table oracle"
    )

    for bad in (None, [True], [1], ["o-1"] * 1001):
        before = rows()
        try:
            queries.set_selected(
                target, ids=bad, before="all", after="not-written"
            ).execute()
        except (ValidationError, ReadBuildError):
            pass
        else:
            raise AssertionError("invalid original list value reached native effects")
        assert rows() == before and conn.info.transaction_status == 0
    cases.append(
        "nullable outer list, wrong exact element carriers and above-original bound refuse without native effects or open transaction"
    )

    admin.execute("INSERT INTO native_app.orders VALUES ('o-4','all')")
    before = rows()
    over = queries.set_outside(target, ids=[], after="not-written")
    for call in (over.preview, over.execute):
        try:
            call()
        except ActionRefused as error:
            assert error.code == "BULK_LIMIT"
        else:
            raise AssertionError(
                "bulk maxItems silently truncated list-filter selection"
            )
        assert rows() == before and conn.info.transaction_status == 0
    admin.execute("DELETE FROM native_app.orders WHERE id='o-4'")
    cases.append(
        "original native bulk selection maxItems sentinel rolls back preview and execute without partial mutation"
    )

    before = rows()
    admin.execute("REVOKE native_approver FROM erik")
    try:
        queries.set_selected(
            target, ids=["o-1", "o-2"], before="all", after="not-written"
        ).execute()
    except ActionDenied as error:
        assert error.code == "ROLE_DENIED" and error.original is not None
    else:
        raise AssertionError("revoked actual native role permitted bulk list mutation")
    assert rows() == before and conn.info.transaction_status == 0
    admin.execute("GRANT native_approver TO erik")
    restored = queries.set_selected(
        target, ids=["o-2", "o-3"], before="all", after="restored"
    ).execute()
    assert (restored.selected, restored.changed) == (2, 2)
    assert rows() == [("o-1", "all"), ("o-2", "restored"), ("o-3", "restored")]
    cases.append(
        "current native role revocation refuses with original outcome and confirmed rollback; new call after grant succeeds"
    )
    (pg / "independent-native-final-rows.json").write_text(json.dumps(rows()))
    (pg / "verification.json").write_text(
        json.dumps(
            {
                "status": "pass",
                "cases": cases,
                "temporal": "HELD",
                "scope": "Owned constrained PostgreSQL18 generated scalar-action bulk list selection only; no managed/engine write or temporal qualification",
            },
            indent=2,
        )
    )
    conn.close()
    admin.close()
    print(json.dumps({"status": "pass", "cases": cases, "output": str(pg)}, indent=2))
finally:
    if started:
        command(bin / "pg_ctl", "-D", pg / "data", "-m", "fast", "-w", "stop")
    assert not (pg / "data/postmaster.pid").exists()
    (pg / "cleanup.json").write_text(json.dumps({"ownedServerStopped": True}))
    print("ownedServerStopped=true")
