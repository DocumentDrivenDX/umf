#!/usr/bin/env python3
"""Capture the retained Python predecessor and frozen oracle without native builds."""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import platform
import re
import runpy
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[6]
PACKET = Path(__file__).resolve().parent
SOURCE = ROOT / "python/umf_access/src/umf_access/reviewed.py"
FROZEN = PACKET / "frozen/reviewed_parameter_scanner.py"
INDEPENDENT = PACKET / "independent/cases.json"
SOURCE_HASHES = PACKET / "source-hashes.json"


def _load_active() -> dict[str, Any]:
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    selected = [
        node
        for node in tree.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef))
        and node.name in {"ReadBuildError", "_parameter_positions_python"}
    ]
    if {node.name for node in selected} != {"ReadBuildError", "_parameter_positions_python"}:
        raise RuntimeError("retained Python predecessor source shape changed")
    module = ast.Module(body=selected, type_ignores=[])
    namespace: dict[str, Any] = {"re": re}
    exec(compile(module, str(SOURCE), "exec"), namespace)
    frozen_tree = ast.parse(FROZEN.read_text(encoding="utf-8"), filename=str(FROZEN))
    frozen_nodes = {
        node.name: node
        for node in frozen_tree.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef))
        and node.name in {"ReadBuildError", "_parameter_positions"}
    }
    for name in ("ReadBuildError", "_parameter_positions"):
        active_name = "_parameter_positions_python" if name == "_parameter_positions" else name
        active_node = next(node for node in selected if node.name == active_name)
        active_node.name = name
        if ast.dump(active_node) != ast.dump(frozen_nodes[name]):
            raise RuntimeError(f"frozen predecessor differs from retained Python {active_name}")
    namespace["_parameter_positions"] = namespace["_parameter_positions_python"]
    return namespace


def _outcome(function: Any, sql: str) -> dict[str, Any]:
    try:
        spans = function(sql)
    except Exception as error:  # Capture the exact predecessor refusal surface.
        cause = error.__cause__
        context = error.__context__
        return {
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "cause": None if cause is None else [type(cause).__name__, str(cause)],
                "context": None if context is None else [type(context).__name__, str(context)],
                "suppress_context": error.__suppress_context__,
            }
        }
    return {"spans": [[start, stop, str(index)] for start, stop, index in spans]}


def _case(sql: str, outcome: dict[str, Any]) -> dict[str, Any]:
    return {"sql_codepoints": [ord(character) for character in sql], **outcome}


def _case_text(item: dict[str, Any]) -> str:
    if "codepoints" in item:
        return "".join(chr(codepoint) for codepoint in item["codepoints"])
    return item["sql"]


def capture_report() -> dict[str, Any]:
    active = _load_active()
    frozen = runpy.run_path(str(FROZEN))
    independent = json.loads(INDEPENDENT.read_text(encoding="utf-8"))
    source_hashes = json.loads(SOURCE_HASHES.read_text(encoding="utf-8"))
    cases: list[dict[str, Any]] = []
    for item in independent["cases"]:
        sql = _case_text(item)
        cases.append(
            {
                "id": item["id"],
                "input": _case(sql, _outcome(active["_parameter_positions"], sql)),
                "frozen": _case(sql, _outcome(frozen["_parameter_positions"], sql)),
                "independent_expected": item.get("spans", item.get("error")),
            }
        )
    cpython_minor = ".".join(platform.python_version().split(".")[:2])
    for item in independent.get("versioned_cases", []):
        sql = item["sql"]
        cases.append(
            {
                "id": item["id"],
                "input": _case(sql, _outcome(active["_parameter_positions"], sql)),
                "frozen": _case(sql, _outcome(frozen["_parameter_positions"], sql)),
                "independent_expected": item["expected_by_cpython"][cpython_minor],
            }
        )

    digit_limit = sys.get_int_max_str_digits()
    digit_text = "1" * (digit_limit + 1)
    digit_sql = "SELECT $" + digit_text
    limited_active = _outcome(active["_parameter_positions"], digit_sql)
    limited_frozen = _outcome(frozen["_parameter_positions"], digit_sql)
    try:
        expected_int = str(int(digit_text) - 1)
        limited_expected: dict[str, Any] = {
            "spans": [[7, len(digit_sql), expected_int]]
        }
    except ValueError as error:
        limited_expected = {
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "cause": None,
                "context": None,
                "suppress_context": False,
            }
        }
    cases.append(
        {
            "id": "python_int_digit_limit_default",
            "input": _case(digit_sql, limited_active),
            "frozen": _case(digit_sql, limited_frozen),
            "independent_expected": limited_expected,
            "int_max_str_digits": digit_limit,
        }
    )

    previous_limit = sys.get_int_max_str_digits()
    try:
        sys.set_int_max_str_digits(0)
        unlimited_active = _outcome(active["_parameter_positions"], digit_sql)
        unlimited_frozen = _outcome(frozen["_parameter_positions"], digit_sql)
        unlimited_expected = {"spans": [[7, len(digit_sql), str(int(digit_text) - 1)]]}
    finally:
        sys.set_int_max_str_digits(previous_limit)
    cases.append(
        {
            "id": "python_int_digit_limit_disabled",
            "input": _case(digit_sql, unlimited_active),
            "frozen": _case(digit_sql, unlimited_frozen),
            "independent_expected": unlimited_expected,
            "int_max_str_digits": 0,
        }
    )

    return {
        "profile": "umf-access-reviewed-transport/0.1.0-predecessor",
        "scope": "reviewed.py._parameter_positions only",
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "build": sys.version,
            "unicode_database": __import__("unicodedata").unidata_version,
        },
        "host_capabilities": {
            "isalnum_u1c89": chr(0x1C89).isalnum(),
        },
        # Keep the Gate 0 capture reproducible after the active implementation
        # moves to Rust; the retained Python function is checked by AST above.
        "source_sha256": source_hashes["gate0_active_reviewed_py_sha256"],
        "frozen_sha256": hashlib.sha256(FROZEN.read_bytes()).hexdigest(),
        "independent_cases_sha256": hashlib.sha256(INDEPENDENT.read_bytes()).hexdigest(),
        "cases": cases,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = capture_report()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
