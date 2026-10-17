import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from importlib.metadata import version
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, os.environ["UMF_NATIVE_GENERATED_ROOT"])
from datetime import (
    timedelta,
)

import psycopg
import weft
from native_sales.actions import (
    Actions,
    Approve,
    ApproveInput,
    CreateOrderInput,
    FirstFalse,
    Guarded,
    PostFail,
)
from native_sales.keys import (
    OrderKey,
)
from umf_access.native_actions import (
    NativeProgram,
    NativeScope,
    PostgresActionExecutor,
)
from umf_access.protocols import (
    ActionRefused,
    Committed,
    Denied,
    Rejected,
)

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


request = json.loads((root / "fixtures/access/native-actions/request.json").read_text())
request["binding"]["schema"] = "native_app"
generated = Path(os.environ["UMF_NATIVE_GENERATED_ROOT"])
(generated / "native_declarations.py").write_text(
    'from umf_access import query, command, Param\nfrom native_sales.models import Order\nfrom native_sales.actions import Approve\n@query\ndef orders():\n    return Order.objects.limit(10).all()\n@command(action=Approve)\ndef approve_drafts(status: Param[str]):\n    return Order.objects.filter(Order.c.status == status).update(status="approved")\n'
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
stage_one = json.loads((generated / "stage-one-request.json").read_text())
documents = []
for original in stage_one["sources"]:
    path = "original-" + original["id"] + ".json"
    (generated / path).write_text(original["text"])
    documents.append(
        {
            "path": path,
            "sha256": hashlib.sha256(original["text"].encode()).hexdigest(),
        }
    )
configuration["umf"] = {"documents": documents}
configuration["weft"] = {"distribution": "weft-sql", "version": version("weft-sql")}
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

if os.environ.get("UMF_NATIVE_BUILD_ONLY") == "1":
    print(
        json.dumps(
            {"publicCliStatus": "pass", "nativeExecuted": False, "temporal": "HELD"}
        )
    )
    raise SystemExit(0)

pg = Path(tempfile.mkdtemp(prefix="umf-native-actions-", dir="/private/tmp"))
(pg / "socket").mkdir()

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
        f"-F -k {pg / 'socket'} -c listen_addresses='' -p 55493",
        "-w",
        "start",
    )
    started = True
    base = f"host={pg / 'socket'} port=55493 dbname=postgres"
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

    cases.append(
        "real catalog CLI publishes and checks all selected action programs and captured bulk command"
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
    executor = PostgresActionExecutor(
        conn, tuple(programs), Admission(), default_timeout=timedelta(seconds=5)
    )
    actions = Actions(executor)
    result = actions.approve(ApproveInput(order=OrderKey(id="o-1")))
    assert (
        isinstance(result, Committed)
        and result.changed == (OrderKey(id="o-1"),)
        and result.original.no_op is False
    )
    assert admin.execute(
        "SELECT status FROM native_app.orders WHERE id='o-1'"
    ).fetchone() == ("approved",)
    assert admin.execute(
        "SELECT pg_xact_status(%s::xid8)", (result.receipt.version,)
    ).fetchone() == ("committed",)
    cases.append("source-generated-client native commit and original xid8")
    result = actions.approve(ApproveInput(order=OrderKey(id="o-1")))
    assert result.changed == () and result.original.no_op is True
    cases.append("native explicit no-op guard")
    result = executor.invoke(Approve, {"order": OrderKey(id="missing")})
    assert isinstance(result, Rejected) and result.code == "ENTITY_MISSING"
    cases.append("missing entity rejected with confirmed rollback")
    result = executor.validate(Approve, {"order": OrderKey(id="o-1")})
    assert result.valid and result.complete and conn.info.transaction_status == 0
    cases.append("validate always rollback")
    result = executor.invoke(Guarded, {"order": OrderKey(id="o-1")})
    assert isinstance(result, Rejected) and result.code == "NOT_DRAFT"
    cases.append("original precondition business rejection")
    result = executor.invoke(FirstFalse, {"order": OrderKey(id="o-1")})
    assert (
        isinstance(result, Rejected)
        and result.code == "FIRST"
        and len(json.loads(result.original.verification_json)) == 1
    )
    from umf_access.protocols import ActionFailed

    try:
        executor.validate(FirstFalse, {"order": OrderKey(id="o-1")})
    except ActionFailed as error:
        assert (
            error.code == "RULE_EVALUATION"
            and len(json.loads(error.original.verification_json)) == 2
        )
    else:
        raise AssertionError(
            "validate skipped the later original rule evaluation error"
        )
    assert conn.info.transaction_status == 0
    cases.append(
        "invoke stops at first false; validate evaluates later rule and distinguishes absent-frame evaluation error"
    )

    admin.execute("UPDATE native_app.orders SET status='draft'")
    from umf_access.protocols import ActionFailed

    try:
        executor.invoke(PostFail, {"order": OrderKey(id="o-1")})
    except ActionFailed as error:
        assert error.code == "POSTCONDITION_POST_REFUSED"
    else:
        raise AssertionError("postcondition failure committed")
    assert admin.execute(
        "SELECT status FROM native_app.orders WHERE id='o-1'"
    ).fetchone() == ("draft",)
    cases.append("postcondition failure rolls back actual write")
    created = actions.create_order(CreateOrderInput(id="o-2", status="draft"))
    assert created.created == (OrderKey(id="o-2"),) and created.changed == ()
    cases.append("explicit complete-key native creation")
    try:
        actions.create_order(CreateOrderInput(id="o-2", status="other"))
    except ActionFailed as error:
        assert getattr(error.cause, "sqlstate", None) == "23505"
    else:
        raise AssertionError("duplicate primary Key accepted")
    assert admin.execute(
        "SELECT status FROM native_app.orders WHERE id='o-2'"
    ).fetchone() == ("draft",)
    cases.append("native primary-key violation confirms rollback")
    # Both real SERIALIZABLE transactions establish their snapshot before
    # either can update. The loser must report the native conflict without retry.
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from umf_access.protocols import Conflict

    gate = Barrier(2)

    class ConcurrentAdmission(Admission):
        def admit(self, connection, program, *, deadline):
            original = super().admit(connection, program, deadline=deadline)
            gate.wait(timeout=4)
            return original

    def concurrent_action():
        with psycopg.connect(base + " user=erik") as connection:
            current = PostgresActionExecutor(
                connection,
                tuple(programs),
                ConcurrentAdmission(),
                default_timeout=timedelta(seconds=5),
            )
            answer = current.invoke(Approve, {"order": OrderKey(id="o-1")})
            assert connection.info.transaction_status == 0
            return answer

    admin.execute("UPDATE native_app.orders SET status='draft' WHERE id='o-1'")
    with ThreadPoolExecutor(max_workers=2) as workers:
        futures = [workers.submit(concurrent_action) for _ in range(2)]
        outcomes = [future.result(timeout=10) for future in futures]
    assert sum(isinstance(o, Committed) for o in outcomes) == 1, outcomes
    assert (
        sum(
            isinstance(o, Conflict) and o.code == "40001" and not o.retained
            for o in outcomes
        )
        == 1
    ), outcomes
    assert admin.execute(
        "SELECT status FROM native_app.orders WHERE id='o-1'"
    ).fetchone() == ("approved",)
    cases.append(
        "actual concurrent SERIALIZABLE writes yield one commit and one native conflict without retry"
    )
    admin.execute("REVOKE native_approver FROM erik")
    result = executor.invoke(Approve, {"order": OrderKey(id="o-1")})
    assert isinstance(result, Denied)
    cases.append("native session membership denial")
    admin.execute("GRANT native_approver TO erik")
    admin.execute("REVOKE UPDATE ON native_app.orders FROM erik")
    result = executor.invoke(Approve, {"order": OrderKey(id="o-1")})
    assert isinstance(result, Denied) and conn.info.transaction_status == 0
    admin.execute("GRANT UPDATE ON native_app.orders TO erik")
    cases.append(
        "native UPDATE privilege denial remains Denied with confirmed rollback"
    )
    from umf_access.protocols import TimedOut

    admin.execute("BEGIN")
    admin.execute("SELECT * FROM native_app.orders WHERE id='o-1' FOR UPDATE")
    try:
        result = executor.invoke(
            Approve, {"order": OrderKey(id="o-1")}, timeout=timedelta(milliseconds=30)
        )
        assert isinstance(result, TimedOut) and conn.info.transaction_status == 0
    finally:
        admin.execute("ROLLBACK")
    cases.append(
        "actual native row-lock timeout confirms rollback before returning TimedOut"
    )

    # Lose the commit acknowledgement after a real native COMMIT. Reconciliation
    # uses another actual connection, original store/epoch and the retained xid8.
    class LostAck:
        def __init__(self, connection):
            self.original = connection
            self.commits = 0

        @property
        def info(self):
            return self.original.info

        def execute(self, *args, **kwargs):
            return self.original.execute(*args, **kwargs)

        def rollback(self):
            return self.original.rollback()

        def commit(self):
            self.commits += 1
            self.original.commit()
            raise OSError("injected loss after native COMMIT")

        def close(self):
            self.original.close()

    lost = LostAck(psycopg.connect(base + " user=erik"))
    recovered = PostgresActionExecutor(
        lost,
        tuple(programs),
        Admission(),
        default_timeout=timedelta(seconds=5),
        reconnect=lambda: psycopg.connect(base + " user=erik"),
    )
    admin.execute("UPDATE native_app.orders SET status='draft' WHERE id='o-1'")
    result = recovered.invoke(Approve, {"order": OrderKey(id="o-1")})
    assert (
        isinstance(result, Committed)
        and lost.commits == 1
        and lost.original.closed
        and recovered.quarantined
    )
    assert result.receipt.epoch == epoch and result.original.recovery is not None
    cases.append(
        "lost native COMMIT acknowledgement reconciles original xid8 once and quarantines original connection"
    )
    lost = LostAck(psycopg.connect(base + " user=erik"))
    unknown = PostgresActionExecutor(
        lost, tuple(programs), Admission(), default_timeout=timedelta(seconds=5)
    )
    from umf_access.protocols import Indeterminate

    result = unknown.invoke(Approve, {"order": OrderKey(id="o-1")})
    assert (
        isinstance(result, Indeterminate)
        and unknown.quarantined
        and lost.original.closed
        and result.original.receipt is not None
    )
    cases.append(
        "unavailable reconciliation retains original receipt and returns Indeterminate without retry"
    )
    import asyncio

    from umf_access.native_actions import AsyncPostgresActionExecutor

    class AsyncAdmission:
        async def admit(self, conn, program, *, deadline):
            await conn.execute("SELECT pg_advisory_xact_lock_shared(8117003)")
            cursor = await conn.execute("SELECT session_user::text,current_user::text")
            assert await cursor.fetchone() == ("erik", "erik")
            return NativeScope(store, epoch, "erik", "erik", self)

        async def reconnect(self, conn, original, *, deadline):
            return await self.admit(conn, program.checked(), deadline=deadline)

        async def quarantine(self, conn, original):
            await conn.close()

    async def async_cases():
        c = await psycopg.AsyncConnection.connect(base + " user=erik")
        e = AsyncPostgresActionExecutor(
            c, tuple(programs), AsyncAdmission(), default_timeout=timedelta(seconds=5)
        )
        admin.execute("UPDATE native_app.orders SET status='draft'")
        result = await Actions(e).approve(ApproveInput(order=OrderKey(id="o-1")))
        assert result.changed == (OrderKey(id="o-1"),)
        result = await e.validate(Approve, {"order": OrderKey(id="o-1")})
        assert result.valid and c.info.transaction_status == 0
        cases.append("real async generated client and validation rollback")
        # Hold a native row lock so cancellation occurs in original business I/O.
        admin.execute("BEGIN")
        admin.execute("SELECT * FROM native_app.orders FOR UPDATE")
        task = asyncio.create_task(e.invoke(Approve, {"order": OrderKey(id="o-1")}))
        await asyncio.sleep(0.05)
        task.cancel()
        from umf_access.protocols import ActionFailed

        try:
            await task
        except ActionFailed as error:
            assert error.code == "CANCELLED" and error.original is not None
        else:
            raise AssertionError("cancelled action did not retain rollback outcome")
        assert c.info.transaction_status == 0
        admin.execute("ROLLBACK")
        cases.append(
            "async cancellation confirms rollback and preserves original custody"
        )
        entered, release = asyncio.Event(), asyncio.Event()

        class HeldRollback:
            def __getattr__(self, name):
                return getattr(c, name)

            async def rollback(self):
                entered.set()
                await release.wait()
                return await c.rollback()

        repeated = AsyncPostgresActionExecutor(
            HeldRollback(),
            tuple(programs),
            AsyncAdmission(),
            default_timeout=timedelta(seconds=5),
        )
        admin.execute("BEGIN")
        admin.execute("SELECT * FROM native_app.orders FOR UPDATE")
        task = asyncio.create_task(
            repeated.invoke(Approve, {"order": OrderKey(id="o-1")})
        )
        await asyncio.sleep(0.05)
        task.cancel()
        await asyncio.wait_for(entered.wait(), timeout=2)
        for _ in range(4):
            task.cancel()
            await asyncio.sleep(0)
        assert not task.done()
        release.set()
        try:
            await task
        except ActionFailed as error:
            assert error.code == "CANCELLED" and isinstance(
                error.cause, asyncio.CancelledError
            )
            assert error.original is not None
        else:
            raise AssertionError("repeated cancellation lost original settlement")
        assert c.info.transaction_status == 0
        admin.execute("ROLLBACK")
        cases.append(
            "five caller cancellations retain original cause and await actual native rollback"
        )
        await c.close()

    asyncio.run(async_cases())
    from umf_access.postgres_bulk import native_bulk_plan

    bulk_request = {
        "version": "weft.native-bulk/0.1",
        "action": request,
        "selection": {
            "version": "weft.raw-read/0.1",
            "target": "postgresql18",
            "sql": "SELECT o.id AS id, o.status AS status FROM sales.order AS o ORDER BY o.id ASC",
            "binding": request["binding"],
            "parameters": [],
            "rowCap": 4,
        },
        "maxItems": 3,
        "actionInputs": {},
        "parameters": [],
    }
    bulk_program = NativeProgram.build(
        weft, bulk_request, bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST
    )
    plan = native_bulk_plan(
        conn,
        bulk_program,
        Approve,
        {},
        Admission(),
        default_timeout=timedelta(seconds=5),
    )
    admin.execute("UPDATE native_app.orders SET status='draft'")
    preview = plan.preview()
    assert preview.selected == (OrderKey(id="o-1"), OrderKey(id="o-2"))
    admin.execute("INSERT INTO native_app.orders VALUES ('o-3','draft')")
    result = plan.execute()
    assert (
        result.selected == 3
        and result.changed == 3
        and result.original.profile == "umf.actions.native-bulk/0.1"
    )
    assert admin.execute(
        "SELECT count(*) FROM native_app.orders WHERE status='approved'"
    ).fetchone() == (3,)
    assert admin.execute(
        "SELECT pg_xact_status(%s::xid8)", (result.receipt.version,)
    ).fetchone() == ("committed",)
    cases.append(
        "read-only bounded preview is advisory; atomic native SET reselects all three rows and retains original receipt"
    )
    result = plan.execute()
    assert (
        result.selected == 3 and result.changed == 0 and result.original.no_op is True
    )
    cases.append("set-based bulk no-op reports selected and changed independently")
    import copy

    limited = copy.deepcopy(bulk_request)
    limited["maxItems"] = 1
    limited["selection"]["rowCap"] = 2
    limited_program = NativeProgram.build(
        weft, limited, bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST
    )
    limited_plan = native_bulk_plan(
        conn,
        limited_program,
        Approve,
        {},
        Admission(),
        default_timeout=timedelta(seconds=5),
    )
    for call in (limited_plan.preview, limited_plan.execute):
        try:
            call()
        except ActionRefused as error:
            assert error.code == "BULK_LIMIT"
        else:
            raise AssertionError("bulk sentinel truncated selection")
    assert conn.info.transaction_status == 0
    cases.append(
        "preview and execute sentinel refuse BULK_LIMIT with confirmed rollback"
    )
    from umf_access.postgres_bulk import native_bulk_plan_async

    async def async_bulk_cases():
        c = await psycopg.AsyncConnection.connect(base + " user=erik")
        plan = native_bulk_plan_async(
            c,
            bulk_program,
            Approve,
            {},
            AsyncAdmission(),
            default_timeout=timedelta(seconds=5),
        )
        before = await plan.preview()
        assert len(before.selected) == 3
        admin.execute("UPDATE native_app.orders SET status='draft'")
        after = await plan.execute()
        assert after.selected == 3 and after.changed == 3
        cases.append("real async bulk preview and one atomic set-based write")
        await c.close()

    asyncio.run(async_bulk_cases())
    from umf_access.postgres_bulk import AsyncPostgresBulkTarget, PostgresBulkTarget
    from umf_access.targets import PostgresConfiguration, binding_digest

    target_config = PostgresConfiguration(
        "native_app",
        binding_digest(request["binding"]),
        (180006,),
        timedelta(seconds=5),
    )
    admin.execute("UPDATE native_app.orders SET status='draft'")
    generated_plan = queries.approve_drafts(
        PostgresBulkTarget(conn, target_config, Admission()), status="draft"
    )
    assert len(generated_plan.preview().selected) == 3
    result = generated_plan.execute()
    assert result.selected == 3 and result.changed == 3
    cases.append(
        "public generated command function -> identity-bound native plan -> actual atomic SET"
    )

    async def generated_async_command():
        c = await psycopg.AsyncConnection.connect(base + " user=erik")
        target = AsyncPostgresBulkTarget(c, target_config, AsyncAdmission())
        plan = await queries.approve_drafts(target, status="approved")
        preview = await plan.preview()
        assert len(preview.selected) == 3
        result = await plan.execute()
        assert result.selected == 3 and result.changed == 0
        await c.close()

    asyncio.run(generated_async_command())
    cases.append(
        "public generated command preserves async plan type and executes without sync I/O"
    )

    # Independent native deployment is constrained to a SECURITY DEFINER
    # operation that takes the exclusive counterpart of the admission fence.
    import concurrent.futures
    import threading

    deployed = psycopg.connect(base + " user=deploy_actor", autocommit=True)
    try:
        deployed.execute("REVOKE native_approver FROM erik")
    except psycopg.errors.InsufficientPrivilege:
        pass
    else:
        raise AssertionError(
            "ordinary deployment identity could bypass its fenced port"
        )
    entered = threading.Event()

    class FencedAdmission(Admission):
        def admit(self, connection, program, *, deadline):
            value = super().admit(connection, program, deadline=deadline)
            entered.set()
            return value

    admin.execute("UPDATE native_app.orders SET status='draft' WHERE id='o-1'")
    admin.execute("BEGIN")
    admin.execute("SELECT * FROM native_app.orders WHERE id='o-1' FOR UPDATE")

    def action_worker():
        c = psycopg.connect(base + " user=erik")
        try:
            return PostgresActionExecutor(
                c,
                tuple(programs),
                FencedAdmission(),
                default_timeout=timedelta(seconds=5),
            ).invoke(Approve, {"order": OrderKey(id="o-1")})
        finally:
            c.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
        pending = workers.submit(action_worker)
        assert entered.wait(2)
        deployment = workers.submit(
            lambda: deployed.execute("SELECT native_app.revoke_approver()")
        )
        deadline = time.monotonic() + 2
        waiting = False
        while time.monotonic() < deadline:
            if admin.execute(
                "SELECT count(*) FROM pg_locks WHERE pid=%s AND locktype='advisory' AND NOT granted",
                (deployed.info.backend_pid,),
            ).fetchone() == (1,):
                waiting = True
                break
            time.sleep(0.005)
        assert waiting and not deployment.done(), (
            "native authority deployment escaped the held action fence"
        )
        admin.execute("ROLLBACK")
        result = pending.result(timeout=3)
        assert isinstance(result, Committed)
        deployment.result(timeout=3)
    assert isinstance(executor.invoke(Approve, {"order": OrderKey(id="o-1")}), Denied)
    admin.execute("GRANT native_approver TO erik")
    deployed.close()
    cases.append(
        "independent constrained authority deployment waits through native COMMIT; subsequent action observes revocation"
    )
    admin.execute("ALTER TABLE native_app.orders ADD COLUMN unexpected text")
    try:
        executor.invoke(Approve, {"order": OrderKey(id="o-1")})
    except ActionRefused as e:
        assert e.code == "NATIVE_SHAPE"
    else:
        raise AssertionError("native closure change accepted")
    cases.append("changed native closure refused before business write")
    conn.close()
    admin.close()
    print(
        json.dumps(
            {
                "status": "pass",
                "cases": cases,
                "server": "PostgreSQL 18.6",
                "principal": "peer-authenticated OS identity; native non-owner non-superuser role",
                "qualification": "owned local scalar base-table deployment fixture only; no managed Lakebase or temporal qualification",
            },
            indent=2,
        )
    )
finally:
    if started:
        command(bin / "pg_ctl", "-D", pg / "data", "-m", "fast", "-w", "stop")
    assert not (pg / "data/postmaster.pid").exists()
    print("ownedServerStopped=true")
