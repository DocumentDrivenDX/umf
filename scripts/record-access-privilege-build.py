# SPDX-License-Identifier: MIT OR Apache-2.0
"""Qualification-only pass-through recorder for original compile requests/results."""

import hashlib
import inspect
import json
import os
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
probe_apis = set(
    os.environ.get("UMF_PRIVILEGE_PROBE_APIS", "compile_raw_read_json").split(",")
)
if not probe_apis <= originals.keys():
    raise ValueError("unknown original compiler privilege probe API selection")
calls = []


def imported_source_custody():
    import umf_access

    root = Path(umf_access.__file__).resolve().parent
    compiler = {}
    for name in ("weft", "weft.weft"):
        module = sys.modules.get(name)
        path = (
            Path(module.__file__).resolve()
            if module is not None and getattr(module, "__file__", None)
            else None
        )
        if path is None or not path.is_file():
            raise ValueError("actual compiler module source absent")
        compiler[name] = {
            "path": str(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    sources = {}
    for frame in inspect.stack():
        path = Path(frame.filename).resolve()
        if path.is_relative_to(root) and path.is_file():
            sources[str(path)] = {
                "payload": "umf_access/" + str(path.relative_to(root)),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
    if not sources:
        raise ValueError("actual SDK compiler callsite source absent")
    return {
        "runtimePackageRoot": str(root),
        "compilerModules": compiler,
        "actualRuntimeSources": sources,
        "nativeAuthority": False,
    }


def observed(api_name, request):
    result = originals[api_name](request)
    exact = result.encode()
    program = json.loads(result)
    record = {
        "compilerApi": api_name,
        "importedSourceCustody": imported_source_custody(),
        "requestText": request,
        "requestSha256": hashlib.sha256(request.encode()).hexdigest(),
        "programText": result,
        "programSha256": hashlib.sha256(exact).hexdigest(),
        "returnBytesUnchanged": True,
    }
    if program.get("status") == "compiled" and api_name in probe_apis:
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
