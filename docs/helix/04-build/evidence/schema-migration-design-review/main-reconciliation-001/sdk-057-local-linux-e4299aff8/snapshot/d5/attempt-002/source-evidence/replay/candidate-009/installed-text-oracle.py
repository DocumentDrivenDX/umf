"""Independent installed G02 oracle using a retained G01 source fixture.

Expected row values are specified here, independently of generated SQL/AST
evaluation. Requires an explicitly authorized disposable local PostgreSQL host.
"""
import argparse
import copy
from contextlib import contextmanager
from decimal import Decimal
from datetime import date
import gzip
import hashlib
import importlib.metadata
import importlib.util
import json
import traceback
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import MigrationRequest, PsycopgMigrationHost, apply_migration_on_host, apply_table_migration
from umf_codegen import compile_table_deployment, compile_table_migration, discover_table_migration_changes


def require_compiled(result, key):
    assert result["status"] == "compiled", result
    return result[key]


def ambient_operator_guard(db, bundle, operation, plan_digest, table):
    """Execute the actual Weft program under hostile ambient operators."""
    from umf_access.lifecycle.seeds import _binding
    from weft import prepare_table_operation_module_json
    prepared = prepare_table_operation_module_json(json.dumps({"version": "weft.table-operation-module/0.1", "target": "postgresql18", "binding": _binding(bundle), "module": bundle["module"]}))
    program = json.loads(prepared.prepare(operation).bind_json(json.dumps({"call": {"kind": "single", "inputs": {}}, "idempotencyKey": plan_digest})))
    assert program["version"] == "weft.table-operation/0.2"
    sources = {slot["id"]: slot["source"] for slot in program["parameterSources"]}
    arguments = tuple(sources[name]["nativeValue"] for name in program["dbapiParameterOrder"])
    schema = "ambient_" + uuid4().hex[:10]
    before = repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
    created, state = False, None

    class RollbackOnly(Exception):
        pass

    try:
        db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        created = True
        db.execute(sql.SQL("CREATE FUNCTION {}.eq_numeric(pg_catalog.numeric,pg_catalog.numeric) RETURNS pg_catalog.bool LANGUAGE sql IMMUTABLE AS 'SELECT true'").format(sql.Identifier(schema)))
        db.execute(sql.SQL("CREATE OPERATOR {}.= (FUNCTION={}.eq_numeric,LEFTARG=pg_catalog.numeric,RIGHTARG=pg_catalog.numeric)").format(sql.Identifier(schema), sql.Identifier(schema)))
        db.execute(sql.SQL("CREATE FUNCTION {}.div_int8(pg_catalog.int8,pg_catalog.int8) RETURNS pg_catalog.int8 LANGUAGE sql IMMUTABLE AS 'SELECT 1::pg_catalog.int8'").format(sql.Identifier(schema)))
        db.execute(sql.SQL("CREATE OPERATOR {}./ (FUNCTION={}.div_int8,LEFTARG=pg_catalog.int8,RIGHTARG=pg_catalog.int8)").format(sql.Identifier(schema), sql.Identifier(schema)))
        db.execute(sql.SQL("SET search_path={},pg_catalog").format(sql.Identifier(schema)))
        try:
            with db.transaction():
                db.execute(program["dbapiSql"], arguments).fetchall()
                raise RollbackOnly("unexpected program success; force synthetic test rollback")
        except psycopg.Error as error:
            state = error.sqlstate
        except RollbackOnly:
            pass
    finally:
        db.execute("SET search_path=pg_catalog")
        if created:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
    after = repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
    assert state == "22012" and before == after, ("actual guarded program must resist ambient operator replacement", state)
    return {"nativeSqlstate": state, "rollbackVerified": before == after, "sqlSha256": hashlib.sha256(program["dbapiSql"].encode()).hexdigest()}


def injected_nonfinite_guard(db, bundle, configuration, operation, plan_digest, table):
    """Low-level program guard proof; deliberately invalid native state rolls back."""
    from umf_access.lifecycle.seeds import _binding
    from weft import prepare_table_operation_module_json
    before = repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
    relation = table.as_string(db)
    constraints = db.execute("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid=%s::pg_catalog.regclass AND contype='c' ORDER BY conname", (relation,)).fetchall()
    assert constraints and all(name.startswith("umf_d_") for (name,) in constraints)
    observations = []

    class RollbackOnly(Exception):
        pass

    try:
        with db.transaction():
            for (name,) in constraints:
                db.execute(sql.SQL("ALTER TABLE {} DROP CONSTRAINT {}").format(table, sql.Identifier(name)))
            db.execute(sql.SQL("UPDATE {} SET amount='NaN'::pg_catalog.numeric WHERE id='b'").format(table))
            injected = repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
            for unused in (False, True):
                selected = bundle
                if unused:
                    source = json.loads(bundle["source"]["utf8"])
                    declaration = next(item for item in source["modules"][0]["extensions"]["umf.tables"]["commands"] if item["id"] == operation)
                    original = declaration["body"]["values"][0]["value"]["expression"]
                    declaration["body"]["values"][0]["value"]["expression"] = {"op": "conditional", "when": {"op": "all"}, "then": {"op": "literal", "value": {"decimalToken": "2.00"}}, "else": original}
                    selected = require_compiled(compile_table_deployment(json.dumps(source), configuration=configuration), "bundle")
                module = prepare_table_operation_module_json(json.dumps({"version": "weft.table-operation-module/0.1", "target": "postgresql18", "binding": _binding(selected), "module": selected["module"]}))
                program = json.loads(module.prepare(operation).bind_json(json.dumps({"call": {"kind": "single", "inputs": {}}, "idempotencyKey": plan_digest})))
                slots = {slot["id"]: slot["source"] for slot in program["parameterSources"]}
                arguments = tuple(slots[name]["nativeValue"] for name in program["dbapiParameterOrder"])
                state = None
                try:
                    with db.transaction():
                        db.execute(program["dbapiSql"], arguments).fetchall()
                except psycopg.Error as error:
                    state = error.sqlstate
                after = repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
                assert state == "22012" and injected == after, (unused, state)
                observations.append({"unusedBranch": unused, "nativeSqlstate": state, "statementRollbackVerified": True, "programSqlSha256": hashlib.sha256(program["dbapiSql"].encode()).hexdigest()})
            raise RollbackOnly()
    except RollbackOnly:
        pass
    assert before == repr(db.execute(sql.SQL("SELECT * FROM {} ORDER BY id").format(table)).fetchall())
    assert constraints == db.execute("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid=%s::pg_catalog.regclass AND contype='c' ORDER BY conname", (relation,)).fetchall()
    return {"scope": "actual low-level program under deliberately invalid native state; not host catalog qualification", "injectionAndConstraintRemovalRolledBack": True, "cases": observations}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--domain", choices=("text", "integer", "decimal", "date"), default="text")
    parser.add_argument("--decimal-invalid", choices=("rounding", "nan", "unused-nan"), default="rounding")
    parser.add_argument("--shape", choices=("both", "existing", "appended"), default="both")
    parser.add_argument("--case", choices=("both", "valid", "invalid"), default="both")
    parser.add_argument("--ambient-operators", action="store_true")
    parser.add_argument("--nan-program-guard", action="store_true")
    parser.add_argument("--enum-rejection", action="store_true")
    parser.add_argument("--unknown-commit", action="store_true")
    parser.add_argument("--literal-wrapper", choices=("integerToken", "decimalToken"), default="integerToken")
    parser.add_argument("--literal-token", default="99999")
    parser.add_argument("--text-expression", choices=("concat", "coalesce", "eq-null", "ne-null", "not-eq-value", "not-ne-null"), default="concat")
    parser.add_argument("--empty-input", action="store_true")
    parser.add_argument("--native-constraint", choices=("none", "unique", "foreign-key", "varchar-loss"), default="none")
    parser.add_argument("--bound-excess", action="store_true")
    parser.add_argument("--empty-table", action="store_true")
    parser.add_argument("--all-populated", action="store_true")
    args = parser.parse_args()
    if args.bound_excess:
        assert args.domain == "text" and args.case == "invalid" and args.native_constraint == "none"
    if args.empty_table:
        assert args.case == "valid" and not args.all_populated
    if args.all_populated:
        assert args.domain == "text" and args.shape == "existing" and args.case == "valid"
    fixture_path = Path(__file__).parent.parent / "g01/fixture.json.gz"
    fixture = json.loads(gzip.open(fixture_path, "rt").read())
    manifest_path = Path(__import__("sys").prefix).parent / "owner-artifacts.json"
    provenance = {"runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "fixtureSha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(), "artifactManifestSha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest() if manifest_path.exists() else None, "packageOrigins": {name: importlib.util.find_spec(name).origin for name in ("umf_access", "umf_codegen", "weft")}}
    provenance["runtimeFiles"] = {}
    for name in ("umf-codegen", "weft-sql"):
        distribution = importlib.metadata.distribution(name)
        for item in distribution.files or ():
            if str(item).endswith(("generator.js.gz", "manifest.json", ".so", ".pyd")):
                provenance["runtimeFiles"][str(item)] = hashlib.sha256(distribution.locate_file(item).read_bytes()).hexdigest()
    retained = next(case for case in fixture["cases"] if case["id"] == "mixed")
    observations = []
    versions = {name: importlib.metadata.version(name) for name in ("umf-access", "umf-codegen", "psycopg")}
    for appended, invalid in ((False, False), (True, False), (False, True), (True, True)):
        if args.shape != "both" and appended != (args.shape == "appended"):
            continue
        if args.case != "both" and invalid != (args.case == "invalid"):
            continue
        if args.native_constraint != "none":
            assert args.domain == "text" and args.case == "invalid"
            if args.native_constraint != "varchar-loss":
                assert args.shape == "existing"
        prefix = "rv_g02_" + uuid4().hex[:10]
        config = {"module": "demo", "schema": prefix, "ownerRole": prefix + "_owner", "personRole": prefix + "_person", "batchRole": prefix + "_batch", "groupRoles": {}}
        roles = [config[key] for key in ("ownerRole", "personRole", "batchRole")]
        old = json.loads(retained["initialSource"]["utf8"])
        new = json.loads(retained["source"]["utf8"])
        for document in (old, new):
            module = document["modules"][0]
            table = module["extensions"]["umf.tables"]["tables"][0]
            column = next(column for column in table["columns"] if column["field"]["element"] == "summary")
            default = {"string": "new" if args.native_constraint == "varchar-loss" else "future-only"} if args.domain == "text" else {"integerToken": "7"} if args.domain == "integer" else {"date": "2000-01-01"} if args.domain == "date" else {"decimalToken": "7.00"}
            column["default"] = {"kind": "literal", "value": default}
            if args.native_constraint == "varchar-loss":
                column["nativeType"] = {"kind": "varchar", "length": 3}
            if args.native_constraint == "unique":
                table["indexes"].append({"id": "summary_unique", "name": "summary_unique", "fields": [{"module": "demo", "element": "summary"}], "unique": True, "include": []})
            elif args.native_constraint == "foreign-key":
                for name in ("id", "owner"):
                    field = copy.deepcopy(next(item for item in module["elements"] if item["id"] == name))
                    field["id"] = "parent_" + name
                    module["elements"].append(field)
                parent = copy.deepcopy(next(field for field in module["elements"] if field["id"] == "Note"))
                parent.update(id="Parent", members=[{"module": "demo", "element": "parent_id"}, {"module": "demo", "element": "parent_owner"}])
                parent["keys"][0]["fields"] = [{"module": "demo", "element": "parent_id"}]
                module["elements"].append(parent)
                parent_table = copy.deepcopy(table)
                parent_table.update(id="parents", name="parents", record={"module": "demo", "element": "Parent"}, columns=copy.deepcopy(table["columns"][:2]))
                for item in parent_table["columns"]:
                    item["field"]["element"] = "parent_" + item["field"]["element"]
                for rule in parent_table["policy"]["person"].values():
                    rule["field"]["element"] = "parent_owner"
                module["extensions"]["umf.tables"]["tables"].append(parent_table)
                table["foreignKeys"].append({"id": "summary_parent", "name": "summary_parent", "fields": [{"module": "demo", "element": "summary"}], "target": {"record": {"module": "demo", "element": "Parent"}, "key": "primary"}, "onUpdate": "noAction", "onDelete": "restrict", "deferrable": False})
            if args.domain == "text" and (args.text_expression != "concat" or args.native_constraint == "varchar-loss"):
                target = next(field for field in module["elements"] if field["id"] == "summary")
                ref = {"module": "demo", "element": "nickname"}
                module["elements"].insert(module["elements"].index(target), {"id": "nickname", "kind": "field", "scalarType": "string", "cardinality": "one", "nullability": "absent-allowed", "extensions": {}})
                next(field for field in module["elements"] if field["id"] == "Note")["members"].insert(-1, ref)
                table["columns"].insert(-1, {"field": ref, "name": "nickname", "nativeType": {"kind": "text"}})
            if args.domain != "text":
                target = next(field for field in module["elements"] if field["id"] == "summary")
                target["scalarType"] = args.domain
                if args.enum_rejection and invalid and args.domain == "integer":
                    target["allowedValues"] = [{"integerToken": str(value)} for value in (0, 1, 7, 9)]
                if args.domain == "decimal":
                    target["facets"] = {"precision": 6, "scale": 2}
                column["nativeType"] = {"kind": "int2"} if args.domain == "integer" else {"kind": "date"} if args.domain == "date" else {"kind": "numeric", "precision": 6, "scale": 2}
                record = next(field for field in module["elements"] if field["id"] == "Note")
                for name in (["amount"] if args.domain == "integer" else ["birthdate"] if args.domain == "date" else ["amount", "factor"]):
                    ref = {"module": "demo", "element": name}
                    field = {"id": name, "kind": "field", "scalarType": args.domain, "cardinality": "one", "nullability": "absent-allowed" if args.domain == "date" else "required", "extensions": {}}
                    if args.domain == "decimal":
                        field["facets"] = {"precision": 6, "scale": 3}
                    module["elements"].insert(module["elements"].index(target), field)
                    record["members"].insert(-1, ref)
                    table["columns"].insert(-1, {"field": ref, "name": name, "nativeType": {"kind": "int8"} if args.domain == "integer" else {"kind": "date"} if args.domain == "date" else {"kind": "numeric", "precision": 6, "scale": 3}})
        if appended:
            module = old["modules"][0]
            module["elements"] = [field for field in module["elements"] if field["id"] != "summary"]
            next(field for field in module["elements"] if field["id"] == "Note")["members"] = [ref for ref in next(field for field in module["elements"] if field["id"] == "Note")["members"] if ref["element"] != "summary"]
            table = module["extensions"]["umf.tables"]["tables"][0]
            table["columns"] = [column for column in table["columns"] if column["field"]["element"] != "summary"]
        command = new["modules"][0]["extensions"]["umf.tables"]["commands"][0]
        command["version"] = "umf.table-operation/0.2"
        if args.bound_excess:
            command["body"]["maxRows"] = 1
        expression = {"op": "concat", "args": [{"op": "field", "field": {"module": "demo", "element": "owner"}}, {"op": "literal", "value": {"string": ":"}}, {"op": "field", "field": {"module": "demo", "element": "id"}}]}
        if args.domain == "integer":
            expression = {"op": "subtract", "left": {"op": "field", "field": {"module": "demo", "element": "amount"}}, "right": {"op": "literal", "value": {args.literal_wrapper: args.literal_token}}}
        elif args.domain == "date":
            expression = {"op": "field", "field": {"module": "demo", "element": "birthdate"}}
            if not invalid:
                expression = {"op": "coalesce", "args": [expression, {"op": "literal", "value": {"date": "1970-01-01"}}]}
        elif args.domain == "decimal":
            expression = {"op": "multiply", "left": {"op": "field", "field": {"module": "demo", "element": "amount"}}, "right": {"op": "field", "field": {"module": "demo", "element": "factor"}}}
            if invalid and args.decimal_invalid == "unused-nan":
                expression = {"op": "conditional", "when": {"op": "all"}, "then": {"op": "literal", "value": {"decimalToken": "2.00"}}, "else": expression}
        elif invalid and not args.bound_excess:
            expression = {"op": "conditional", "when": {"op": "isNull", "field": {"module": "demo", "element": "owner"}}, "then": expression, "else": {"op": "literal", "value": None}}
        if args.domain == "text" and args.text_expression != "concat" and not invalid:
            nickname = {"op": "field", "field": {"module": "demo", "element": "nickname"}}
            owner = {"op": "field", "field": {"module": "demo", "element": "owner"}}
            if args.text_expression == "coalesce":
                expression = {"op": "coalesce", "args": [nickname, owner]}
            else:
                value = {"string": "Bee"} if args.text_expression == "not-eq-value" else None
                op = "ne" if args.text_expression in ("ne-null", "not-ne-null") else "eq"
                predicate = {"op": op, "field": {"module": "demo", "element": "nickname"}, "value": {"kind": "literal", "value": value}}
                if args.text_expression.startswith("not-"):
                    predicate = {"op": "not", "arg": predicate}
                then, otherwise = (":other", ":bee") if args.text_expression == "not-eq-value" else (":present", ":missing") if args.text_expression == "ne-null" else (":missing", ":present")
                expression = {"op": "conditional", "when": predicate, "then": {"op": "concat", "args": [owner, {"op": "literal", "value": {"string": then}}]}, "else": {"op": "concat", "args": [owner, {"op": "literal", "value": {"string": otherwise}}]}}
        if args.native_constraint == "varchar-loss":
            expression = {"op": "field", "field": {"module": "demo", "element": "nickname"}}
        elif args.native_constraint != "none":
            expression = {"op": "literal", "value": {"string": "duplicate" if args.native_constraint == "unique" else "missing-parent"}}
        command["body"]["values"][0]["value"] = {"kind": "rowExpression", "expression": expression}
        previous = require_compiled(compile_table_deployment(json.dumps(old), configuration=config), "bundle")
        successor = require_compiled(compile_table_deployment(json.dumps(new), configuration=config), "bundle")
        base = require_compiled(compile_table_migration(migration_id=prefix + "-001", predecessor=None, previous_bundle=None, next_bundle=previous), "plan")
        changes = discover_table_migration_changes(previous, successor)
        markers = [{key: value for key, value in change.items() if key not in ("oldValue", "newValue")} for change in changes if change["kind"] == "tighten-not-null"]
        options = copy.deepcopy(retained["plan"]["options"])
        options.update(version="umf.table-migration-options/0.4", reviewedChanges=markers)
        plan = require_compiled(compile_table_migration(migration_id=prefix + "-002", previous_bundle=previous, next_bundle=successor, predecessor={"id": base["id"], "digest": base["digest"]}, options=options), "plan")
        plan_file = args.report.parent / "plans" / (plan["digest"] + ".json")
        plan_file.parent.mkdir(exist_ok=True)
        plan_file.write_bytes(json.dumps(plan, sort_keys=True).encode())
        target_phases = [phase for phase in plan["phases"] if phase["kind"] == ("backfill-add" if appended else "backfill-tighten")]
        assert len(target_phases) == 1
        target_ids = {step["id"] for step in plan["steps"] if step.get("phaseTarget")}
        assert set(target_phases[0]["steps"]) == target_ids
        assert all(step["transaction"] == "required" and (step["id"] in target_ids or step["kind"] == "grant") for step in plan["steps"])
        created, made = False, []
        with psycopg.connect(args.dsn, autocommit=True) as admin:
            server = admin.execute("SHOW server_version").fetchone()[0]
            try:
                for role in roles:
                    admin.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION").format(sql.Identifier(role)))
                    made.append(role)
                admin.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(prefix)))
                created = True
                with psycopg.connect(conninfo.make_conninfo(args.dsn, dbname=prefix), autocommit=True) as db:
                    db.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(sql.Identifier(prefix), sql.Identifier(config["ownerRole"])))
                    db.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(config["ownerRole"])))
                    db.execute("SET search_path=pg_catalog")
                    with db.transaction():
                        initial = apply_table_migration(db, base, approved_digest=base["digest"], expected_head=None, person_roles=())
                    db.execute("RESET ROLE")
                    table = sql.Identifier(prefix, "notes")
                    if args.native_constraint == "foreign-key":
                        db.execute(sql.SQL("INSERT INTO {}(id,owner) VALUES ('preserved','synthetic-parent'),('future-only','synthetic-parent')").format(sql.Identifier(prefix, "parents")))
                    if appended:
                        rows = [("a", "Ada"), ("b", "Bjørn"), ("c", "李")]
                    else:
                        rows = [("a", "Ada", ("old" if args.native_constraint == "varchar-loss" else "preserved") if args.domain == "text" else date(1980, 1, 1) if args.domain == "date" else 9), ("b", "Bjørn", None), ("c", "李", None)]
                    columns = ["id", "owner"] + ([] if appended else ["summary"])
                    nicknames = [None, None, "" if args.empty_input else "Bee"]
                    if args.native_constraint == "varchar-loss":
                        nicknames = ["xyz", "abc", "abc "]
                    if args.domain == "text" and (args.text_expression != "concat" or args.native_constraint == "varchar-loss"):
                        columns += ["nickname"]
                        rows = [row + (nickname,) for row, nickname in zip(rows, nicknames)]
                    if args.domain == "integer":
                        columns += ["amount"]
                        rows = [row + (amount,) for row, amount in zip(rows, [100000, 40000 if invalid and not args.enum_rejection else 99999, 100001])]
                    elif args.domain == "date":
                        columns += ["birthdate"]
                        rows = [row + (birthdate,) for row, birthdate in zip(rows, [date(2001, 1, 1), None, date(2002, 2, 2)])]
                    elif args.domain == "decimal":
                        columns += ["amount", "factor"]
                        pairs = [(Decimal("1.200"), Decimal("2.000")), (Decimal("1.230"), Decimal("1.230")) if invalid else (Decimal("3.000"), Decimal("2.000")), (Decimal("4.000"), Decimal("2.000"))]
                        if invalid and args.decimal_invalid != "rounding":
                            pairs[1] = (Decimal("NaN"), Decimal("1.230"))
                        rows = [row + pair for row, pair in zip(rows, pairs)]
                    if args.all_populated:
                        rows = [("a", "Ada", "preserved"), ("b", "Bjørn", "kept-b"), ("c", "李", "kept-c")]
                    if args.empty_table:
                        rows = []
                    for row in rows:
                        db.execute(sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(table, sql.SQL(",").join(map(sql.Identifier, columns)), sql.SQL(",").join(sql.Placeholder() for _ in columns)), row)
                    ambient = None
                    if args.ambient_operators and args.domain == "decimal" and invalid and not appended:
                        ambient = ambient_operator_guard(db, successor, command["id"], plan["digest"], table)
                    nonfinite = None
                    if args.nan_program_guard and args.domain == "decimal" and not invalid and not appended:
                        nonfinite = injected_nonfinite_guard(db, successor, config, command["id"], plan["digest"], table)
                    db.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(config["ownerRole"])))
                    digest = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
                    evidence = hashlib.sha256(b"independent G02 installed text oracle").hexdigest()
                    host = PsycopgMigrationHost(db, person_roles=(), target_profile="local-postgresql18", installation_id=prefix)
                    approval = host.record_approval(MigrationRequest(plan, initial["headDigest"], digest), decision="approved", qualification_profile="reviewer-g02", evidence_digest=evidence)
                    kwargs = dict(expected_head=initial["headDigest"], file_digest=digest, qualification_profile="reviewer-g02", evidence_digest=evidence, approval_id=approval.receipt_id)
                    unknown_events = []
                    if args.unknown_commit and not invalid:
                        from umf_access.lifecycle.host import HostOutcomeUnknown
                        original_host = host

                        class UnknownCommitLease:
                            def __init__(self, lease):
                                self.lease = lease

                            def __getattr__(self, name):
                                return getattr(self.lease, name)

                            @contextmanager
                            def required_phase(self, phase, *, prior):
                                with self.lease.required_phase(phase, prior=prior) as transaction:
                                    yield transaction
                                if phase["kind"] in ("backfill-add", "backfill-tighten") and not unknown_events:
                                    unknown_events.append(phase["kind"])
                                    raise HostOutcomeUnknown("independent lost response after actual atomic phase commit")

                        class UnknownCommitHost:
                            capabilities = original_host.capabilities

                            @contextmanager
                            def acquire(self, *args, **kwargs):
                                with original_host.acquire(*args, **kwargs) as lease:
                                    yield UnknownCommitLease(lease)

                        host = UnknownCommitHost()
                    failure = None
                    privacy = None
                    from umf_access.lifecycle import backfills
                    original_cursor = backfills._cursor
                    native_states, dispatches = [], []
                    affected_counts = []

                    class ObservedCursor:
                        def __init__(self, cursor):
                            self.cursor = cursor

                        def __getattr__(self, name):
                            return getattr(self.cursor, name)

                        def execute(self, statement, parameters=()):
                            dispatches.append(True)
                            try:
                                return self.cursor.execute(statement, parameters)
                            except psycopg.Error as error:
                                native_states.append(error.sqlstate)
                                raise

                        def fetchmany(self, size):
                            result = self.cursor.fetchmany(size)
                            affected_counts.append(len(result))
                            return result

                    @contextmanager
                    def observed_cursor(connection):
                        with original_cursor(connection) as cursor:
                            yield ObservedCursor(cursor)

                    backfills._cursor = observed_cursor
                    try:
                        try:
                            outcome = apply_migration_on_host(host, plan, **kwargs)
                        except Exception as error:
                            failure = type(error).__name__
                            public = str(error) + "".join(traceback.format_exception(error))
                            privacy = all(marker not in public for marker in ("Failing row contains", "DETAIL:", "Bjørn", "李"))
                            assert privacy, "ordinary exception/traceback leaked native row detail"
                        assert len(dispatches) == 1, "must reach exactly one native derived UPDATE"
                        if not invalid:
                            assert apply_migration_on_host(host, plan, **kwargs)["status"] == "already-applied"
                            assert len(dispatches) == 1, "committed UPDATE must never repeat"
                    finally:
                        backfills._cursor = original_cursor
                    if not invalid:
                        assert failure is None, failure
                        assert outcome["status"] == "committed"
                        assert outcome["installationReference"]["version"] == "umf.table-installation/0.3"
                        assert outcome["installationReference"]["approvalPlanDigest"] == plan["digest"]
                        if args.unknown_commit:
                            assert unknown_events == [("backfill-add" if appended else "backfill-tighten")]
                        assert native_states == []
                        if args.empty_table or args.all_populated:
                            assert affected_counts == [0], "zero-match UPDATE must succeed without hidden row effects"
                    else:
                        assert failure is not None
                        expected_state = "23505" if args.native_constraint == "unique" else "23503" if args.native_constraint == "foreign-key" else "23514" if args.enum_rejection and args.domain == "integer" else "22003" if args.domain == "integer" else "22012"
                        assert native_states == [expected_state], "must fail the expected actual native guard/constraint/range check"
                    db.execute("RESET ROLE")
                    if invalid and appended:
                        assert db.execute("SELECT count(*) FROM information_schema.columns WHERE table_schema=%s AND table_name='notes' AND column_name='summary'", (prefix,)).fetchone() == (0,)
                    else:
                        outputs = ["Ada:a", "Bjørn:b", "李:c"] if args.domain == "text" else [1, 0, 2] if args.domain == "integer" else [date(2001, 1, 1), date(1970, 1, 1), date(2002, 2, 2)] if args.domain == "date" else [Decimal("2.40"), Decimal("6.00"), Decimal("8.00")]
                        if args.domain == "text" and args.text_expression != "concat":
                            outputs = ["Ada", "Bjørn", "" if args.empty_input else "Bee"] if args.text_expression == "coalesce" else ["Ada:other", "Bjørn:other", "李:other" if args.empty_input else "李:bee"] if args.text_expression == "not-eq-value" else ["Ada:missing", "Bjørn:missing", "李:present"]
                        expected = [("a", "Ada", (("old" if args.native_constraint == "varchar-loss" else "preserved") if args.domain == "text" else date(1980, 1, 1) if args.domain == "date" else 9) if not appended else outputs[0]), ("b", "Bjørn", None if invalid else outputs[1]), ("c", "李", None if invalid else outputs[2])]
                        if args.all_populated:
                            expected = [("a", "Ada", "preserved"), ("b", "Bjørn", "kept-b"), ("c", "李", "kept-c")]
                        if args.empty_table:
                            expected = []
                        assert db.execute(sql.SQL("SELECT id,owner,summary FROM {} ORDER BY id").format(table)).fetchall() == expected
                    if args.domain != "text":
                        selected = "amount" if args.domain == "integer" else "birthdate" if args.domain == "date" else "amount,factor"
                        actual = db.execute(sql.SQL("SELECT " + selected + " FROM {} ORDER BY id").format(table)).fetchall()
                        assert repr(actual) == repr([row[-1:] if args.domain in ("integer", "date") else row[-2:] for row in rows]), "input fields must remain exact, including NaN"
                    elif args.text_expression != "concat" or args.native_constraint == "varchar-loss":
                        assert db.execute(sql.SQL("SELECT nickname FROM {} ORDER BY id").format(table)).fetchall() == ([] if args.empty_table else [(value,) for value in nicknames])
                    if not invalid:
                        insert_columns = "id,owner" if args.domain in ("text", "date") else "id,owner,amount" if args.domain == "integer" else "id,owner,amount,factor"
                        insert_values = "'future','Future'" if args.domain in ("text", "date") else "'future','Future',1" if args.domain == "integer" else "'future','Future',1,1"
                        db.execute(sql.SQL("INSERT INTO {} (" + insert_columns + ") VALUES (" + insert_values + ")").format(table))
                        assert db.execute(sql.SQL("SELECT summary FROM {} WHERE id='future'").format(table)).fetchone() == (("future-only" if args.domain == "text" else date(2000, 1, 1) if args.domain == "date" else 7),)
                        explicit_null_state = None
                        try:
                            with db.transaction():
                                values = insert_values.replace("'future'", "'explicit-null'", 1)
                                db.execute(sql.SQL("INSERT INTO {} (" + insert_columns + ",summary) VALUES (" + values + ",NULL)").format(table))
                        except psycopg.Error as error:
                            explicit_null_state = error.sqlstate
                        assert explicit_null_state == "23502", "future default must not substitute for explicit NULL"
                    observations.append({"domain": args.domain, "textExpression": args.text_expression, "nativeConstraint": args.native_constraint, "boundExcess": args.bound_excess, "emptyTable": args.empty_table, "allPopulated": args.all_populated, "literalWrapper": args.literal_wrapper, "literalToken": args.literal_token, "decimalInvalidMode": args.decimal_invalid, "enumRejection": args.enum_rejection, "appended": appended, "invalid": invalid, "ambientOperatorGuard": ambient, "injectedNonfiniteGuard": nonfinite, "unknownCommitAfterRealPhase": unknown_events, "explicitNullAfterDefaultSqlstate": None if invalid else explicit_null_state, "failure": failure, "publicFailurePrivacy": privacy, "nativeStates": native_states, "nativeDispatches": len(dispatches), "nativeAffectedCounts": affected_counts, "planDigest": plan["digest"], "planFile": "plans/" + plan_file.name, "planFileSha256": hashlib.sha256(plan_file.read_bytes()).hexdigest(), "sourceDigest": hashlib.sha256(successor["source"]["utf8"].encode()).hexdigest(), "passed": True})
            finally:
                if created:
                    admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(prefix)))
                for role in reversed(made):
                    admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))
    report = {"status": "passed", "server": server, "versions": versions, "provenance": provenance, "cases": observations, "cleanup": "all created isolated databases and roles removed"}
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
