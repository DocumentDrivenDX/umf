# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Core+Codegen 0.10.9 keyed/unkeyed/resource probe (Linux receipt)."""
import hashlib, importlib.metadata as md, json, pathlib, platform, sys
import umf, umf_codegen
from umf import generate_pack_tools as via_core
from umf_codegen import generate_pack_tools as via_codegen

def canon(v): return json.dumps(v, sort_keys=True, separators=(",", ":"))
def req(keyed):
    pack = {"id": "linux-probe", "version": "1.0.0", "schemas": [{"id": "items", "reference": "items.json", "format": "tablespec"}]}
    table = {"version": "1.0", "table_name": "items", "columns": [
        {"name": "id", "data_type": "INTEGER", "nullable": False},
        {"name": "label", "data_type": "VARCHAR", "nullable": False}]}
    if keyed: table["primary_key"] = ["id"]
    return {"profile": "umf.pack-tools/1",
            "pack": {"id": pack["id"], "version": pack["version"], "text": json.dumps(pack, separators=(",", ":"))},
            "sources": [{"id": "items", "path": "items.json", "format": "json", "schemaFormat": "tablespec", "text": json.dumps(table, separators=(",", ":"))}],
            "options": {"schema": "public", "package": "linux_probe"}, "targets": ["ddl", "orm", "crud"]}

assert sys.version_info[:2] == (3, 11)
assert md.version("umf-core") == "0.10.9" and md.version("umf-codegen") == "0.10.9"
k1, k2 = via_core(req(True)), via_codegen(req(True))
assert k1 == k2 and k1["status"] == "generated" and {"ddl", "orm", "crud"} <= {f["kind"] for f in k1["files"]}
u1, u2 = via_core(req(False)), via_codegen(req(False))
assert u1 == u2 and u1["status"] == "partial"
assert any(d["code"] == "PACK_TOOLS_CRUD_KEY_REQUIRED" for d in u1["diagnostics"])
assert not any(f["kind"] in ("orm", "crud") for f in u1["files"])
res = pathlib.Path(umf_codegen.__file__).parent / "_resources"
m = json.loads((res / "manifest.json").read_text())
assert m["profile"] == "umf.codegen-resources/1" and len(m["files"]) == 10
for n, h in m["files"].items(): assert hashlib.sha256((res / n).read_bytes()).hexdigest() == h, n
core_dir = pathlib.Path(umf.__file__).parent
native = sorted(p.name for p in core_dir.glob("_rust_core*.so"))
cli = core_dir / "_bin" / "umf"
print(json.dumps({"status": "passed", "python": platform.python_version(), "machine": platform.machine(),
  "pydantic": md.version("pydantic"), "keyedSha256": hashlib.sha256(canon(k1).encode()).hexdigest(),
  "unkeyedSha256": hashlib.sha256(canon(u1).encode()).hexdigest(), "keyedFiles": sorted(f["path"] for f in k1["files"]),
  "codegenResources": len(m["files"]), "nativeExtension": native,
  "embeddedCliSha256": hashlib.sha256(cli.read_bytes()).hexdigest()}, sort_keys=True))
