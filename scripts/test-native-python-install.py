"""Ordinary installed-wheel consumer using only the public umf Python API.

Run with an installed native wheel and JavaScript tools absent from PATH.
"""
import json
import platform
import sys
from importlib.metadata import version

from umf import (
    __version__,
    current_core_version,
    read_document,
    validate_document,
    write_document,
    create_postgresql_sql_engine,
)
from umf._rust import UmfCoreError

source = json.dumps(
    {
        "umf": "0.10.0",
        "id": "orders",
        "vocabularies": {},
        "modules": [],
    },
    separators=(",", ":"),
)
document = read_document(source, format="json")
result = validate_document(document)
if not result.valid or not result.complete:
    raise SystemExit(f"expected a valid complete ordinary UMF document: {result}")

round_trip = read_document(write_document(document, format="json"), format="json")
if round_trip.to_dict() != document.to_dict():
    raise SystemExit("UMF document changed during Python read/write round trip")


if version("umf-core") != __version__:
    raise SystemExit("installed distribution metadata and imported package version differ")
if current_core_version() != "0.10.0":
    raise SystemExit("unexpected UMF core document version")

engine = create_postgresql_sql_engine()
original = engine.import_sql("SELECT 1 AS value", "python-native-postgresql")
edited = engine.edit_node(
    original,
    "/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival",
    "2",
)
if not edited["validation"]["valid"]:
    raise SystemExit("native PostgreSQL edit did not validate")
sql = engine.export_sql(edited["document"])
if "2" not in sql or not engine.inspect(engine.import_sql(sql, "python-reparsed"))["valid"]:
    raise SystemExit("native PostgreSQL edit/export/reparse workflow failed")
if engine.get_source(original) != "SELECT 1 AS value":
    raise SystemExit("native PostgreSQL source was not preserved")
try:
    engine.import_sql("SELECT FROM", "python-invalid")
except UmfCoreError as error:
    if error.code != "POSTGRESQL_PARSE":
        raise SystemExit(f"unexpected PostgreSQL refusal: {error.code}") from error
else:
    raise SystemExit("invalid PostgreSQL SQL was not refused")
print(json.dumps({"postgresql": "edit-export-reparse", "refusal": "POSTGRESQL_PARSE"}, sort_keys=True))

print(
    json.dumps(
        {
            "status": "passed",
            "distributionVersion": version("umf-core"),
            "importVersion": __version__,
            "coreVersion": current_core_version(),
            "runtime": {
                "python": platform.python_version(),
                "platform": platform.system(),
                "architecture": platform.machine(),
            },
            "valid": result.valid,
            "complete": result.complete,
            "roundTrip": "preserved",
        },
        sort_keys=True,
        separators=(",", ":"),
    )
)
