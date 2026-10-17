"""Qualification-only pass-through capture of actual Psycopg runtime calls.

No SQL is rewritten, no parameter values are retained, and no native result or
exception is replaced. This transcript is an observation, never an admission.
"""

from __future__ import annotations

import argparse
import hashlib
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


_UNSET = object()


def protocol(cursor, converted=_UNSET):
    query = getattr(cursor, "_query", None) if converted is _UNSET else converted
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


def connection_identity(cursor):
    """Observe libpq connection identity without attributing SET ROLE state."""
    connection = cursor.connection
    info = connection.info
    native = connection.pgconn
    pid = info.backend_pid
    if type(pid) is not int or pid <= 0 or native.backend_pid != pid:
        raise ValueError("actual native connection backend identity absent")
    database, user, host, port = info.dbname, info.user, info.host, info.port
    if any(not isinstance(value, str) or not value for value in (database, user, host)) or type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("actual native connection endpoint identity absent")
    return {
        "connectionObjectId": id(connection),
        "nativeConnectionObjectId": id(native),
        "backendPid": pid,
        "database": database,
        "startupUser": user,
        "host": host,
        "port": port,
        "sessionUser": "UNOBSERVED",
        "effectiveUser": "UNOBSERVED",
        "roleAttribution": "startup identity does not establish session/current_user under SET ROLE",
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--compile-recorder", type=Path)
    ap.add_argument("script", type=Path)
    args = ap.parse_args()
    journal = args.out.with_suffix(".jsonl")
    if args.out.exists() or journal.exists():
        raise ValueError("new transcript destination required")
    entries = []
    count = 0
    script_names = {str(args.script), str(args.script.resolve())}
    source_hashes = {}
    capture_errors = []
    converted_calls = {}
    converter_sources = {}
    converters = {}
    for cls in (psycopg.Cursor, psycopg.AsyncCursor):
        original = cls._convert_query
        converters[cls] = (original, "_convert_query" in cls.__dict__)
        path = Path(original.__code__.co_filename).resolve()
        converter_sources[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()

    def converter(original):
        def observe_conversion(cursor, *args, **kwargs):
            value = original(cursor, *args, **kwargs)
            active = converted_calls.get(id(cursor))
            if active is not None:
                try:
                    observed = protocol(cursor, value)
                    if observed.get("observed") is not True:
                        raise ValueError("actual native conversion returned no query")
                    active.append(observed)
                except Exception as failure:  # noqa: BLE001 - preserve original adaptation return
                    capture_errors.append(
                        {"type": type(failure).__name__, "message": str(failure)}
                    )
            return value

        return observe_conversion

    args.out.write_text(
        json.dumps(
            {
                "version": "umf.runtime-protocol-observation/0.1",
                "nativeAuthority": False,
                "inventoryComplete": False,
                "parameterValuesRetained": False,
                "eventJournal": str(journal),
                "calls": [],
                "totalCalls": 0,
                "callsComplete": False,
            },
            indent=2,
        )
        + "\n"
    )

    def origins():
        result = []
        runtime = False
        frame = sys._getframe()
        while frame is not None:
            p = Path(frame.f_code.co_filename)
            if p.name in RUNTIME_NAMES and p.parent.name == "umf_access":
                runtime = True
            if (
                (p.name in RUNTIME_NAMES and p.parent.name == "umf_access")
                or (p.parent.name == "tests" and p.parent.parent.name == "umf_access")
                or str(p) in script_names
            ):
                key = str(p)
                if key not in source_hashes:
                    source_hashes[key] = hashlib.sha256(p.read_bytes()).hexdigest()
                result.append(
                    {
                        "path": str(p),
                        "line": frame.f_lineno,
                        "function": frame.f_code.co_name,
                        "sourceSha256": source_hashes[key],
                    }
                )
            frame = frame.f_back
        return result if runtime else []

    def record(cursor, query, origin, error):
        if not origin:
            return
        if not isinstance(query, str):
            raise TypeError("selected runtime query must retain original SQL text")
        nonlocal count
        observed = converted_calls.get(id(cursor), [])
        if len(observed) != 1:
            raise ValueError(
                "exactly one actual converted native query required per execute"
            )
        entry = {
            "sequence": count,
            "sql": query,
            "sqlSha256": hashlib.sha256(query.encode()).hexdigest(),
            "origin": origin,
            "nativeConnection": connection_identity(cursor),
            "protocol": observed[0],
            "outcome": "returned" if error is None else "raised",
            "sqlstate": getattr(error, "sqlstate", None),
            "resultColumns": [
                {"native": column.name, "typeOid": column.type_code}
                for column in (getattr(cursor, "description", None) or ())
            ],
            "nativeAuthority": False,
        }
        with journal.open("a") as output:
            output.write(json.dumps(entry, separators=(",", ":")) + "\n")
        count += 1
        # Bounded convenience snapshot only. The append-only journal retains
        # every observation, including all revoke/recover attempts.
        if len(entries) < 1000:
            entries.append(entry)

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
        converted_calls[id(self)] = []
        try:
            result = sync(self, query, params, **kwargs)
        except BaseException as error:
            observe(self, query, origin, error)
            converted_calls.pop(id(self), None)
            raise
        observe(self, query, origin, None)
        converted_calls.pop(id(self), None)
        return result

    async def execute_async(self, query, params=None, **kwargs):
        origin = origins()
        converted_calls[id(self)] = []
        try:
            result = await asynchronous(self, query, params, **kwargs)
        except BaseException as error:
            observe(self, query, origin, error)
            converted_calls.pop(id(self), None)
            raise
        observe(self, query, origin, None)
        converted_calls.pop(id(self), None)
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
    for cls, (original, _) in converters.items():
        cls._convert_query = converter(original)
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
        for cls, (original, owned) in converters.items():
            if owned:
                cls._convert_query = original
            else:
                del cls._convert_query
        driver_changed = [
            path
            for path, sha in converter_sources.items()
            if not Path(path).is_file()
            or hashlib.sha256(Path(path).read_bytes()).hexdigest() != sha
        ]
        if driver_changed:
            capture_errors.append(
                {"type": "DriverSourceChanged", "paths": driver_changed}
            )
        changed = {
            path: sha
            for path, sha in source_hashes.items()
            if not Path(path).is_file()
            or hashlib.sha256(Path(path).read_bytes()).hexdigest() != sha
        }
        if changed:
            capture_errors.append({"type": "SourceChanged", "paths": sorted(changed)})
        args.out.write_text(
            json.dumps(
                {
                    "version": "umf.runtime-protocol-observation/0.1",
                    "nativeAuthority": False,
                    "inventoryComplete": False,
                    "parameterValuesRetained": False,
                    "eventJournal": str(journal),
                    "eventJournalSha256": hashlib.sha256(
                        journal.read_bytes()
                    ).hexdigest()
                    if journal.exists()
                    else None,
                    "calls": entries,
                    "totalCalls": count,
                    "callsComplete": count == len(entries),
                    "snapshotMaximumCalls": 1000,
                    "driverConversionSources": converter_sources,
                    "driverConversionSourcesUnchanged": not driver_changed,
                    "sourceFiles": source_hashes,
                    "sourceFilesUnchanged": not changed,
                },
                indent=2,
            )
            + "\n"
        )
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
