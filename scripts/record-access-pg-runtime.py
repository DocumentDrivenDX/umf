"""Qualification-only pass-through capture of actual Psycopg runtime calls.

No SQL is rewritten, no parameter values are retained, and no native result or
exception is replaced. This transcript is an observation, never an admission.
"""

from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import os
import runpy
import subprocess
import sys
from pathlib import Path

import psycopg

RUNTIME_NAMES = frozenset(
    {
        "postgres_read.py",
        "postgres_search.py",
        "native_actions.py",
        "postgres_bulk.py",
        "verification.py",
        "native_resolution.py",
        "native_projection.py",
        "native_relationship.py",
        "privilege_report.py",
    }
)


def protocol(cursor):
    query = getattr(cursor, "_query", None)
    if query is None:
        return {"observed": False}
    native = query.query
    if not isinstance(native, bytes):
        raise TypeError("native encoded query bytes absent")
    return {
        "observed": True,
        "nativeSql": native.decode("utf-8"),
        "nativeSqlSha256": hashlib.sha256(native).hexdigest(),
        "parameterOids": list(query.types),
        "parameterFormats": [int(x) for x in (query.formats or ())],
        "parameterNulls": [value is None for value in (query.params or ())],
    }


def compiler_command(command, destination, recorder):
    """Route only the exact catalog module call through original-API recording."""
    if not isinstance(command, (list, tuple)):
        return None
    original = [str(value) for value in command]
    if not original or Path(original[0]).resolve() != Path(sys.executable).resolve():
        return None
    try:
        index = original.index("-m")
    except ValueError:
        return None
    if any(flag not in {"-I", "-B", "-u"} for flag in original[1:index]):
        return None
    if original[index + 1 : index + 3] != ["umf_access.build.catalog", "catalog"]:
        return None
    return [*original[:index], str(recorder), str(destination), *original[index + 2 :]]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--compile-recorder", type=Path)
    ap.add_argument("script", type=Path)
    args = ap.parse_args()
    if args.out.exists():
        raise ValueError("new transcript destination required")
    entries = []
    capture_errors = []

    def origins():
        result = []
        runtime = False
        for frame in inspect.stack():
            p = Path(frame.filename)
            if p.name in RUNTIME_NAMES and p.parent.name == "umf_access":
                runtime = True
            if (
                (p.name in RUNTIME_NAMES and p.parent.name == "umf_access")
                or (p.parent.name == "tests" and p.parent.parent.name == "umf_access")
                or p.resolve() == args.script.resolve()
            ):
                result.append(
                    {
                        "path": str(p),
                        "line": frame.lineno,
                        "function": frame.function,
                        "sourceSha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                    }
                )
        return result if runtime else []

    def record(cursor, query, origin, error):
        if not origin:
            return
        if not isinstance(query, str):
            raise TypeError("selected runtime query must retain original SQL text")
        entries.append(
            {
                "sequence": len(entries),
                "sql": query,
                "sqlSha256": hashlib.sha256(query.encode()).hexdigest(),
                "origin": origin,
                "protocol": protocol(cursor),
                "outcome": "returned" if error is None else "raised",
                "sqlstate": getattr(error, "sqlstate", None),
                "resultColumns": [
                    {"native": column.name, "typeOid": column.type_code}
                    for column in (getattr(cursor, "description", None) or ())
                ],
                "nativeAuthority": False,
            }
        )
        args.out.write_text(
            json.dumps(
                {
                    "version": "umf.runtime-protocol-observation/0.1",
                    "nativeAuthority": False,
                    "inventoryComplete": False,
                    "parameterValuesRetained": False,
                    "calls": entries,
                },
                indent=2,
            )
            + "\n"
        )

    def observe(cursor, query, origin, error):
        try:
            record(cursor, query, origin, error)
        except Exception as failure:  # noqa: BLE001 - transcript failures defer until native cleanup
            capture_errors.append(
                {"type": type(failure).__name__, "message": str(failure)}
            )

    sync = psycopg.Cursor.execute
    asynchronous = psycopg.AsyncCursor.execute

    def execute(self, query, params=None, **kwargs):
        origin = origins()
        try:
            result = sync(self, query, params, **kwargs)
        except BaseException as error:
            observe(self, query, origin, error)
            raise
        observe(self, query, origin, None)
        return result

    async def execute_async(self, query, params=None, **kwargs):
        origin = origins()
        try:
            result = await asynchronous(self, query, params, **kwargs)
        except BaseException as error:
            observe(self, query, origin, error)
            raise
        observe(self, query, origin, None)
        return result

    original_run = subprocess.run
    compile_calls = []

    def recorded_subprocess(command, *positional, **kwargs):
        changed = None
        if args.compile_recorder is not None:
            destination = args.out.parent / (
                args.out.stem + "-compile-" + str(len(compile_calls))
            )
            changed = compiler_command(command, destination, args.compile_recorder)
        if changed is None:
            return original_run(command, *positional, **kwargs)
        compile_calls.append(
            {"originalCommand": list(map(str, command)), "recordingCommand": changed}
        )
        environment = dict(kwargs.get("env") or os.environ)
        environment["UMF_PRIVILEGE_PROBE_APIS"] = (
            "compile_raw_read_json,compile_search_json,compile_native_action_json,compile_native_bulk_json"
        )
        kwargs["env"] = environment
        return original_run(changed, *positional, **kwargs)

    subprocess.run = recorded_subprocess
    psycopg.Cursor.execute = execute
    psycopg.AsyncCursor.execute = execute_async
    try:
        runpy.run_path(str(args.script), run_name="__main__")
    finally:
        subprocess.run = original_run
        if compile_calls:
            args.out.with_suffix(args.out.suffix + ".compile-calls.json").write_text(
                json.dumps(compile_calls, indent=2) + "\n"
            )
        psycopg.Cursor.execute = sync
        psycopg.AsyncCursor.execute = asynchronous
        if capture_errors:
            args.out.with_suffix(args.out.suffix + ".capture-failures.json").write_text(
                json.dumps(capture_errors, indent=2) + "\n"
            )
    if capture_errors:
        raise RuntimeError(
            "runtime protocol transcript incomplete; see capture-failures receipt"
        )
    if not entries:
        raise RuntimeError("runtime protocol transcript has no selected calls")


if __name__ == "__main__":
    main()
