# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare the installed Rust scanner's reviewed DB-API path to its predecessor."""
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib
import json
import re
import sys
import types
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[6]
PACKET = Path(__file__).resolve().parent
SOURCE = ROOT / "python/umf_access/src/umf_access/reviewed.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native_umf_path() -> Path:
    for entry in sys.path:
        candidate = Path(entry or ".").resolve() / "umf"
        if (candidate / "rust_reviewed_parameters.py").is_file() and (
            candidate / "_rust_core" / "_rust_core.abi3.so"
        ).is_file():
            return candidate
    raise RuntimeError(
        "native UMF overlay missing; put its umf/ package root on PYTHONPATH"
    )


def load_functions() -> tuple[dict[str, Any], dict[str, Any]]:
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    names = {
        "ReadBuildError",
        "_parameter_positions_python",
        "_parameter_positions",
        "_dbapi",
        "_dbapi_order",
    }
    nodes = [
        node for node in tree.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names
    ]
    code = compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), "exec")
    baseline: dict[str, Any] = {"re": re}
    exec(code, baseline)
    baseline["_parameter_positions"] = baseline["_parameter_positions_python"]
    native: dict[str, Any] = {"re": re}
    exec(code, native)
    return baseline, native


class StartsComment(str):
    calls: list[tuple[str, int]] = []

    def startswith(self, prefix: str, start: int = 0, end: int | None = None) -> bool:
        self.calls.append((prefix, start))
        if prefix == "--":
            return True
        return super().startswith(prefix, start, len(self) if end is None else end)


def case_sql(item: dict[str, Any]) -> str:
    kind = item["kind"]
    if kind == "sql":
        return item["sql"]
    if kind == "int_limit_plus_one":
        limit = sys.get_int_max_str_digits()
        if not limit:
            raise RuntimeError("interpreter integer digit limit must be active")
        return "$" + "1" * (limit + 1) + " /* open"
    if kind == "unicode_e_prefix":
        return "\u1c89E'foo\\' $1' + $2"
    if kind == "lone_surrogate":
        return "\ud800 $1"
    if kind == "explicit_surrogate_pair":
        return "\ud83d\ude00 $1"
    if kind == "str_subclass_startswith":
        return StartsComment("$1 %")
    raise AssertionError(kind)


def outcome(function, *args: object) -> tuple[object, ...]:
    try:
        return ("ok", function(*args))
    except BaseException as error:
        return (
            "error",
            type(error).__name__,
            str(error),
            None if error.__cause__ is None else type(error.__cause__).__name__,
            None if error.__context__ is None else type(error.__context__).__name__,
            error.__suppress_context__,
        )


def exception_json(value: tuple[object, ...]) -> dict[str, object] | None:
    if value[0] != "error":
        return None
    return {
        "type": value[1],
        "message": value[2],
        "cause_type": value[3],
        "context_type": value[4],
        "suppress_context": value[5],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", type=Path)
    args = parser.parse_args()

    # Avoid importing umf.__init__: it loads the rest of the project package.
    package = types.ModuleType("umf")
    package.__path__ = [str(native_umf_path())]
    sys.modules["umf"] = package
    bridge = importlib.import_module("umf.rust_reviewed_parameters")
    baseline, native = load_functions()
    cases = json.loads((PACKET / "cases.json").read_text(encoding="utf-8"))["cases"]
    results = []
    for item in cases:
        sql = case_sql(item)
        order = item.get("order", ["p0", "p1", "p2"])
        if isinstance(sql, StartsComment):
            StartsComment.calls = []
        expected_positions = outcome(baseline["_parameter_positions"], sql)
        expected_startswith = list(StartsComment.calls) if isinstance(sql, StartsComment) else None
        if isinstance(sql, StartsComment):
            StartsComment.calls = []
        actual_positions = outcome(native["_parameter_positions"], sql)
        actual_startswith = list(StartsComment.calls) if isinstance(sql, StartsComment) else None
        expected_sql = outcome(baseline["_dbapi"], sql)
        actual_sql = outcome(native["_dbapi"], sql)
        expected_order = outcome(baseline["_dbapi_order"], sql, order)
        actual_order = outcome(native["_dbapi_order"], sql, order)
        result = {
            "id": item["id"],
            "positions_equal": actual_positions == expected_positions,
            "dbapi_sql_equal": actual_sql == expected_sql,
            "dbapi_order_equal": actual_order == expected_order,
            "native_error": exception_json(actual_positions),
        }
        if isinstance(sql, StartsComment):
            result["startswith_calls_equal"] = actual_startswith == expected_startswith
            result["startswith_calls"] = [list(call) for call in actual_startswith or []]
        results.append(result)
        checks = ["positions_equal", "dbapi_sql_equal", "dbapi_order_equal"]
        if isinstance(sql, StartsComment):
            checks.append("startswith_calls_equal")
        if not all(result[key] for key in checks):
            raise AssertionError(json.dumps(result, ensure_ascii=True))

    native_dir = native_umf_path() / "_rust_core" / "_rust_core.abi3.so"
    report = {
        "scope": "installed Python ABI3 host bridge; source predecessor oracle; no DB/driver behavior",
        "python": sys.version.split()[0],
        "implementation": sys.implementation.name,
        "unicode_version": unicodedata.unidata_version,
        "int_max_str_digits": sys.get_int_max_str_digits(),
        "profile": bridge.access_reviewed_parameter_profile_version(),
        "native_extension_sha256": sha256(native_dir),
        "sources": {
            "reviewed_py_sha256": sha256(SOURCE),
            "public_bridge_sha256": sha256(ROOT / "python/src/umf/rust_reviewed_parameters.py"),
            "python_binding_sha256": sha256(ROOT / "bindings/core/python/src/lib.rs"),
            "rust_scanner_sha256": sha256(ROOT / "crates/umf-core/src/reviewed_parameters.rs"),
        },
        "wheel": None if args.wheel is None else {"path": str(args.wheel), "sha256": sha256(args.wheel)},
        "cases": results,
    }
    print(json.dumps(report, ensure_ascii=True, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
