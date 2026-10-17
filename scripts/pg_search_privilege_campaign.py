"""Selected real-search grant/revoke campaign; owned cluster only, not admission."""

import ast
import hashlib
import json
import sys
import sysconfig
from pathlib import Path

import psycopg
import weft
from psycopg import sql

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from pg_fixed_runtime_var_probes import resolve_observed_fixed_sql
from pg_owner_privilege_resolver import resolve_owner_packet
from pg_runtime_privilege_resolver import analyze, resolve
from pg_runtime_utility_provenance import search_path_utility, timeout_utility


def qualify(target, captures, out, source_archive):
    out = Path(out)
    out.mkdir()
    connection = target.connection
    params = connection.info.get_parameters()
    if (
        params.get("user") != "search_user"
        or not params.get("host", "").startswith("/private/tmp/umf-search-pg18-")
        or params.get("port") != "55494"
    ):
        raise ValueError(
            "only dedicated original owned local search fixture is permitted"
        )
    admin = psycopg.connect(**dict(params, user="sdk_test"), autocommit=True)
    results = []
    subcounters = []

    def save(name, value):
        (out / name).write_text(json.dumps(value, indent=2, default=str) + "\n")

    def permission(error):
        seen = set()
        while error is not None and id(error) not in seen:
            seen.add(id(error))
            if getattr(error, "sqlstate", None) == "42501":
                return True
            error = error.__cause__ or error.__context__
        return False

    def function_name(f):
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
                + " search_user"
            ).format(function_name(f))
        )

    try:
        assert connection.info.transaction_status == 0
        assert admin.execute(
            "SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='search_user'"
        ).fetchone() == (False, False)
        packets = {}
        programs = {}
        for capture in sorted(
            Path(captures).glob("runtime-compile-*/original-compile-calls.json")
        ):
            for record in json.loads(capture.read_text()):
                if record["compilerApi"] != "compile_search_json":
                    continue
                program = json.loads(record["programText"])
                packet = record["originalOwnerProbes"]
                key = json.dumps(program["structuralDigest"], sort_keys=True)
                assert record["returnBytesUnchanged"] is True
                assert (
                    hashlib.sha256(record["programText"].encode()).hexdigest()
                    == record["programSha256"]
                )
                if key in programs:
                    assert programs[key] == program
                programs[key] = program
                packets[key] = packet
        selected = {
            json.dumps(entry.artifact()["structuralDigest"], sort_keys=True)
            for variant in target.search_variants
            for entry in variant.entries
        }
        assert selected == set(programs) and selected
        selected_entries = sum(
            len(variant.entries) for variant in target.search_variants
        )
        save(
            "same-catalog-original-programs.json",
            {
                "programs": programs,
                "sourceInputs": [
                    str(p)
                    for p in Path(captures).glob(
                        "runtime-compile-*/original-compile-calls.json"
                    )
                ],
            },
        )
        transcript = json.loads((Path(captures) / "runtime.json").read_text())
        assert (
            transcript["nativeAuthority"] is False
            and transcript["inventoryComplete"] is False
        )
        journal = Path(transcript["eventJournal"])
        assert journal == Path(captures) / "runtime.jsonl"
        prefix = journal.read_bytes()
        assert prefix and prefix.endswith(b"\n")
        calls = [json.loads(line) for line in prefix.splitlines()]
        assert all(
            type(call) is dict and call["sequence"] == index
            for index, call in enumerate(calls)
        )
        save(
            "bootstrap-runtime-prefix.json",
            {
                "eventJournal": str(journal),
                "prefixSha256": hashlib.sha256(prefix).hexdigest(),
                "prefixBytes": len(prefix),
                "observedCalls": len(calls),
                "scope": "complete closed journal prefix at successful original verification",
                "calls": calls,
                "nativeAuthority": False,
                "inventoryComplete": False,
            },
        )
        expected_connection = {
            "backendPid": connection.info.backend_pid,
            "database": connection.info.dbname,
            "startupUser": connection.info.user,
            "host": connection.info.host,
            "port": connection.info.port,
        }
        for call in calls:
            observed_connection = call.get("nativeConnection", {})
            if any(observed_connection.get(key) != value for key, value in expected_connection.items()):
                raise ValueError("selected bootstrap SQL belongs to a different or unobserved native connection")
        save("selected-native-connection.json", {"actualConnection": expected_connection, "scope": "observed selected target connection only; session/effective identity remains original-runtime role-admission responsibility", "nativeAuthority": False})
        site = Path(sysconfig.get_path("purelib")) / "umf_access"
        definitions = {}
        for source in [site / "postgres_read.py", site / "postgres_search.py"]:
            for node in ast.walk(ast.parse(source.read_text())):
                if (
                    isinstance(node, ast.Constant)
                    and isinstance(node.value, str)
                    and node.value.startswith(("SELECT ", "WITH ", "BEGIN "))
                ):
                    definitions.setdefault(node.value, []).append(source)
        styles = {}
        for variant in target.search_variants:
            for entry in variant.entries:
                for path, style in json.loads(entry.program.statements_json).items():
                    styles.setdefault(style["sql"], []).append(
                        {
                            "sourceProgramDigest": entry.artifact()["structuralDigest"],
                            "path": path,
                            "originalCheckedStatementStyle": style,
                        }
                    )
        for packet in packets.values():
            for lock in packet["locks"]:
                styles.setdefault(lock["sql"], []).append(
                    {
                        "sourceProgramDigest": packet["sourceProgramDigest"],
                        "originalOwnerLock": lock,
                    }
                )

        # New source-exact metadata admissions retain their original owner's
        # DBAPI form inside the checked artifact rather than statements_json.
        # Match both forms to the original probe path; never translate SQL here.
        def metadata_styles(value, path, packet):
            if isinstance(value, dict):
                for name, child in value.items():
                    child_path = path + "/" + name
                    if (
                        name == "nativeAdmission"
                        and isinstance(child, dict)
                        and "dbapiSql" in child
                    ):
                        matching = [
                            statement
                            for statement in packet["statements"]
                            if statement["path"] == child_path + "/sql"
                        ]
                        if (
                            len(matching) != 1
                            or matching[0]["sql"] != child["sql"]
                            or matching[0]["sqlSha256"]
                            != hashlib.sha256(child["sql"].encode()).hexdigest()
                        ):
                            raise ValueError(
                                "original metadata DBAPI admission lacks exact owner probe correspondence"
                            )
                        styles.setdefault(child["dbapiSql"], []).append(
                            {
                                "sourceProgramDigest": packet["sourceProgramDigest"],
                                "originalOwnerPath": child_path,
                                "originalOwnerStatement": matching[0],
                                "originalDbapiSqlSha256": hashlib.sha256(
                                    child["dbapiSql"].encode()
                                ).hexdigest(),
                            }
                        )
                    metadata_styles(child, child_path, packet)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    metadata_styles(child, path + "/" + str(index), packet)

        for packet in packets.values():
            metadata_styles(packet["program"]["obligations"], "/obligations", packet)
        fixed = {}
        coverage = []
        for call in calls:
            if call["outcome"] != "returned":
                continue
            query = call["sql"]
            if query.startswith("SET LOCAL statement_timeout"):
                coverage.append({
                    "sequence": call["sequence"],
                    "kind": "observed-runtime-session-utility",
                    "provenance": timeout_utility(call, source_archive),
                })
                continue
            if query.startswith("SET LOCAL search_path"):
                coverage.append({
                    "sequence": call["sequence"],
                    "kind": "observed-runtime-session-utility",
                    "provenance": search_path_utility(call, source_archive),
                })
                continue
            if query in definitions:
                if query.startswith("BEGIN "):
                    assert (
                        not call["protocol"]["parameterOids"]
                        and call["resultColumns"] == []
                    )
                    coverage.append(
                        {
                            "sequence": call["sequence"],
                            "kind": "observed-transaction-control",
                            "sql": query,
                            "sqlSha256": call["sqlSha256"],
                        }
                    )
                    continue
                key = json.dumps(
                    [call["sqlSha256"], call["protocol"], call["resultColumns"]],
                    sort_keys=True,
                )
                fixed.setdefault(key, (definitions[query][0], call))
                coverage.append(
                    {
                        "sequence": call["sequence"],
                        "kind": "fixed-source-var-probe",
                        "variantKey": hashlib.sha256(key.encode()).hexdigest(),
                    }
                )
            elif query in styles:
                coverage.append(
                    {
                        "sequence": call["sequence"],
                        "kind": "original-selected-owner-program",
                        "sourceCorrespondence": styles[query],
                    }
                )
            else:
                raise ValueError(
                    "observed selected runtime SQL lacks exact fixed-source or original-owner correspondence"
                )
        assert fixed
        save("runtime-source-owner-coverage.json", coverage)
        observations = []
        runtime = []
        with connection.transaction():
            connection.execute("SET LOCAL search_path=pg_catalog,search_app")
            for index, packet in enumerate(packets.values()):
                resolved = resolve_owner_packet(
                    connection, packet, weft.check_native_privilege_probes_json
                )
                save("owner-" + str(index) + ".json", resolved)
                observations.extend(resolved["observations"])
            selected_tables = {
                (program["binding"]["schema"], table["native"])
                for program in programs.values()
                for table in program["binding"]["tables"]
            }
            policy_observations = []
            for schema, table in sorted(selected_tables):
                if (
                    type(schema) is not str
                    or not schema
                    or type(table) is not str
                    or not table
                ):
                    raise ValueError(
                        "explicit original bound table identity required for native policy closure"
                    )
                policy_rows = connection.execute(
                    "SELECT p.oid,p.polrelid,p.polname,p.polcmd,p.polpermissive,p.polroles,p.polqual::text,p.polwithcheck::text,c.relrowsecurity,c.relforcerowsecurity,n.nspname,c.relname FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s AND p.polcmd IN ('r','*') ORDER BY p.oid",
                    (schema, table),
                ).fetchall()
                for row in policy_rows:
                    if (
                        row[10:] != (schema, table)
                        or type(row[0]) is not int
                        or row[0] <= 0
                        or type(row[1]) is not int
                        or row[1] <= 0
                    ):
                        raise ValueError("native policy relation identity differs")
                    provenance = {
                        "kind": "native-pg-policy-select-using/18.6",
                        "policySetScope": "selected-table SELECT/ALL candidates; role applicability not inferred",
                        "policyOid": row[0],
                        "relationOid": row[1],
                        "name": row[2],
                        "command": row[3],
                        "permissive": row[4],
                        "roleOids": row[5],
                        "usingNodeText": row[6],
                        "withCheckNodeText": row[7],
                        "rowSecurity": row[8],
                        "forceRowSecurity": row[9],
                        "schema": schema,
                        "native": table,
                        "withCheckNotExecutedForRead": True,
                        "bareVarsRetainNativePolicyRelationContext": True,
                        "noFabricatedRteOrSelectGrantInference": True,
                    }
                    if row[7] is not None:
                        provenance["withCheckNodeSha256"] = hashlib.sha256(
                            row[7].encode()
                        ).hexdigest()
                    policy = {"provenance": provenance, "nativeRelationPermissions": []}
                    if row[6] is not None:
                        provenance["usingNodeSha256"] = hashlib.sha256(
                            row[6].encode()
                        ).hexdigest()
                        policy["analysis"] = analyze(row[6])
                        policy["resolved"] = resolve(connection, policy["analysis"])
                        observations.append(policy)
                    policy_observations.append(policy)
            save("native-selected-read-policies.json", policy_observations)
            for index, (source, call) in enumerate(fixed.values()):
                resolved = resolve_observed_fixed_sql(
                    connection, source, call, index, source_archive
                )
                runtime.append(resolved)
                save("fixed-var-" + str(index) + ".json", resolved)
        connection.rollback()
        functions = {
            f["oid"]: f for o in observations for f in o["resolved"]["functions"]
        }
        functions.update(
            {
                f["oid"]: f
                for o in runtime
                if o.get("resolved")
                for f in o["resolved"]["functions"]
            }
        )
        relations = {}
        for o in [*observations, *runtime]:
            for ref in o["nativeRelationPermissions"]:
                if ref["originalOwnerProbeOnly"]:
                    continue
                r = ref["relation"]
                operand = ref["nativePermissionOperand"]
                if r["schema"] != "pg_catalog":
                    continue
                assert operand["requiredPerms"] == 2 and operand["checkAsUser"] == 0
                bits = operand["selectedCols"]
                assert not bits or bits[0] == "b"
                nums = {n - 7 for n in bits[1:]}
                assert all(n >= 0 for n in nums)
                columns = [
                    a["native"]
                    for a in ref["attributes"]
                    if a["attnum"] > 0 and (0 in nums or a["attnum"] in nums)
                ]
                if not columns:
                    positive = sorted(
                        (a for a in ref["attributes"] if a["attnum"] > 0),
                        key=lambda a: a["attnum"],
                    )
                    if not positive:
                        raise ValueError(
                            "native relation-level SELECT has no grantable attribute"
                        )
                    # PostgreSQL checks any-column SELECT when the native tree
                    # references a relation but no particular attribute. This is
                    # an explicit proposal, qualified by native revoke/recover.
                    columns = [positive[0]["native"]]
                entry = relations.setdefault((r["schema"], r["native"]), set())
                entry.update(columns)
        save("candidate-native-overloads.json", list(functions.values()))
        save(
            "candidate-catalog-columns.json",
            [
                {"schema": s, "native": n, "columns": sorted(c)}
                for (s, n), c in relations.items()
            ],
        )
        # This database is disposable. No blanket grant is used.
        admin.execute(
            "REVOKE CREATE,TEMPORARY,CONNECT ON DATABASE postgres FROM PUBLIC"
        )
        admin.execute("GRANT CONNECT ON DATABASE postgres TO search_user")
        admin.execute("REVOKE USAGE ON SCHEMA public,pg_catalog FROM PUBLIC")
        admin.execute(
            "GRANT USAGE ON SCHEMA public,pg_catalog,search_app TO search_user"
        )
        admin.execute(
            "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog FROM PUBLIC"
        )
        admin.execute("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC")
        admin.execute("REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC")
        for (s, n), columns in relations.items():
            if not columns:
                continue
            names = sql.SQL(",").join(sql.Identifier(c) for c in sorted(columns))
            admin.execute(
                sql.SQL("REVOKE SELECT ({}) ON {}.{} FROM PUBLIC").format(
                    names, sql.Identifier(s), sql.Identifier(n)
                )
            )
            admin.execute(
                sql.SQL("GRANT SELECT ({}) ON {}.{} TO search_user").format(
                    names, sql.Identifier(s), sql.Identifier(n)
                )
            )
        for f in functions.values():
            access("GRANT", f)
        from search_docs import queries

        initial = {
            name: getattr(value, "calls", None)
            for name, value in target.embedders.items()
        }

        def workload():
            entry = {
                "before": {
                    name: getattr(value, "calls", None)
                    for name, value in target.embedders.items()
                },
                "completed": [],
            }
            subcounters.append(entry)
            found = []
            operations = [
                ("verify", target.verify),
                ("keyword", lambda: queries.keyword(target, term="cats")),
                ("vector", lambda: queries.vector(target, q=(1.0, 0.0, 0.0))),
                (
                    "filtered",
                    lambda: queries.filtered(target, q=(1.0, 0.0, 0.0), minimum="b"),
                ),
                ("selected", lambda: queries.selected(target, term="cats")),
                ("modeled", lambda: queries.modeled(target, term="cats")),
                ("embedded", lambda: queries.embedded(target, term="cats")),
                ("combined", lambda: queries.combined(target, term="cats")),
            ]
            try:
                for name, operation in operations:
                    entry["active"] = name
                    result = operation()
                    entry["completed"].append(name)
                    if name != "verify":
                        found.append(result)
                entry["outcome"] = "returned"
                return [
                    [{"item": str(hit.item), "score": str(hit.score)} for hit in result]
                    for result in found
                ]
            except BaseException as error:
                entry["outcome"] = "raised"
                entry["native42501Observed"] = permission(error)
                entry["errorType"] = type(error).__name__
                raise
            finally:
                entry["after"] = {
                    name: getattr(value, "calls", None)
                    for name, value in target.embedders.items()
                }
                save("workload-and-embedding-observations.json", subcounters)

        baseline = workload()
        save("baseline.json", baseline)
        for oid, f in sorted(functions.items()):
            access("REVOKE", f)
            denied = False
            try:
                assert workload() == baseline
            except BaseException as error:
                if not permission(error):
                    raise
                denied = True
            finally:
                access("GRANT", f)
            assert workload() == baseline
            results.append(
                {
                    "function": f,
                    "native42501Observed": denied,
                    "requiredBySelectedWorkload": denied,
                    "regrantBaselineRecovered": True,
                }
            )
            save("function-revoke-controls.json", results)
        column_controls = []
        for (schema, native), columns in sorted(relations.items()):
            for column in sorted(columns):
                statement = sql.SQL("{} SELECT ({}) ON {}.{} {} search_user")

                def column_access(
                    verb,
                    statement=statement,
                    column=column,
                    schema=schema,
                    native=native,
                ):
                    admin.execute(
                        statement.format(
                            sql.SQL(verb),
                            sql.Identifier(column),
                            sql.Identifier(schema),
                            sql.Identifier(native),
                            sql.SQL("TO" if verb == "GRANT" else "FROM"),
                        )
                    )

                column_access("REVOKE")
                denied = False
                try:
                    assert workload() == baseline
                except BaseException as error:
                    if not permission(error):
                        raise
                    denied = True
                finally:
                    column_access("GRANT")
                assert workload() == baseline
                column_controls.append(
                    {
                        "schema": schema,
                        "native": native,
                        "column": column,
                        "native42501Observed": denied,
                        "regrantBaselineRecovered": True,
                    }
                )
                save("catalog-column-revoke-controls.json", column_controls)
        # Individually unnecessary candidates can be mutually substitutable.
        # Remove them collectively and require the entire selected baseline.
        pruned_functions = []
        for item in results:
            if not item["requiredBySelectedWorkload"]:
                access("REVOKE", item["function"])
                pruned_functions.append(item["function"])
        pruned_columns = []
        for item in column_controls:
            if not item["native42501Observed"]:
                admin.execute(
                    sql.SQL("REVOKE SELECT ({}) ON {}.{} FROM search_user").format(
                        sql.Identifier(item["column"]),
                        sql.Identifier(item["schema"]),
                        sql.Identifier(item["native"]),
                    )
                )
                pruned_columns.append(item)
        assert workload() == baseline
        save(
            "collective-prune-baseline.json",
            {
                "prunedFunctions": pruned_functions,
                "prunedCatalogColumns": pruned_columns,
                "allSelectedBranchesRecovered": True,
                "nativeAuthority": False,
                "inventoryComplete": False,
            },
        )
        # Fence LOCK is an original owner operation, not a generic utility
        # exemption. Qualify its reader grant independently of metadata SELECT.
        fences = {}
        for variant in target.search_variants:
            for entry in variant.entries:
                artifact = entry.artifact()
                fence = artifact.get("obligations", {}).get("nativeCatalogFence")
                if fence is not None:
                    descriptor = fence["deployment"]
                    key = (descriptor["schema"], descriptor["view"])
                    fences.setdefault(key, []).append({
                        "sourceProgramDigest": artifact["structuralDigest"],
                        "path": "/obligations/nativeCatalogFence/lockSql",
                        "sql": fence["lockSql"],
                        "sqlSha256": hashlib.sha256(fence["lockSql"].encode()).hexdigest(),
                    })
        fence_controls = []
        for (schema, view), provenance in fences.items():
            statement = sql.SQL("{} MAINTAIN ON {}.{} {} search_user")
            admin.execute(statement.format(sql.SQL("REVOKE"), sql.Identifier(schema), sql.Identifier(view), sql.SQL("FROM")))
            denied = False
            try:
                workload()
            except BaseException as error:
                if not permission(error):
                    raise
                denied = True
            finally:
                admin.execute(statement.format(sql.SQL("GRANT"), sql.Identifier(schema), sql.Identifier(view), sql.SQL("TO")))
            assert denied and workload() == baseline
            fence_controls.append({"schema": schema, "view": view, "originalOwnerProvenance": provenance, "native42501Observed": True, "regrantBaselineRecovered": True})
        save("fence-maintain-revoke-controls.json", fence_controls)
        admin.execute("REVOKE SELECT ON search_app.docs FROM search_user")
        denied = False
        try:
            workload()
        except BaseException as error:
            if not permission(error):
                raise
            denied = True
        finally:
            admin.execute("GRANT SELECT ON search_app.docs TO search_user")
        assert denied and workload() == baseline
        save(
            "business-table-revoke-control.json",
            {
                "native42501Observed": True,
                "regrantBaselineRecovered": True,
                "tableLevelSelectRequiredByOriginalLocks": True,
            },
        )
        # Existing original harness assertions continue under these exact grants.
        save(
            "embedding-subcampaign-counters.json",
            {
                "initial": initial,
                "observations": subcounters,
                "final": {
                    name: getattr(value, "calls", None)
                    for name, value in target.embedders.items()
                },
            },
        )
        for name, value in target.embedders.items():
            if initial[name] is not None:
                value.calls = initial[name]
        save(
            "result.json",
            {
                "status": "pass",
                "nativeAuthority": False,
                "inventoryComplete": False,
                "selectedUniquePrograms": len(selected),
                "selectedEntries": selected_entries,
                "candidateFunctions": len(functions),
                "directNecessaryFunctions": sum(
                    x["requiredBySelectedWorkload"] for x in results
                ),
                "nativeInternalOrUnusedBySelectedWorkload": sum(
                    not x["requiredBySelectedWorkload"] for x in results
                ),
                "unresolved": [
                    "action/bulk runtime branches",
                    "unselected bindings and operations",
                    "global inventory and unselected native overloads",
                ],
            },
        )
    finally:
        admin.close()
