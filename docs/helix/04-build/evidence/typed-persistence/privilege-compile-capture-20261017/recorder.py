"""Qualification-only pass-through recorder for original compile requests/results."""

import hashlib
import json
import runpy
import sys
from pathlib import Path

import weft

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
originals = {
    name: getattr(weft, name)
    for name in (
        "compile_raw_read_json",
        "compile_search_json",
        "compile_native_action_json",
        "compile_native_bulk_json",
    )
}
calls = []


def observed(api_name, request):
    result = originals[api_name](request)
    exact = result.encode()
    program = json.loads(result)
    record = {
        "compilerApi": api_name,
        "requestText": request,
        "requestSha256": hashlib.sha256(request.encode()).hexdigest(),
        "programText": result,
        "programSha256": hashlib.sha256(exact).hexdigest(),
        "returnBytesUnchanged": True,
    }
    if program.get("status") == "compiled" and api_name == "compile_raw_read_json":
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
    elif program.get("status") == "compiled":
        record["ownerPrivilegeProbeStatus"] = "UNRESOLVED_ORIGINAL_OWNER_API"
    calls.append(record)
    (out / "original-compile-calls.json").write_text(json.dumps(calls, indent=2) + "\n")
    assert result.encode() == exact
    return result


for api_name in originals:
    setattr(weft, api_name, lambda request, name=api_name: observed(name, request))
sys.argv = ["umf_access.build.catalog", *sys.argv[2:]]
runpy.run_module("umf_access.build.catalog", run_name="__main__")
