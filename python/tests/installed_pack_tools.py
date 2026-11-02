# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-pair smoke probe for the public Rust Pack Tools generator."""

from __future__ import annotations

import importlib.metadata
import json
from importlib import resources

from umf_codegen import generate_pack_tools
from umf_codegen._release import UMF_CORE_VERSION


pack = {
    "id": "installed-pack-tools-smoke",
    "version": "1.0.0",
    "schemas": [
        {"id": "items", "reference": "items.json", "format": "tablespec"}
    ],
}
table = {
    "version": "1.0",
    "table_name": "items",
    "columns": [
        {"name": "id", "data_type": "INTEGER", "nullable": False},
        {"name": "label", "data_type": "VARCHAR", "nullable": False},
    ],
    "primary_key": ["id"],
}
request = {
    "profile": "umf.pack-tools/1",
    "pack": {
        "id": pack["id"],
        "version": pack["version"],
        "text": json.dumps(pack, separators=(",", ":")),
    },
    "sources": [
        {
            "id": "items",
            "path": "items.json",
            "format": "json",
            "schemaFormat": "tablespec",
            "text": json.dumps(table, separators=(",", ":")),
        }
    ],
    "options": {"schema": "public", "package": "installed_smoke"},
    "targets": ["ddl", "orm", "crud"],
}

core_version = importlib.metadata.version("umf-core")
codegen_version = importlib.metadata.version("umf-codegen")
if core_version != UMF_CORE_VERSION:
    raise SystemExit("installed umf-core version differs from the codegen pin")
if not resources.files("umf").joinpath("_bin", "umf").is_file():
    raise SystemExit("pinned umf-core CLI binary is missing")

result = generate_pack_tools(request)
if result.get("profile") != "umf.pack-tools-result/1" or result.get("status") != "generated":
    raise SystemExit("installed Pack Tools API returned an unexpected profile or status")
if result.get("pack") != {"id": pack["id"], "version": pack["version"]}:
    raise SystemExit("installed Pack Tools result lost its pack identity")
files = {item["path"]: item["text"] for item in result["files"]}
if "CREATE TABLE" not in files.get("schema.sql", ""):
    raise SystemExit("installed Pack Tools result is missing schema DDL")
if "class Items(Base)" not in files.get("installed_smoke/models.py", ""):
    raise SystemExit("installed Pack Tools result is missing its ORM model")
crud = files.get("installed_smoke/crud.py", "")
if "def create_items" not in crud or "def delete_items" not in crud:
    raise SystemExit("installed Pack Tools result is missing CRUD operations")

print(
    json.dumps(
        {
            "profile": "umf.pack-tools-installed-pair/1",
            "status": "passed",
            "umfCoreVersion": core_version,
            "umfCodegenVersion": codegen_version,
            "resultProfile": result["profile"],
            "resultStatus": result["status"],
            "sourceDigest": result["sourceDigest"],
            "filePaths": sorted(files),
            "umfPackage": str(resources.files("umf")),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)
