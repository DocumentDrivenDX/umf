# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed generated Praxis client -> installed host/Weft -> PostgreSQL.

Test-owned temp tables and two explicit host callbacks only. This is not a
Hohfeld interpreter, production Praxis binding, or sparse-record round trip.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--generated", required=True)
parser.add_argument("--dsn", required=True)
parser.add_argument("--weft")
parser.add_argument("--psycopg")
args = parser.parse_args()
sys.path.insert(0, args.generated)
for directory in [args.weft, args.psycopg]:
    if directory:
        sys.path.insert(0, directory)

import psycopg
from psycopg import sql
import weft
import umf_access
from umf_access.unified import UnifiedAccessError, WeftTableBinding
from praxis_catalog import Actions, Client, CoverageAssertion, CoverageAssertionKey, Solution, SolutionKey, Unsupported

root = Path(__file__).resolve().parents[2]
source = (root / "tests/unified/praxis/catalog.json").read_text()
model = json.loads(source)
digest = hashlib.sha256(source.encode()).hexdigest()
module = model["modules"][0]
fields = {e["id"]: e for e in module["elements"] if e["kind"] == "field"}
records = {e["id"]: e for e in module["elements"] if e["kind"] == "record"}
actions = {a["id"]: a for a in module["extensions"]["umf.actions"]["actions"]}
seed = json.loads((root / "tests/unified/praxis/seed.json").read_text())


async def main() -> None:
    expected_host = os.environ.get("UMF_UNIFIED_EXPECTED_HOST_VERSION", "0.1.0.dev3")
    expected_weft = os.environ.get("UMF_UNIFIED_EXPECTED_WEFT_VERSION", "0.4.46")
    assert importlib.metadata.version("umf_access") == expected_host
    assert weft.__version__ == expected_weft
    assert Path(umf_access.__file__).resolve().is_relative_to(Path(sys.prefix).resolve()), "Host must come from the installed environment"
    compiled = []
    calls = []
    tables = []
    table_names = {}
    native_fields = {}
    tokens = set()
    with psycopg.connect(args.dsn, autocommit=True) as connection:
        assert connection.info.server_version // 10000 == 18
        for index, (name, record) in enumerate(records.items()):
            native = "praxis_fixture_" + str(index)
            table_names[name] = native
            columns = []
            defs = []
            native_fields[name] = {}
            for ordinal, member in enumerate(record["members"]):
                field = fields[member["element"]]
                assert field["scalarType"] == "string" and field["cardinality"] == "one"
                fid, column = field["id"], "c" + str(ordinal)
                native_fields[name][fid] = column
                nullable = field["nullability"] == "absent-allowed"
                defs.append(sql.SQL("{} text{}").format(sql.Identifier(column), sql.SQL("" if nullable else " NOT NULL")))
                columns.append({"logical": field.get("name", fid), "native": column, "carrier": "string", "nullable": nullable})
            key_fields = record["keys"][0]["fields"]
            assert len(key_fields) == 1
            defs.append(sql.SQL("PRIMARY KEY ({})").format(sql.Identifier(native_fields[name][key_fields[0]["element"]])))
            connection.execute(sql.SQL("CREATE TEMP TABLE {} ({})").format(sql.Identifier(native), sql.SQL(", ").join(defs)))
            tables.append({"logical": [module["namespace"], name], "native": native,
                           "key": [fields[k["element"]].get("name", k["element"]) for k in key_fields], "columns": columns})

        # Materialize only actual seed create values. Link effects are deliberately
        # not projected as to-one foreign keys: all nine source relations are many.
        loaded = 0
        for step in seed:
            declaration = actions[step["action"].split(".", 1)[1]]["x-praxis-handler-contract"]["originalDeclaration"]
            for effect in declaration["effects"]:
                if effect["op"] != "create":
                    continue
                name, values = effect["type"], {}
                key_fid = records[name]["keys"][0]["fields"][0]["element"]
                values[key_fid] = step["inputs"][effect["key"]["input"]]
                for local_name, expression in effect["properties"].items():
                    value = step["inputs"].get(expression["input"])
                    if value is not None:
                        values[name + "." + local_name] = value
                connection.execute(sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    sql.Identifier(table_names[name]),
                    sql.SQL(", ").join(sql.Identifier(native_fields[name][fid]) for fid in values),
                    sql.SQL(", ").join(sql.Placeholder() for _ in values)), list(values.values()))
                loaded += 1

        binding = {"version": "umf.raw-read-binding/0.1", "schema": None, "modelJson": source,
                   "modelSha256": digest, "tables": tables, "relationships": []}

        async def execute(artifact, request):
            assert artifact["status"] == "compiled" and artifact["target"] == "postgresql18"
            compiled.append(artifact)
            values = []
            order = artifact.get("parameterOrder", [])

            def placeholder(match):
                values.append(request["parameters"][order[int(match.group(1)) - 1]])
                return "%s"

            statement = re.sub(r"\$([1-9][0-9]*)", placeholder, artifact["sql"])
            rows = connection.execute(statement, values).fetchall()
            return {"schema": digest, "rows": [{spec["name"]: value for spec, value in zip(artifact["outputs"], row, strict=True)} for row in rows]}

        async def apply(action, inputs, idempotency_key):
            calls.append((action, dict(inputs)))
            assert idempotency_key is None
            if action != "catalog.ChangeCoverageLevel":
                raise UnifiedAccessError("UNSUPPORTED", "fixture qualifies only the selected single action")
            key = inputs["coverageAssertion"]["CoverageAssertion.code"]
            name = "CoverageAssertion"
            row = connection.execute(sql.SQL("UPDATE {} SET {}=%s WHERE {}=%s RETURNING pg_current_xact_id()::text").format(
                sql.Identifier(table_names[name]), sql.Identifier(native_fields[name][name + ".level"]),
                sql.Identifier(native_fields[name][name + ".code"])), (inputs["level"], key)).fetchone()
            if row is None:
                return {"schema": digest, "error": {"code": "PRECONDITION_FAILED", "precondition": "coverageAssertion_exists"}}
            token = "pg18-fixture:" + row[0]
            tokens.add(token)
            return {"schema": digest, "created": [], "changed": [{"record": "catalog.CoverageAssertion", "key": {"CoverageAssertion.code": key}}],
                    "counts": {"created": 0, "updated": 1, "deleted": 0, "linked": 0, "unlinked": 0}, "consistency_token": token}

        async def at_least(token):
            return token in tokens

        class ObservedCompiler:
            """Retain fixture compiler refusals without changing sanitized client errors."""

            def compile_raw_read_json(self, request):
                raw = weft.compile_raw_read_json(request)
                artifact = json.loads(raw) if isinstance(raw, str) else raw
                if artifact.get("status") != "compiled":
                    print(json.dumps({"fixtureCompilerRefusal": artifact.get("diagnostics")}), file=sys.stderr)
                return raw

        host = WeftTableBinding(binding, ObservedCompiler(), execute, target="postgresql18", action_executor=apply, at_least=at_least)
        client = Client(host)
        page = await Solution.objects.using(client).order_by(Solution.c.code.asc()).page(size=2)
        assert len(page.items) == 2 and page.next_cursor
        second = await Solution.objects.using(client).order_by(Solution.c.code.asc()).page(size=2, after=page.next_cursor)
        assert second.items[0].code > page.items[-1].code
        solution = await Solution.objects.using(client).get(SolutionKey(code="matter-query"))
        assert solution and solution.name == "Matter query" and solution.delivery_mode == "chat"
        coverage_key = CoverageAssertionKey(code="aderant.client-reporting-budgets")
        before = await CoverageAssertion.objects.using(client).get(coverage_key)
        assert before and before.level == "partial"
        receipt = await Actions(client).change_coverage_level(level="full", coverage_assertion=coverage_key)
        assert receipt.changed == (coverage_key,) and receipt.counts["updated"] == 1
        after = await CoverageAssertion.objects.using(client).get(coverage_key, at_least=receipt.consistency_token)
        assert after and after.level == "full"
        assert calls == [("catalog.ChangeCoverageLevel", {"level": "full", "coverageAssertion": {"CoverageAssertion.code": coverage_key.code}})]
        try:
            await Solution.objects.using(client).related(Solution.c.addresses).first()
        except Unsupported:
            pass
        else:
            raise AssertionError("Many-valued source relation was falsely admitted as to-one")
        print(json.dumps({"status": "pass", "scope": "installed generated client and host; actual published Weft SQL and PG18 temp-table projection; explicit single-action callback; no Hohfeld/Praxis adoption or sparse-record/relationship projection qualification", "weft": weft.__version__, "host": expected_host, "hostPath": str(Path(umf_access.__file__).resolve()), "sourceDigest": digest, "seedCreatedRows": loaded, "compiledReads": len(compiled), "actionCalls": len(calls), "action": "catalog.ChangeCoverageLevel", "manyRelationship": "explicitly unsupported"}))


asyncio.run(main())
