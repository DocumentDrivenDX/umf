# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed UMF/Hohfeld/Weft reader probe on a disposable Truss/PostgreSQL host."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
from typing import Any

import psycopg
import weft
from hohfeld import Hohfeld, Invalid, Placement
from hohfeld.adapters.truss import ModuleAccess, TrussBackend
from hohfeld.adapters.truss.local import LocalTruss
from umf import read_document, validate_document

ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "tests/adoption/hohfeld-u9-document.json"
MODULE = "u9demo"
DOC_ID = "u9-public-reader-probe"
SCHEMA = "u9_native"
QUERY = 'SELECT t.id AS id, t.note AS note FROM "u9demo"."Thing" AS t ORDER BY t.id LIMIT 10'


def weft_request(source: bytes) -> str:
    text = source.decode("utf-8")
    binding = {
        "version": "umf.raw-read-binding/0.1",
        "schema": SCHEMA,
        "modelJson": text,
        "modelSha256": hashlib.sha256(source).hexdigest(),
        "tables": [
            {
                "logical": ["u9demo", "Thing"],
                "native": "things",
                "key": ["id"],
                "columns": [
                    {"logical": "id", "native": "id", "carrier": "string", "nullable": False},
                    {"logical": "note", "native": "note", "carrier": "string", "nullable": True},
                ],
            }
        ],
        "relationships": [],
    }
    return json.dumps(
        {
            "version": "weft.raw-read/0.1",
            "target": "postgresql18",
            "binding": binding,
            "parameters": [],
            "rowCap": 10,
            "sql": QUERY,
        }
    )


def altered_controls(source: bytes) -> dict[str, bytes]:
    parsed = json.loads(source)
    wrong_version = dict(parsed)
    wrong_version["umf"] = "0.7.0"

    unknown_vocabulary = json.loads(source)
    unknown_vocabulary["vocabularies"]["u9.future"] = {"version": "9.0.0"}

    unsupported_scalar = json.loads(source)
    module = unsupported_scalar["modules"][0]
    field = next(element for element in module["elements"] if element["id"] == "Thing.note")
    field["scalarType"] = "float"
    entity = next(element for element in module["elements"] if element["id"] == "Thing")
    entity["extensions"]["umf.ddd"]["fields"]["note"]["type"]["name"] = "float"

    return {
        "wrong-core-version": json.dumps(wrong_version).encode(),
        "unknown-vocabulary": json.dumps(unknown_vocabulary).encode(),
        "unsupported-scalar": json.dumps(unsupported_scalar).encode(),
    }


def run(report_path: Path) -> dict[str, Any]:
    source = SOURCE_PATH.read_bytes()
    source_sha = hashlib.sha256(source).hexdigest()
    document = read_document(source.decode("utf-8"))
    validation = validate_document(document)
    if not validation.valid:
        raise AssertionError(f"UMF core validation failed: {validation.diagnostics!r}")

    compiled = json.loads(weft.compile_raw_read_json(weft_request(source)))
    if compiled.get("status") != "compiled":
        raise AssertionError(f"released Weft refused the exact source: {compiled!r}")
    if compiled["binding"]["modelSha256"] != source_sha:
        raise AssertionError("Weft did not retain the exact source digest")

    controls = altered_controls(source)
    control_results: dict[str, dict[str, str]] = {}
    with LocalTruss() as local:
        admin = local.person("u9_admin")
        local.membership(admin.user, local.registrar_role, grant=True)
        host = Hohfeld.start(
            {local.name: local.backend},
            admin=admin,
            default_placement=Placement(local.name, ()),
        )

        for name, candidate in controls.items():
            try:
                host.session(admin).registry().register(candidate)
            except Invalid:
                hohfeld_result = "refused"
            else:
                raise AssertionError(f"Hohfeld accepted control {name}")
            result = json.loads(weft.compile_raw_read_json(weft_request(candidate)))
            control_results[name] = {
                "hohfeld": hohfeld_result,
                "weft": str(result.get("status")),
            }
        if SOURCE_PATH.read_bytes() != source:
            raise AssertionError("control generation changed the accepted source file")

        registered = host.session(admin).registry().register(source)
        if registered.module != MODULE or not registered.changed:
            raise AssertionError(f"Hohfeld did not register the exact UMF source: {registered!r}")

        local.configure_module(MODULE, DOC_ID)
        reader_role, writer_role = local.module_roles(MODULE)
        auditor_role = local.auditor_role(MODULE)
        # Reuse the released adapter's established connections while adding the source-bound
        # module roles that LocalTruss hands over after registration.
        backend = TrussBackend(
            local.name,
            local.backend.connections,
            module_access={MODULE: ModuleAccess(DOC_ID, reader_role, writer_role, auditor_role)},
        )
        host = Hohfeld.start(
            {local.name: backend},
            admin=admin,
            default_placement=Placement(local.name, ()),
        )
        local.membership(admin.user, reader_role, grant=True)
        local.membership(admin.user, writer_role, grant=True)
        reader = local.person("u9_reader")
        local.membership(reader.user, reader_role, grant=True)

        imported = host.session(admin).import_records(
            MODULE,
            [
                {"type": "Thing", "key": "a", "properties": {"note": "hello"}},
                {"type": "Thing", "key": "b", "properties": {"note": None}},
            ],
            load_id="u9-public-reader-probe",
        )
        if imported.created != 2:
            raise AssertionError(f"Truss import did not create two rows: {imported!r}")
        read = host.session(reader).query(
            MODULE, "SELECT t.id, t.note FROM u9demo.Thing t ORDER BY t.id LIMIT 10"
        )
        rows = [dict(row) for row in read.rows]
        expected_rows = [{"id": "a", "note": "hello"}, {"id": "b", "note": None}]
        if rows != expected_rows:
            raise AssertionError(f"Hohfeld/Truss query differs: {rows!r}")

        # The separately bound Weft query uses the same original document bytes and executes as
        # a reader login against a synthetic native table on this disposable PostgreSQL target.
        with (
            psycopg.connect(
                **local.endpoint.parameters(), user="postgres", password=local.superuser_password
            ) as native_admin,
            native_admin.cursor() as cursor,
        ):
            cursor.execute(f'CREATE SCHEMA "{SCHEMA}"')
            cursor.execute(
                f'CREATE TABLE "{SCHEMA}".things (id text PRIMARY KEY, note text NULL)'
            )
            cursor.execute(
                f'INSERT INTO "{SCHEMA}".things VALUES (%s,%s),(%s,%s)',
                ("a", "hello", "b", None),
            )
            cursor.execute(f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "{reader.user}"')
            cursor.execute(f'GRANT SELECT ON "{SCHEMA}".things TO "{reader.user}"')
        reader_connection = psycopg.connect(
            **local.endpoint.parameters(), user=reader.user, password=reader.token
        )
        try:
            weft_rows = reader_connection.execute(compiled["dbapiSql"]).fetchall()
        finally:
            reader_connection.close()
        normalized_weft_rows = [dict(zip(("id", "note"), row, strict=True)) for row in weft_rows]
        if normalized_weft_rows != expected_rows:
            raise AssertionError(f"native Weft query differs: {normalized_weft_rows!r}")

        server_version = int(local.su.execute("SHOW server_version_num").fetchone()[0])
        if server_version // 10000 != 18:
            raise AssertionError(f"expected PostgreSQL 18, got {server_version}")

    result = {
        "profile": "umf.u9-public-reader-probe/0.1",
        "source": {"id": DOC_ID, "sha256": source_sha, "bytes": len(source)},
        "versions": {
            "umf": "0.10.0",
            "hohfeld": importlib.metadata.version("hohfeld"),
            "weft": weft.__version__,
            "truss": importlib.metadata.version("truss-toolkit"),
            "postgresqlMajor": 18,
        },
        "assertions": [
            "umf-core-valid",
            "released-hohfeld-registers-and-reads-exact-document",
            "released-weft-compiles-and-executes-exact-document-binding",
            "selected-reader-returns-required-key-and-nullable-string",
            "native-weft-reader-returns-matching-two-row-result",
        ],
        "controls": control_results,
        "limits": [
            "one DDD entity with one required string key and one optional string field",
            "no value-object, relationship, action, or wider core support claim",
            "Weft native query uses a synthetic mapped table on the same disposable PostgreSQL target",
        ],
    }
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.report), sort_keys=True))


if __name__ == "__main__":
    main()
