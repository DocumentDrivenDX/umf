"""Frozen outer custody wrapper for selected R24/R20 native search cohorts."""

import argparse
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path("/Users/erik/.codex/worktrees/typed-sdk-recovery/umf")
PYTHON = Path("/private/tmp/sdk-privilege-r24-weft-r20-env/bin/python")
SDK = Path(
    "/private/tmp/sdk-completion-runtime-r24-wheels/umf_access-0.1.0.dev0-py3-none-any.whl"
)
WEFT = Path(
    "/private/tmp/weft-combined-sdk-local-r20/wheels/weft_sql-0.4.42.dev0-cp39-abi3-macosx_11_0_arm64.whl"
)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def snapshot():
    files = [
        ROOT / "python/umf_access/tests/search_e2e.py",
        ROOT / "scripts/pg_search_privilege_campaign.py",
        ROOT / "scripts/run-access-search-privilege-workflow.py",
        ROOT / "scripts/record-access-pg-runtime.py",
        ROOT / "scripts/record-access-privilege-build.py",
        ROOT / "scripts/pg_fixed_runtime_var_probes.py",
        ROOT / "scripts/pg_owner_privilege_resolver.py",
        ROOT / "scripts/pg_runtime_privilege_resolver.py",
        Path(__file__).resolve(),
    ]
    result = {str(p): sha(p) for p in files}
    site = Path(
        "/private/tmp/sdk-privilege-r24-weft-r20-env/lib/python3.14/site-packages"
    )
    payloads = []
    for wheel in [SDK, WEFT]:
        result[str(wheel)] = sha(wheel)
        with zipfile.ZipFile(wheel) as z:
            for name in z.namelist():
                if name.startswith(("umf_access/", "weft/")) and not name.endswith("/"):
                    data = z.read(name)
                    p = site / name
                    assert data == p.read_bytes(), name
                    result[str(p)] = sha(p)
                    payloads.append(name)
    assert len(payloads) == 49
    return {"files": result, "payloadCount": 49, "wheelInstalledEqual": True}


ap = argparse.ArgumentParser()
ap.add_argument("--out", type=Path, required=True)
ap.add_argument("--generated", type=Path, required=True)
ap.add_argument("--grants", action="store_true")
ap.add_argument("--full-record", action="store_true")
a = ap.parse_args()
a.out.mkdir()
before = snapshot()
(a.out / "before.json").write_text(json.dumps(before, indent=2) + "\n")
env = dict(
    os.environ,
    UMF_SEARCH_GENERATED_ROOT=str(a.generated),
    UMF_PGVECTOR_CONTROL_ROOT="/private/tmp/sdk-pgvector-control",
    UMF_SEARCH_VECTOR_VERSION="0.8.7",
)
if a.full_record:
    env["UMF_SEARCH_FULL_RECORD"] = "1"
script = ROOT / "python/umf_access/tests/search_e2e.py"
if a.grants:
    script = ROOT / "scripts/run-access-search-privilege-workflow.py"
    env.update(
        UMF_PRIVILEGE_WORKFLOW_OUT=str(a.out / "workflow"),
        UMF_PRIVILEGE_SDK_WHEEL=str(SDK),
        UMF_PRIVILEGE_SDK_SHA256=sha(SDK),
        UMF_PRIVILEGE_PROBE_APIS="compile_search_json",
    )
command = [
    str(PYTHON),
    "-I",
    "-B",
    str(ROOT / "scripts/record-access-pg-runtime.py"),
    "--out",
    str(a.out / "runtime.json"),
    "--compile-recorder",
    str(ROOT / "scripts/record-access-privilege-build.py"),
    str(script),
]
(a.out / "launch.json").write_text(
    json.dumps(
        {
            "command": command,
            "generated": str(a.generated),
            "grants": a.grants,
            "fullRecord": a.full_record,
        },
        indent=2,
    )
    + "\n"
)
with (a.out / "campaign.log").open("w") as log:
    p = subprocess.run(command, check=False, env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
after = snapshot()
(a.out / "after.json").write_text(json.dumps(after, indent=2) + "\n")
text = (a.out / "campaign.log").read_text()
receipt = {
    "exitCode": p.returncode,
    "sourceAndPayloadUnchanged": before == after,
    "ownedServerStopped": "ownedServerStopped=true" in text,
    "payloadCount": 49,
    "nativeAuthority": False,
    "inventoryComplete": False,
    "temporal": "HELD",
}
(a.out / "result.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
assert p.returncode == 0 and before == after and receipt["ownedServerStopped"]
