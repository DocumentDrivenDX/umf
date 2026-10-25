# SPDX-License-Identifier: MIT OR Apache-2.0
"""Capture the current Python predecessor for legacy DB-API transport."""
from __future__ import annotations

import ast
import hashlib
import json
import re
import sys
from collections.abc import Mapping
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
SOURCE = ROOT / "python/umf_access/src/umf_access/reviewed.py"
PACKET = Path(__file__).resolve().parent


class StartsComment(str):
    calls: list[tuple[str, int]] = []

    def startswith(self, prefix, start=0, end=None):
        self.calls.append((prefix, start))
        if prefix == "--":
            return True
        return super().startswith(prefix, start, len(self) if end is None else end)


def load_predecessor():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    wanted = {"ReadBuildError", "_json", "_parameter_positions_python", "_dbapi", "_dbapi_order", "_compiler_transport"}
    nodes = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in wanted]
    namespace = {"hashlib": hashlib, "json": json, "re": re, "Mapping": Mapping, "cast": __import__("typing").cast}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), "exec"), namespace)
    namespace["_parameter_positions"] = namespace["_parameter_positions_python"]
    return namespace


def exception(error: BaseException) -> dict[str, object]:
    return {
        "type": type(error).__name__,
        "message": str(error),
        "cause": None if error.__cause__ is None else [type(error.__cause__).__name__, str(error.__cause__)],
        "context": None if error.__context__ is None else [type(error.__context__).__name__, str(error.__context__)],
        "suppress_context": error.__suppress_context__,
    }


def run_one(ns, item):
    kind = item["kind"]
    if kind == "sql":
        sql = item["sql"]
    elif kind == "int_limit_plus_one":
        limit = sys.get_int_max_str_digits()
        if not limit:
            raise RuntimeError("capture requires the interpreter's active int digit limit")
        sql = "$" + "1" * (limit + 1) + " /* open"
    elif kind == "unicode_e_prefix":
        sql = "\u1c89E'foo\\' $1' + $2"
    elif kind == "lone_surrogate":
        sql = "\ud800 $1"
    elif kind == "explicit_surrogate_pair":
        sql = "\ud83d\ude00 $1"
    elif kind == "str_subclass_startswith":
        StartsComment.calls = []
        sql = StartsComment("$1 %")
    else:
        raise AssertionError(kind)

    order = item.get("order", ["p0", "p1", "p2"])
    result: dict[str, object] = {"id": item["id"], "sql_type": type(sql).__name__}
    try:
        result["positions"] = [list(position) for position in ns["_parameter_positions_python"](sql)]
    except BaseException as error:
        result["positions_error"] = exception(error)
    try:
        result["dbapi_sql"] = ns["_dbapi"](sql)
    except BaseException as error:
        result["dbapi_error"] = exception(error)
    try:
        result["dbapi_order"] = ns["_dbapi_order"](sql, order)
    except BaseException as error:
        result["order_error"] = exception(error)
    if isinstance(sql, StartsComment):
        result["startswith_calls"] = [list(call) for call in StartsComment.calls]
    return result


def sealed_and_legacy(ns):
    artifact = {"sql": "SELECT $1", "parameterOrder": ["p"], "dbapiSql": "SELECT %s", "dbapiParameterOrder": ["p"]}
    artifact["structuralDigest"] = hashlib.sha256(ns["_json"](artifact).encode()).hexdigest()
    sealed = ns["_compiler_transport"](artifact)
    legacy = dict(artifact)
    legacy.pop("dbapiSql")
    legacy.pop("dbapiParameterOrder")
    legacy.pop("structuralDigest")
    legacy["structuralDigest"] = hashlib.sha256(ns["_json"](legacy).encode()).hexdigest()
    return {"sealed_transport": sealed, "legacy_without_transport": ns["_compiler_transport"](legacy)}


def build_transport_gate(tree):
    reviewed = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "ReviewedSQL")
    build = next(node for node in reviewed.body if isinstance(node, ast.FunctionDef) and node.name == "build")
    gate = next(
        (node for node in build.body if isinstance(node, ast.If)
         and isinstance(node.test, ast.UnaryOp) and isinstance(node.test.op, ast.Not)
         and isinstance(node.test.operand, ast.Call)
         and isinstance(node.test.operand.func, ast.Name)
         and node.test.operand.func.id == "_compiler_transport"),
        None,
    )
    calls = {node.func.id for node in ast.walk(gate) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)} if gate else set()
    gate_offset = build.body.index(gate) if gate else -1
    return {
        "sealed_predicate_precedes_rebuild": gate_offset >= 0,
        "rebuild_guard_calls_dbapi_and_order": {"_dbapi", "_dbapi_order"}.issubset(calls),
    }


def report():
    ns = load_predecessor()
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    cases = json.loads((PACKET / "cases.json").read_text(encoding="utf-8"))
    return {
        "python": sys.version.split()[0],
        "implementation": sys.implementation.name,
        "unicode_version": __import__("unicodedata").unidata_version,
        "int_max_str_digits": sys.get_int_max_str_digits(),
        "reviewed_py_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "predecessor_ast_sha256": {
            node.name: hashlib.sha256(ast.unparse(node).encode()).hexdigest()
            for node in ast.parse(SOURCE.read_text(encoding="utf-8")).body
            if isinstance(node, (ast.ClassDef, ast.FunctionDef))
            and node.name in {"ReadBuildError", "_json", "_parameter_positions_python", "_dbapi", "_dbapi_order", "_compiler_transport"}
        },
        "cases": [run_one(ns, item) for item in cases["cases"]],
        "transport_seal": sealed_and_legacy(ns),
        "build_transport_gate": build_transport_gate(tree),
    }


if __name__ == "__main__":
    print(json.dumps(report(), ensure_ascii=True, sort_keys=True, indent=2))
