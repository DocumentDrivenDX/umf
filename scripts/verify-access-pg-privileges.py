"""Disposable-cluster PG18 analyzed runtime inventory and selected SDK grant proof.

Never point this at a shared cluster: PUBLIC ACLs are deliberately revoked.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import shutil
import subprocess
import sys
import sysconfig
import zipfile
from datetime import timedelta
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.adapt import PyFormat, Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_runtime_privilege_resolver import (
    fixed_statements,
    relation_inventory,
    rows,
    runtime_probe,
)

DECLARATIONS = """from degree_shop import Order,OrderKey
from umf_access.dsl import query,Param
@query
def plain():
    return Order.objects.select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def pages(after:Param[OrderKey|None]):
    return Order.objects.select(Order.c.order_id).order_by(Order.c.order_id.asc()).page(size=2,after=after)
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--fixture", type=Path, required=True)
    ap.add_argument("--snapshot", type=Path, required=True)
    ap.add_argument("--pins", type=Path, required=True)
    ap.add_argument("--capture-owner-requests", action="store_true")
    args = ap.parse_args()
    out = args.out.resolve()
    out.mkdir()
    socket = out / "socket"
    socket.mkdir()
    fixture = out / "fixture"
    shutil.copytree(args.fixture, fixture)
    snapshot = json.loads(args.snapshot.read_text())
    pins = json.loads(args.pins.read_text())
    site = Path(sysconfig.get_path("purelib"))

    def bytes_match():
        for group in ["sdkPayloads", "weftPayloads"]:
            for name, pin in pins[group].items():
                if (
                    hashlib.sha256((site / name).read_bytes()).hexdigest()
                    != pin["sha256"]
                ):
                    raise AssertionError("installed payload changed " + name)

    for group, wheel_key, prefix in [
        ("sdkPayloads", "sdkWheel", "umf_access/"),
        ("weftPayloads", "weftWheel", "weft/"),
    ]:
        wheel = Path(pins[wheel_key])
        expected = pins[wheel_key + "Sha256"]
        assert hashlib.sha256(wheel.read_bytes()).hexdigest() == expected
        with zipfile.ZipFile(wheel) as archive:
            names = {
                n
                for n in archive.namelist()
                if n.startswith(prefix) and not n.endswith("/")
            }
            assert names == set(pins[group])
            assert all(
                hashlib.sha256(archive.read(n)).hexdigest() == pins[group][n]["sha256"]
                for n in names
            )
    assert pins["sdkWheelSha256"] == snapshot["wheelSha256"]
    bytes_match()
    source = Path(sysconfig.get_path("purelib")) / "umf_access/postgres_read.py"
    statements = fixed_statements(source)
    shutil.copy2(__file__, out / "owned-runner.py")
    shutil.copy2(
        Path(__file__).with_name("pg_runtime_privilege_resolver.py"),
        out / "pg_runtime_privilege_resolver.py",
    )
    header = Path(
        "/opt/homebrew/opt/postgresql@18/include/postgresql/server/access/sysattr.h"
    )
    offset = int(
        re.search(
            r"#define FirstLowInvalidHeapAttributeNumber\s+\((-?\d+)\)",
            header.read_text(),
        ).group(1)
    )
    assert offset == -7, "exact PG18 bitmap contract required"
    shutil.copy2(header, out / "sysattr.h")
    source_start = {
        str(p): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [
            Path(__file__),
            Path(__file__).with_name("pg_runtime_privilege_resolver.py"),
            source,
            header,
        ]
    }
    if args.capture_owner_requests:
        for name in ["pg_owner_privilege_resolver.py", "record-access-privilege-build.py"]:
            helper = Path(__file__).with_name(name)
            source_start[str(helper)] = hashlib.sha256(helper.read_bytes()).hexdigest()
            shutil.copy2(helper, out / name)
    started = False
    checks = []
    status = "FAILED"
    server_stopped = False
    pg = Path("/opt/homebrew/opt/postgresql@18/bin")
    schema = "sdk_privilege_fixture"
    probe_schema = "sdk_privilege_probes"
    port = 55505

    def run(name, cmd):
        with (out / (name + ".log")).open("w") as log:
            r = subprocess.run(
                list(map(str, cmd)), stdout=log, stderr=subprocess.STDOUT, check=False
            )
        checks.append({"name": name, "exitCode": r.returncode})
        if r.returncode:
            raise RuntimeError(name + " failed; log retained")

    def save(name, value):
        (out / name).write_text(json.dumps(value, indent=2, default=str) + "\n")

    def case(name, **details):
        checks.append({"name": name, **details})
        print("PASS", name, flush=True)

    try:
        run(
            "init",
            [
                pg / "initdb",
                "-D",
                out / "data",
                "-A",
                "trust",
                "-U",
                "inventory_admin",
                "--no-sync",
            ],
        )
        run(
            "start",
            [
                pg / "pg_ctl",
                "-D",
                out / "data",
                "-l",
                out / "server.log",
                "-o",
                f"-F -k {socket} -c listen_addresses='' -p {port}",
                "-w",
                "start",
            ],
        )
        started = True
        dsn = f"host={socket} port={port} dbname=postgres"
        with psycopg.connect(dsn, user="inventory_admin", autocommit=True) as admin:
            version = admin.info.server_version
            assert version == 180006, "exact PostgreSQL18.6 profile required"
            for role in ["fixture_owner", "inventory_reader"]:
                admin.execute(
                    sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOBYPASSRLS").format(
                        sql.Identifier(role)
                    )
                )
            admin.execute(
                sql.SQL("CREATE SCHEMA {} AUTHORIZATION fixture_owner").format(
                    sql.Identifier(schema)
                )
            )
            admin.execute(
                sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(probe_schema))
            )
            with psycopg.connect(dsn, user="fixture_owner", autocommit=True) as owner:
                owner.execute(
                    sql.SQL(
                        "CREATE TABLE {}.orders(id text PRIMARY KEY,customer_code text)"
                    ).format(sql.Identifier(schema))
                )
                owner.execute(
                    sql.SQL(
                        "INSERT INTO {}.orders VALUES('a',NULL),('b',NULL),('c',NULL)"
                    ).format(sql.Identifier(schema))
                )
            model = json.loads((fixture / "stage-one-request.json").read_text())[
                "sources"
            ][0]["text"]
            binding = {
                "version": "umf.raw-read-binding/0.1",
                "schema": schema,
                "schemaBinding": "qualified",
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
                    }
                ],
                "relationships": [],
            }
            (fixture / "privilege_declarations.py").write_text(DECLARATIONS)
            config = {
                "package": "degree_shop",
                "modules": ["privilege_declarations"],
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
            (fixture / "config.json").write_text(json.dumps(config, indent=2) + "\n")
            for label, tail in [("catalog-build", []), ("catalog-check", ["--check"])]:
                entrypoint = ["-m", "umf_access.build.catalog"]
                if args.capture_owner_requests:
                    entrypoint = [
                        str(
                            Path(__file__).resolve().parent
                            / "record-access-privilege-build.py"
                        ),
                        str(out / (label + "-owner-capture")),
                    ]
                run(
                    label,
                    [
                        sys.executable,
                        "-I",
                        "-B",
                        *entrypoint,
                        "catalog",
                        "--config",
                        fixture / "config.json",
                        "--root",
                        fixture,
                        *tail,
                    ],
                )
            sys.path.insert(0, str(fixture))
            from degree_shop import queries
            from umf_access.targets import (
                AsyncPostgresTarget,
                PostgresConfiguration,
                PostgresTarget,
                binding_digest,
            )
            from umf_access.verification import configure_postgres_verification_cache

            entries = tuple(
                getattr(queries, "_Q" + str(i)).variants[0].entry for i in range(2)
            )
            probes = []
            for i, statement in enumerate(statements):
                probes.extend(runtime_probe(admin, statement, i, probe_schema))
            # Analyze selected original business programs too, but retain their
            # owner and exact artifact independently from SDK fixed templates.
            for i, entry in enumerate(entries):
                artifact = entry.artifact()
                save("original-artifact-" + str(i) + ".json", artifact)
                if i == 0:
                    params = []
                else:
                    params = []
                    for name in artifact["dbapiParameterOrder"]:
                        if name == "__umf_has_after":
                            params.append("NULL::pg_catalog.bool")
                        elif name == "__umf_page_size":
                            params.append("NULL::pg_catalog.int2")
                        elif name.startswith("__umf_after_"):
                            params.append("NULL")
                        else:
                            raise AssertionError(
                                "unreviewed original parameter " + name
                            )
                from pg_runtime_privilege_resolver import OUTPUTS, PARAMS

                key = "owner-business-" + str(i)
                PARAMS[key] = [("captured-owner-parameters", params)]
                OUTPUTS[key] = len(artifact["outputs"]) + len(artifact["cursorOutputs"])
                probes.extend(
                    runtime_probe(
                        admin,
                        {
                            "id": key,
                            "sql": artifact["dbapiSql"],
                            "sha256": hashlib.sha256(
                                artifact["dbapiSql"].encode()
                            ).hexdigest(),
                            "sourceOwner": "original Weft program",
                        },
                        100 + i,
                        probe_schema,
                    )
                )
            if args.capture_owner_requests:
                import weft
                from pg_owner_privilege_resolver import resolve_owner_packet

                captures = json.loads(
                    (
                        out
                        / "catalog-build-owner-capture"
                        / "original-compile-calls.json"
                    ).read_text()
                )
                assert len(captures) == len(entries)
                for owner_index, (capture, entry) in enumerate(
                    zip(captures, entries, strict=True)
                ):
                    assert capture["returnBytesUnchanged"] is True
                    original = json.loads(capture["programText"])
                    assert (
                        original["structuralDigest"]
                        == entry.artifact()["structuralDigest"]
                    )
                    with psycopg.connect(
                        dsn, user="inventory_admin"
                    ) as owner_connection:
                        owner_connection.execute(
                            sql.SQL("SET LOCAL search_path=pg_catalog,{}").format(
                                sql.Identifier(schema)
                            )
                        )
                        report = resolve_owner_packet(
                            owner_connection,
                            capture["originalOwnerProbes"],
                            weft.check_native_privilege_probes_json,
                        )
                        save(
                            "same-catalog-original-owner-" + str(owner_index) + ".json",
                            report,
                        )
                        for variant_index, observation in enumerate(
                            report["observations"]
                        ):
                            probes.append(
                                {
                                    "statement": {
                                        "id": "owner-var-" + str(owner_index),
                                        "sql": capture["requestText"],
                                        "sourceOwner": "exact original owner Var probe",
                                    },
                                    "view": "owner_var_"
                                    + str(owner_index)
                                    + "_"
                                    + str(variant_index),
                                    **observation,
                                }
                            )
                    owner_connection.close()
            save("resolved-probes-before-acl.json", probes)
            metadata = relation_inventory(
                admin,
                [p for p in probes if not p["statement"]["id"].startswith("owner-")],
                probe_schema,
                offset,
            )
            for p in probes:
                if p.get("analysis"):
                    (out / ("nodes-" + p["view"] + ".txt")).write_text(
                        p["nativeNodeText"]
                    )
            save("resolved-probes.json", probes)
            save("runtime-metadata-relations.json", metadata)
            protocol = []
            for value in [
                "schema",
                True,
                123,
                40000,
                2**32 - 1,
                [123],
                [40000],
                [2**32 - 1],
                ["schema"],
            ]:
                dumper = Transformer.from_context(admin).get_dumper(
                    value, PyFormat.AUTO
                )
                protocol.append(
                    {
                        "value": value,
                        "pythonType": type(value).__name__,
                        "dumper": type(dumper).__name__,
                        "oid": dumper.oid,
                        "format": int(dumper.format),
                    }
                )
            assert [r["oid"] for r in protocol] == [
                0,
                16,
                21,
                23,
                20,
                1005,
                1007,
                1016,
                0,
            ]
            save("actual-parameter-protocols.json", protocol)
            case(
                "actual-runtime-and-original-business-native-analyzed-identities",
                probes=len(probes),
                metadataRelations=len(metadata),
            )
            # This is a brand-new private cluster. Revoke defaults here only,
            # then propose individual resolved routines/metadata columns.
            admin.execute(
                "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog FROM PUBLIC"
            )
            admin.execute(
                "REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC"
            )
            for rel in metadata:
                allcols = rows(
                    admin,
                    "SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=%s::pg_catalog.oid AND attnum>0 AND NOT attisdropped ORDER BY attnum",
                    (rel["oid"],),
                )
                admin.execute(
                    sql.SQL("REVOKE SELECT ({}) ON {}.{} FROM PUBLIC").format(
                        sql.SQL(",").join(
                            sql.Identifier(c["attname"]) for c in allcols
                        ),
                        sql.Identifier(rel["schema"]),
                        sql.Identifier(rel["relname"]),
                    )
                )
            admin.execute(
                sql.SQL(
                    "GRANT USAGE ON SCHEMA {},pg_catalog TO inventory_reader"
                ).format(sql.Identifier(schema))
            )
            admin.execute(
                sql.SQL("GRANT SELECT ON {}.orders TO inventory_reader").format(
                    sql.Identifier(schema)
                )
            )
            for rel in metadata:
                names = [c["attname"] for c in rel["columns"]]
                if not names:
                    raise AssertionError("empty native column inventory")
                admin.execute(
                    sql.SQL("GRANT SELECT ({}) ON {}.{} TO inventory_reader").format(
                        sql.SQL(",").join(sql.Identifier(n) for n in names),
                        sql.Identifier(rel["schema"]),
                        sql.Identifier(rel["relname"]),
                    )
                )
            functions = {
                f["oid"]: f
                for p in probes
                if p.get("resolved")
                for f in p["resolved"]["functions"]
            }

            def function_sql(f):
                return sql.SQL("{}.{}({})").format(
                    sql.Identifier(f["schema"]),
                    sql.Identifier(f["name"]),
                    sql.SQL(",").join(
                        sql.SQL("{}.{}").format(
                            sql.Identifier(t["schema"]), sql.Identifier(t["name"])
                        )
                        for t in f["arguments"]
                    ),
                )

            def access(verb, f):
                admin.execute(
                    sql.SQL(
                        verb
                        + " EXECUTE ON FUNCTION {} "
                        + ("TO" if verb == "GRANT" else "FROM")
                        + " inventory_reader"
                    ).format(function_sql(f))
                )

            for f in functions.values():
                access("GRANT", f)
            conf = PostgresConfiguration(
                schema, binding_digest(binding), (version,), timedelta(seconds=5)
            )
            with psycopg.connect(
                dsn, user="inventory_reader", autocommit=True
            ) as reader:
                actual_protocol = []
                for observation in protocol:
                    dumper = Transformer.from_context(reader).get_dumper(
                        observation["value"], PyFormat.AUTO
                    )
                    assert (dumper.oid, int(dumper.format)) == (
                        observation["oid"],
                        observation["format"],
                    )
                    actual_protocol.append(
                        {
                            **observation,
                            "connectionRole": "inventory_reader",
                            "actualConnectionDumper": type(dumper).__name__,
                        }
                    )
                save("actual-reader-parameter-protocols.json", actual_protocol)
                principal = reader.execute(
                    "SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
                ).fetchone()
                assert principal == (False, False)
                target = PostgresTarget(reader, conf, entries)

                variant_calls = []
                for statement in statements:
                    key = statement["id"]
                    query = statement["sql"]
                    if query.startswith("SET TRANSACTION"):
                        continue
                    if key in ["_COLUMNS", "_KEYS"]:
                        values = [(123,), (40000,), (2**32 - 1,)]
                    elif key == "_SHAPE":
                        values = [([123],), ([40000],), ([2**32 - 1],)]
                    elif key == "_TABLE":
                        values = [(schema, "orders")]
                    elif key == "_RESOLUTION":
                        values = [(["orders"], True, schema)]
                    elif key == "_ROLE":
                        values = [()]
                    elif "to_regclass" in query:
                        values = [('"orders"',)]
                    elif "set_config" in query:
                        values = (
                            [("5000",)]
                            if query.count("%s") == 1
                            else [("5000", f'pg_catalog, "{schema}", pg_temp')]
                        )
                    else:
                        raise AssertionError(
                            "unreviewed fixed execution template " + key
                        )
                    for valueset in values:
                        variant_calls.append(
                            {
                                "id": key,
                                "sql": query,
                                "sqlSha256": statement["sha256"],
                                "values": valueset,
                                "protocol": [
                                    {
                                        "oid": (
                                            d := Transformer.from_context(
                                                reader
                                            ).get_dumper(v, PyFormat.AUTO)
                                        ).oid,
                                        "format": int(d.format),
                                    }
                                    for v in valueset
                                ],
                            }
                        )
                assert len(variant_calls) == 16
                save("actual-fixed-variant-executions.json", variant_calls)

                def exercise():
                    with reader.transaction():
                        reader.execute(
                            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        for variant in variant_calls:
                            result = reader.execute(
                                variant["sql"], variant["values"]
                            ).fetchall()
                            assert len(result) <= 2000
                    configure_postgres_verification_cache()
                    target.verify()
                    assert queries.plain(target) == [("a",), ("b",), ("c",)]
                    first = queries.pages(target, after=None)
                    assert (
                        first.items == (("a",), ("b",)) and first.next_after is not None
                    )
                    assert queries.pages(target, after=first.next_after).items == (
                        ("c",),
                    )
                    assert list(
                        queries.pages_stream(
                            target, after=None, max_rows=10, page_size=1
                        )
                    ) == [("a",), ("b",), ("c",)]

                exercise()
                case(
                    "independent-principal-cold-warm-verify-read-page-stream-with-only-inventory-grants"
                )
                necessary = []
                unneeded = []
                for oid, f in sorted(functions.items()):
                    access("REVOKE", f)
                    try:
                        exercise()
                    except Exception as error:
                        if getattr(error, "sqlstate", None) != "42501":
                            raise
                        necessary.append(
                            {"function": f, "deniedSqlstate": error.sqlstate}
                        )
                        access("GRANT", f)
                    else:
                        unneeded.append(f)
                exercise()
                case(
                    "individual-function-revoke-controls",
                    necessary=len(necessary),
                    internalNotRequired=len(unneeded),
                )
                save(
                    "function-grant-controls.json",
                    {
                        "necessary": necessary,
                        "implementationReferencesNotDirectGrantRequirements": unneeded,
                    },
                )
                for rel in metadata:
                    cols = sql.SQL(",").join(
                        sql.Identifier(c["attname"]) for c in rel["columns"]
                    )
                    obj = sql.SQL("{}.{}").format(
                        sql.Identifier(rel["schema"]), sql.Identifier(rel["relname"])
                    )
                    admin.execute(
                        sql.SQL(
                            "REVOKE SELECT ({}) ON {} FROM inventory_reader"
                        ).format(cols, obj)
                    )
                    try:
                        exercise()
                    except Exception as error:
                        if getattr(error, "sqlstate", None) != "42501":
                            raise
                    else:
                        raise AssertionError(
                            "metadata relation grant unnecessary " + rel["relname"]
                        )
                    admin.execute(
                        sql.SQL("GRANT SELECT ({}) ON {} TO inventory_reader").format(
                            cols, obj
                        )
                    )
                    exercise()
                case(
                    "individual-runtime-metadata-relation-revoke-and-recovery",
                    relations=len(metadata),
                )
                admin.execute(
                    sql.SQL("REVOKE SELECT ON {}.orders FROM inventory_reader").format(
                        sql.Identifier(schema)
                    )
                )
                admin.execute(
                    sql.SQL(
                        "GRANT SELECT(id,customer_code) ON {}.orders TO inventory_reader"
                    ).format(sql.Identifier(schema))
                )
                try:
                    exercise()
                except Exception as error:
                    if getattr(error, "sqlstate", None) != "42501":
                        raise
                else:
                    raise AssertionError(
                        "column-only business grants admitted original LOCK"
                    )
                admin.execute(
                    sql.SQL("GRANT SELECT ON {}.orders TO inventory_reader").format(
                        sql.Identifier(schema)
                    )
                )
                exercise()
                case(
                    "original-LOCK-requires-table-SELECT-column-only-refusal-and-recovery"
                )
                # Minimal necessary-only proposal remains in place here.
                save(
                    "selected-grant-proposal.json",
                    {
                        "status": "SELECTED_NATIVE_CONTROLS_ONLY; OVERALL_OWNER_CLOSURE_PENDING",
                        "functions": [r["function"] for r in necessary],
                        "metadataRelations": metadata,
                        "applicationTableSelect": {
                            "schema": schema,
                            "table": "orders",
                            "reason": "original owner LOCK ACCESS SHARE",
                        },
                        "leastPrivilege": "UNQUALIFIED_OUTSIDE_THIS_EXACT_SELECTED_COHORT",
                        "compilerOwnerComplete": False,
                        "temporal": "HELD",
                    },
                )

            async def async_cases():
                async with await psycopg.AsyncConnection.connect(
                    dsn, user="inventory_reader", autocommit=True
                ) as reader:
                    target = AsyncPostgresTarget(reader, conf, entries)
                    await target.verify()
                    assert await queries.plain(target) == [("a",), ("b",), ("c",)]
                    assert [
                        v
                        async for v in queries.pages_stream(
                            target, after=None, max_rows=10, page_size=1
                        )
                    ] == [("a",), ("b",), ("c",)]
                    with psycopg.connect(
                        dsn, user="fixture_owner", autocommit=False
                    ) as blocker:
                        blocker.execute(
                            sql.SQL(
                                "LOCK TABLE {}.orders IN ACCESS EXCLUSIVE MODE"
                            ).format(sql.Identifier(schema))
                        )
                        task = asyncio.create_task(queries.plain(target))
                        waiting = False
                        try:
                            for _ in range(100):
                                info = admin.execute(
                                    "SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid=%s",
                                    (reader.info.backend_pid,),
                                ).fetchone()
                                if info and info[0] == "Lock":
                                    waiting = True
                                    break
                                await asyncio.sleep(0.01)
                            assert waiting
                            task.cancel()
                            try:
                                await task
                            except asyncio.CancelledError:
                                pass
                            else:
                                raise AssertionError(
                                    "blocked async query ignored cancellation"
                                )
                        finally:
                            blocker.rollback()
                    assert await queries.plain(target) == [("a",), ("b",), ("c",)]

            asyncio.run(async_cases())
            case("async-verify-read-stream-cancel-and-session-reuse-under-same-grants")
            # No business data or source is needed after these owned schemas drop.
            admin.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(probe_schema))
            )
            admin.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
            )
            case("owned-fixture-and-probe-cleanup")
            status = "PASS"
    finally:
        cleanup_error = None
        fixture_cleaned = False
        try:
            if started:
                with psycopg.connect(
                    f"host={socket} port={port} dbname=postgres",
                    user="inventory_admin",
                    autocommit=True,
                ) as cleanup:
                    for name in [probe_schema, schema]:
                        cleanup.execute(
                            sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                                sql.Identifier(name)
                            )
                        )
                    for role in ["inventory_reader", "fixture_owner"]:
                        if cleanup.execute(
                            "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=%s",
                            (role,),
                        ).fetchone():
                            cleanup.execute(
                                sql.SQL("DROP OWNED BY {} CASCADE").format(
                                    sql.Identifier(role)
                                )
                            )
                            cleanup.execute(
                                sql.SQL("DROP ROLE {}").format(sql.Identifier(role))
                            )
                    fixture_cleaned = not cleanup.execute(
                        "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=ANY(%s::pg_catalog.text[])",
                        ([probe_schema, schema],),
                    ).fetchone()
        except (psycopg.Error, OSError, ValueError) as error:
            cleanup_error = repr(error)
        finally:
            try:
                if started:
                    run(
                        "stop",
                        [pg / "pg_ctl", "-D", out / "data", "-m", "fast", "-w", "stop"],
                    )
            finally:
                server_stopped = not (out / "data/postmaster.pid").exists()
                payload_error = None
                try:
                    bytes_match()
                except (AssertionError, OSError) as error:
                    payload_error = repr(error)
                source_end = {
                    p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
                    for p in source_start
                }
                clean = (
                    server_stopped
                    and fixture_cleaned
                    and not cleanup_error
                    and not payload_error
                    and source_start == source_end
                )
                save(
                    "result.json",
                    {
                        "status": status if clean else "FAILED",
                        "checks": checks,
                        "sourceStart": source_start,
                        "sourceEnd": source_end,
                        "serverStopped": server_stopped,
                        "fixtureCleanupComplete": fixture_cleaned,
                        "cleanupError": cleanup_error,
                        "payloadError": payload_error,
                        "runtimeSnapshot": snapshot,
                        "installedPayloadsUnchanged": payload_error is None,
                        "sdkPayloadCount": len(pins["sdkPayloads"]),
                        "weftPayloadCount": len(pins["weftPayloads"]),
                        "inventoryComplete": False,
                        "compilerOwnerComplete": False,
                        "temporal": "HELD",
                    },
                )
                if not clean:
                    raise RuntimeError("owned cleanup/source custody failed")


if __name__ == "__main__":
    main()
