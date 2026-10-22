"""Qualification-only pass-through recorder for original compile requests/results."""

import hashlib
import json
import runpy
import sys
from pathlib import Path

import weft

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
original = weft.compile_raw_read_json
calls = []


def observed(request):
    result = original(request)
    exact = result.encode()
    program = json.loads(result)
    record = {
        "requestText": request,
        "requestSha256": hashlib.sha256(request.encode()).hexdigest(),
        "programText": result,
        "programSha256": hashlib.sha256(exact).hexdigest(),
        "returnBytesUnchanged": True,
    }
    if program.get("status") == "compiled":
        probes = weft.compile_native_privilege_probes_json(
            json.dumps(
                {
                    "version": "weft.native-privilege-probes/0.1",
                    "request": json.loads(request),
                    "program": program,
                    "probeTable": "__weft_privilege_record_" + str(len(calls)),
                }
            )
        )
        checked = weft.check_native_privilege_probes_json(probes)
        if json.loads(probes).get("status") != "compiled" or json.loads(
            checked
        ) != json.loads(probes):
            raise ValueError("original owner refused exact captured compilation")
        record["originalOwnerProbes"] = json.loads(probes)
    calls.append(record)
    (out / "original-compile-calls.json").write_text(json.dumps(calls, indent=2) + "\n")
    assert result.encode() == exact
    return result


weft.compile_raw_read_json = observed
sys.argv = ["umf_access.build.catalog", *sys.argv[2:]]
runpy.run_module("umf_access.build.catalog", run_name="__main__")
