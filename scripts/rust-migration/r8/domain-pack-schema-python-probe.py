#!/usr/bin/env python3
"""Bounded opt-in CPython probe; pass a directory containing _rust_core.so."""
import hashlib
import json
import pathlib
import platform
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: python domain-pack-schema-python-probe.py EXTENSION_DIRECTORY")
extension_dir = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(extension_dir))
import _rust_core  # type: ignore  # noqa: E402

schema_bytes = pathlib.Path("spec/extensions/domain-pack/schema.json").read_bytes()
expected = json.loads(schema_bytes)
first = _rust_core.domain_pack_schema("1.0.0")
assert first == expected
first["properties"]["id"]["type"] = "integer"
assert _rust_core.domain_pack_schema("1.0.0") == expected
try:
    _rust_core.domain_pack_schema("2.0.0")
except ValueError as error:
    assert "DOMAIN_PACK_SCHEMA_VERSION" in str(error)
else:
    raise AssertionError("unknown version was accepted")
artifact = extension_dir / "_rust_core.so"
sha = lambda data: hashlib.sha256(data).hexdigest()
print(json.dumps({
    "status": "pass", "runtime": sys.version.split()[0], "arch": platform.machine(),
    "extensionSha256": sha(artifact.read_bytes()), "schemaSha256": sha(schema_bytes),
    "result": {"equal": True, "isolated": True, "refused": True},
}, sort_keys=True))
