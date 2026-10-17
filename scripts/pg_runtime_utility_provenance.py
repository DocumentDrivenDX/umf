"""Closed observed timeout-utility provenance, separate from parse-tree analysis.

A returned utility establishes only the selected native authorization outcome.
It does not invent a pg_rewrite tree, function grants or target qualification.
"""

import ast
import hashlib
import re
import zipfile
from pathlib import Path


def timeout_utility(observation, source_archive):
    query = observation.get("sql")
    match = re.fullmatch(r"SET LOCAL statement_timeout = '([1-9][0-9]{0,9})ms'", query or "")
    if match is None or int(match[1]) > 2_147_483_647:
        raise ValueError("unsupported runtime utility or timeout domain")
    digest = lambda data: hashlib.sha256(data).hexdigest()
    protocol = observation.get("protocol", {})
    if (
        observation.get("outcome") != "returned"
        or observation.get("sqlSha256") != digest(query.encode())
        or observation.get("resultColumns") != []
        or protocol.get("observed") is not True
        or protocol.get("nativeSql") != query
        or protocol.get("nativeSqlSha256") != digest(query.encode())
        or any(protocol.get(key) != [] for key in ("parameterOids", "parameterFormats", "parameterNulls"))
    ):
        raise ValueError("exact successful parameterless native utility protocol required")
    archive = Path(source_archive["path"])
    if digest(archive.read_bytes()) != source_archive["sha256"]:
        raise ValueError("runtime wheel hash differs")
    with zipfile.ZipFile(archive) as wheel:
        payload = "umf_access/postgres_read.py"
        data = wheel.read(payload)
        tree = ast.parse(data)
        helpers = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_snapshot_free_timeout"]
        if len(helpers) != 1:
            raise ValueError("exact runtime timeout helper absent")
        helper = helpers[0]
        # Pin its complete implementation, independently of the validated emitted
        # utility value; no caller-provided digest can substitute for wheel bytes.
        helper_source = ast.get_source_segment(data.decode(), helper)
        callers = []
        for origin in observation.get("origin", []):
            caller = Path(origin.get("path", ""))
            name = "umf_access/" + caller.name
            if caller.parent.name != "umf_access" or name not in wheel.namelist() or not caller.is_file():
                continue
            expected = wheel.read(name)
            if caller.read_bytes() != expected or origin.get("sourceSha256") != digest(expected):
                raise ValueError("actual utility caller differs from runtime wheel")
            selected_callsites = {
                "postgres_read.py": {"_drive", "_async_drive"},
                "postgres_search.py": {"_run_search"},
            }
            if origin.get("function") in selected_callsites.get(caller.name, set()):
                callers.append(origin)
        if not callers:
            raise ValueError("original runtime utility execution callsite absent")
    return {
        "version": "umf.pg-runtime-utility-observation/0.1",
        "kind": "snapshot-free-statement-timeout",
        "sql": query,
        "sqlSha256": observation["sqlSha256"],
        "milliseconds": int(match[1]),
        "protocol": protocol,
        "sourceWheelSha256": source_archive["sha256"],
        "helperPayload": payload,
        "helperPayloadSha256": digest(data),
        "helperSourceSha256": digest(helper_source.encode()),
        "actualCallsites": callers,
        "nativeAuthorizationOutcome": "selected-execution-returned",
        "parseTreeAnalysisApplicable": False,
        "nativeAuthority": False,
        "inventoryComplete": False,
    }
