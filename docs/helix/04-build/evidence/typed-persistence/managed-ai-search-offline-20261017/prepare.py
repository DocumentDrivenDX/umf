import argparse
import hashlib
import json
import uuid
from pathlib import Path

BASE = Path(__file__).resolve().parent / "original-inputs"
SCHEMA = "umf_sdk_atomic_cf40c0c7aa74"
TABLE = "search_qualification_20261017_docs"
INDEX = "client_dev." + SCHEMA + ".search_qualification_20261017_index"
ENDPOINT = "umf-typed-sdk-search-qualification-20261017"


def h(b):
    return hashlib.sha256(b).hexdigest()


def prepare(out, table_uuid, platform_version):
    uuid.UUID(table_uuid)
    out.mkdir(exist_ok=False)
    model = json.loads((BASE / "model.json").read_text())
    binding = json.loads((BASE / "binding.json").read_text())
    config = json.loads((BASE / "config.json").read_text())
    access = model["modules"][0]["extensions"]["umf.access"]
    for b in access["searchBindings"]:
        b["native"] = INDEX
    binding["extensions"]["umf.binding"]["elements"][0]["table"] = TABLE
    model_raw = json.dumps(model, separators=(",", ":"))
    binding_raw = json.dumps(binding, separators=(",", ":"))
    (out / "model.json").write_text(model_raw)
    (out / "binding.json").write_text(binding_raw)
    target = config["targets"][0]
    target["platform"] = [{"name": "databricks-sql", "versions": [platform_version]}]
    target["binding"]["modelJson"] = model_raw
    target["binding"]["modelSha256"] = h(model_raw.encode())
    target["binding"]["schema"] = SCHEMA
    target["binding"]["tables"][0]["native"] = TABLE
    managed = target["unitySearch"]
    managed.update(
        catalog="client_dev",
        schema=SCHEMA,
        tableId=table_uuid,
        indexName=INDEX,
        endpointName=ENDPOINT,
    )
    managed["nativeColumns"]["columnSet"]["documentSha256"] = h(model_raw.encode())
    managed["nativeColumns"]["binding"].update(
        documentJson=binding_raw, documentSha256=h(binding_raw.encode())
    )
    config["umf"]["documents"] = [
        {"path": n, "sha256": h((out / n).read_bytes())}
        for n in ("model.json", "binding.json")
    ]
    (out / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    (out / "search_declarations.py").write_text(
        """from umf_access import query, Param, Vector\nfrom umf_access.dsl import hybrid, target_defined\nfrom search_docs.models import Doc\n@query\ndef ann(q: Param[Vector]):\n    return Doc.objects.search(Doc.s.semantic.near_vector(q),allow_partial=True).select(Doc.c.id,Doc.c.body).top(4)\n@query\ndef filtered(q: Param[Vector], body: Param[str]):\n    return Doc.objects.filter(Doc.c.body==body).search(Doc.s.semantic.near_vector(q),allow_partial=True).select(Doc.c.id,Doc.c.body).top(4)\n@query\ndef combined(q: Param[str]):\n    return Doc.objects.search(hybrid(Doc.s.text.matches(q),Doc.s.semantic.near(q),fusion=target_defined()),allow_partial=True).select(Doc.c.id,Doc.c.body).top(4)\n"""
    )
    (out / "input-provenance.json").write_text(
        json.dumps(
            {
                "scope": "OFFLINE_SOURCE_FIXTURE_ONLY"
                if table_uuid == "00000000-0000-0000-0000-000000000001"
                else "NATIVE_UUID_REQUEST_INPUT_NOT_QUALIFIED",
                "tableUuid": table_uuid,
                "inputOriginals": {
                    str(BASE / n): h((BASE / n).read_bytes())
                    for n in ("model.json", "binding.json", "config.json")
                },
                "outputSources": {
                    n: h((out / n).read_bytes())
                    for n in (
                        "model.json",
                        "binding.json",
                        "config.json",
                        "search_declarations.py",
                    )
                },
                "compilerResponsesModified": False,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("out", type=Path)
    p.add_argument("--table-uuid", required=True)
    p.add_argument("--platform-version", required=True)
    a = p.parse_args()
    prepare(a.out, a.table_uuid, a.platform_version)
