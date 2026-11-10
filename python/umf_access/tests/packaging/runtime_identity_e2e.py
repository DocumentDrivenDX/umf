# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Access identity admission using generated commerce and real Weft.

The catalog is inert: this qualifies generated model/catalog identity only, not
target dispatch, SQL execution, a native database, or a Truss distribution.
"""

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import sys
import zipfile
from pathlib import Path

from replay_installed import check_generated_inventory

import weft
import umf_access
from umf_access.reviewed import CatalogRead, ReadBuildError, ReviewedSQL
from umf_access.types import RUNTIME_IDENTITY, StrictModel


def _snake(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()


def _carrier(scalar: str) -> str:
    carriers = {
        "string": "string",
        "integer": "integer",
        "decimal": "decimal",
        "boolean": "boolean",
    }
    try:
        return carriers[scalar]
    except KeyError:
        raise AssertionError("selected read contains an unsupported scalar") from None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--access-wheel", type=Path, required=True)
    parser.add_argument("--weft-wheel", type=Path, required=True)
    parser.add_argument("--fixture-request", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--generated", type=Path, required=True)
    parser.add_argument("--trusted-profile-module", type=Path, required=True)
    parser.add_argument("--runtime-version", required=True)
    parser.add_argument("--pydantic-version", required=True)
    args = parser.parse_args()
    profile_bytes = args.profile.read_bytes()
    profile = json.loads(profile_bytes)
    if hashlib.sha256(profile_bytes).hexdigest() != (
            "c6800c9385468dafddf7a522d050384256509b4fc84beb5bf3fdf6770875d2d6"):
        raise AssertionError("selected Linux311 profile bytes differ from the reviewed source")
    expected_dependencies = {
        "pydantic": "2.13.5",
        "pydantic-core": "2.46.5",
        "annotated-types": "0.8.0",
        "typing-extensions": "4.16.0",
        "typing-inspection": "0.4.4",
    }
    if (profile.get("id") != "umf-access-local-linux311-identity-qualification"
            or profile.get("python") != "3.11.17"
            or profile.get("runtimeAbi") != {
                "distribution": "umf_access",
                "version": "0.1.0.dev10",
                "abi": "umf-access-runtime/0.1",
            }
            or profile.get("runtimeDependencies") != expected_dependencies
            or args.runtime_version != "0.1.0.dev10"
            or args.pydantic_version != expected_dependencies["pydantic"]
            or RUNTIME_IDENTITY != ("umf_access", "0.1.0.dev10", "umf-access-runtime/0.1")):
        raise AssertionError("explicit selected Linux runtime profile differs")
    if (sys.implementation.name != "cpython" or sys.version_info[:3] != (3, 11, 17)
            or platform.system() != "Linux" or platform.machine().lower() not in ("x86_64", "amd64")):
        raise AssertionError("selected Linux CPython 3.11.17 runtime differs")
    for distribution, version in profile.get("runtimeDependencies", {}).items():
        if importlib.metadata.version(distribution) != version:
            raise AssertionError("selected runtime dependency pin differs: " + distribution)
    if importlib.metadata.version("weft-sql") != "0.4.51":
        raise AssertionError("selected Weft compiler distribution differs")
    if importlib.metadata.version("umf_access") != args.runtime_version:
        raise AssertionError("selected Access distribution version differs")

    if args.trusted_profile_module.is_symlink() or not args.trusted_profile_module.is_file():
        raise AssertionError("trusted profile module must be an exact regular source file")
    trusted_profile_sha256 = hashlib.sha256(args.trusted_profile_module.read_bytes()).hexdigest()
    if trusted_profile_sha256 != (
            "9e9e5718f54dfbc06593a59336941f4152726b266e146cdbdeb183ad8cc455ce"):
        raise AssertionError("trusted Access profile module differs from reviewed source")

    generated_root = args.generated.resolve(strict=True)
    if args.generated.is_symlink() or not generated_root.is_dir():
        raise AssertionError("generated output root must be a regular directory")
    fixture = json.loads(args.fixture_request.read_bytes())
    generation_profile = json.loads((generated_root / "profile.json").read_bytes())
    generation_result = json.loads((generated_root / "result.json").read_bytes())
    generated_manifest_path = generated_root / "runtime_fix/_umf/manifest.json"
    generated_manifest = json.loads(generated_manifest_path.read_bytes())
    if (json.loads((generated_root / "request.json").read_bytes()) != fixture
            or json.loads((generated_root / "profile.json").read_bytes())
                != generated_manifest.get("profile")):
        raise AssertionError("retained generator request/profile differ from the reviewed inputs")
    expected_generator_profile = {
        "id": profile["id"],
        "version": profile["version"],
        "coreVersions": ["0.10.0"],
        "vocabularies": [
            {"id": "umf.access", "version": "0.1.0"},
            {"id": "umf.binding", "version": "0.2.0"},
        ],
        "python": {"version": "3.11.17"},
        "dependencies": [
            {"distribution": "umf_access", "version": "0.1.0.dev10"},
            {"distribution": "pydantic", "version": "2.13.5"},
            {"distribution": "pydantic-core", "version": "2.46.5"},
            {"distribution": "annotated-types", "version": "0.8.0"},
            {"distribution": "typing-extensions", "version": "4.16.0"},
            {"distribution": "typing-inspection", "version": "0.4.4"},
        ],
        "checkers": [
            {"name": "mypy", "version": "2.4.0", "configuration": {
                "check_untyped_defs": True, "python_version": "3.11"}},
            {"name": "pyright", "version": "1.1.414", "configuration": {
                "typeCheckingMode": "strict", "pythonVersion": "3.11",
                "environment": "selected Linux311 profile; checker execution excluded"}},
            {"name": "ty", "version": "0.0.88", "configuration": {
                "pythonVersion": "3.11",
                "environment": "selected Linux311 profile; checker execution excluded"}},
        ],
        "reservedNames": [],
        "importedNames": ["decimal", "pydantic", "umf_access"],
        "assertionKinds": ["kind", "nullability", "Key", "facets", "umf.access"],
        "subset": (
            "Selected Linux311 generated commerce OrderIdentity source, actual Weft compiler, "
            "and inert Access catalog identity/load only; checker pins are metadata and no checker result is claimed"
        ),
        "codeSha256": trusted_profile_sha256,
    }
    if (set(generation_profile) != {
                "id", "version", "compilerVersion", "coreVersions", "vocabularies",
                "python", "dependencies", "checkers", "reservedNames", "importedNames",
                "assertionKinds", "subset", "codeSha256",
            }
            or generation_result.get("contract") != "umf-access-generate/0.1"
            or generation_result.get("abi") != "umf-python-types/0.1"
            or generation_result.get("outcome") != "candidate"
            or generation_result.get("runtimeAbi") != {
                "distribution": "umf_access",
                "version": "0.1.0.dev10",
                "abi": "umf-access-runtime/0.1",
            }
            or generation_profile.get("codeSha256") != trusted_profile_sha256
            or generation_profile.get("python") != expected_generator_profile["python"]
            or generation_profile.get("coreVersions") != expected_generator_profile["coreVersions"]
            or generation_profile.get("vocabularies") != expected_generator_profile["vocabularies"]
            or generation_profile.get("dependencies") != expected_generator_profile["dependencies"]
            or generation_profile.get("checkers") != expected_generator_profile["checkers"]
            or generation_profile.get("reservedNames") != expected_generator_profile["reservedNames"]
            or generation_profile.get("importedNames") != expected_generator_profile["importedNames"]
            or generation_profile.get("assertionKinds") != expected_generator_profile["assertionKinds"]
            or generation_profile.get("subset") != expected_generator_profile["subset"]
            or generation_profile.get("codeSha256") != expected_generator_profile["codeSha256"]
            or type(generation_profile.get("compilerVersion")) is not str
            or not re.fullmatch(r"local-access-generator-[0-9a-f]{64}", generation_profile["compilerVersion"])
            or generation_profile.get("subset") != (
                "Selected Linux311 generated commerce OrderIdentity source, actual Weft compiler, "
                "and inert Access catalog identity/load only; checker pins are metadata and no checker result is claimed"
            )
            or generated_manifest.get("profile") != generation_profile
            or generated_manifest.get("runtimeAbi") != generation_result.get("runtimeAbi")):
        raise AssertionError("generated candidate profile/runtime identity differs from trusted source profile")
    request_value = fixture
    canonical_input = json.dumps(
        {"request": request_value, "profile": generation_profile},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    ).encode()
    expected_input_digest = hashlib.sha256(canonical_input).hexdigest()
    if (generation_result.get("inputDigest") != expected_input_digest
            or generated_manifest.get("inputDigest") != expected_input_digest
            or not re.fullmatch(r"[0-9a-f]{64}", expected_input_digest)):
        raise AssertionError("generator result/manifest does not bind the exact request and trusted profile")

    result_files = generation_result.get("files")
    if type(result_files) is not list or not result_files:
        raise AssertionError("complete generated candidate file inventory is required")
    result_file_map = {}
    for row in result_files:
        if (type(row) is not dict or set(row) != {"path", "text", "sha256"}
                or type(row["path"]) is not str or type(row["text"]) is not str
                or not re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
                or row["path"] in result_file_map
                or hashlib.sha256(row["text"].encode()).hexdigest() != row["sha256"]):
            raise AssertionError("generated candidate file row is malformed or changed")
        result_file_map[row["path"]] = row
    manifest_relative = "runtime_fix/_umf/manifest.json"
    manifest_file = result_file_map.get(manifest_relative)
    if (manifest_file is None or manifest_file["text"].encode() != generated_manifest_path.read_bytes()
            or hashlib.sha256(manifest_file["text"].encode()).hexdigest() != manifest_file["sha256"]):
        raise AssertionError("generated manifest bytes differ from the candidate result")
    allowed_files = set(result_file_map) | {
        "request.json", "profile.json", "result.json", "binding.json",
    }
    actual_files = {
        path.relative_to(generated_root).as_posix()
        for path in generated_root.rglob("*") if path.is_file()
    }
    actual_symlinks = [path for path in generated_root.rglob("*") if path.is_symlink()]
    if actual_files != allowed_files or actual_symlinks:
        raise AssertionError("generated candidate directory contains omitted, extra, or aliased files")
    generated_inventory = generated_manifest.get("inventory")
    expected_inventory = [
        {"path": row["path"], "sha256": row["sha256"]}
        for path, row in sorted(result_file_map.items()) if path != manifest_relative
    ]
    if generated_inventory != expected_inventory:
        raise AssertionError("manifest inventory differs from every generated candidate file")
    check_generated_inventory(generated_root, generated_manifest)

    with zipfile.ZipFile(args.access_wheel) as wheel:
        package_root = Path(umf_access.__file__).resolve().parent.parent
        payloads = [name for name in wheel.namelist()
                    if name.startswith("umf_access/") and not name.endswith("/")]
        if not payloads or any((package_root / name).read_bytes() != wheel.read(name)
                               for name in payloads):
            raise AssertionError("imported Access package differs from selected wheel")

    with zipfile.ZipFile(args.weft_wheel) as wheel:
        native_names = [name for name in wheel.namelist() if name.endswith((".so", ".pyd"))]
        if len(native_names) != 1:
            raise AssertionError("one native Weft compiler module is required")
        package_root = Path(weft.__file__).resolve().parent.parent
        payloads = [name for name in wheel.namelist()
                    if name.startswith("weft/") and not name.endswith("/")]
        native_member = native_names[0]
        native_origin = Path(weft.weft.__file__).resolve()
        if (not payloads or "weft/__init__.py" not in payloads
                or Path(weft.__file__).resolve() != package_root / "weft/__init__.py"
                or native_member not in payloads
                or native_origin != package_root.joinpath(*native_member.split("/"))
                or any((package_root / name).read_bytes() != wheel.read(name)
                       for name in payloads)):
            raise AssertionError("installed Weft compiler differs from the selected wheel payload")

    if (fixture.get("profileId") != profile.get("id")
            or fixture.get("profileVersion") != profile.get("version")
            or fixture.get("package") != "runtime_fix"):
        raise AssertionError("generated commerce fixture is not bound to selected profile")
    sources = fixture.get("sources")
    if (type(sources) is not list or len(sources) != 2
            or any(type(source) is not dict for source in sources)
            or {source.get("id") for source in sources} != {"logical", "orders-binding"}
            or any(type(source.get("text")) is not str for source in sources)
            or fixture.get("bindings") != ["orders-binding"]
            or fixture.get("records") != [{"module": "commerce", "element": "Order"}]
            or fixture.get("actions") != []):
        raise AssertionError("exact generated commerce and original physical binding sources are required")
    source_by_id = {source["id"]: source["text"] for source in sources}
    model_json = source_by_id["logical"]
    physical_json = source_by_id["orders-binding"]
    document = json.loads(model_json)
    modules = document.get("modules")
    if type(modules) is not list or len(modules) != 1 or modules[0].get("id") != "commerce":
        raise AssertionError("selected generated commerce document differs")
    elements = modules[0].get("elements")
    if type(elements) is not list:
        raise AssertionError("generated commerce element inventory required")
    records = [element for element in elements if element.get("kind") == "record" and element.get("id") == "Order"]
    if len(records) != 1:
        raise AssertionError("unique generated Order record required")

    source_sha256 = hashlib.sha256(model_json.encode()).hexdigest()
    if (generated_manifest.get("inputDigest") != generation_result.get("inputDigest")
            or generated_manifest.get("contract") != generation_result.get("contract")
            or generated_manifest.get("abi") != generation_result.get("abi")
            or generated_manifest.get("runtimeAbi") != {
                "distribution": "umf_access", "version": "0.1.0.dev10",
                "abi": "umf-access-runtime/0.1",
            }
            or generation_profile.get("id") != profile.get("id")
            or generation_profile.get("version") != profile.get("version")
            or generation_profile.get("dependencies") != [
                {"distribution": "umf_access", "version": "0.1.0.dev10"},
                {"distribution": "pydantic", "version": "2.13.5"},
                {"distribution": "pydantic-core", "version": "2.46.5"},
                {"distribution": "annotated-types", "version": "0.8.0"},
                {"distribution": "typing-extensions", "version": "4.16.0"},
                {"distribution": "typing-inspection", "version": "0.4.4"},
            ]):
        raise AssertionError("candidate manifest does not bind the selected runtime profile")

    binding = json.loads((generated_root / "binding.json").read_bytes())
    physical = json.loads(physical_json)
    logical_module = modules[0]
    logical_column_sets = logical_module.get("extensions", {}).get("umf.access", {}).get("columns")
    physical_extension = physical.get("extensions", {}).get("umf.binding")
    if (binding.get("version") != "umf.raw-read-binding/0.1"
            or binding.get("modelJson") != model_json
            or binding.get("modelSha256") != source_sha256
            or type(logical_column_sets) is not list or len(logical_column_sets) != 1
            or logical_column_sets[0].get("target") != {
                "platform": "postgresql", "majorVersion": "18"}
            or type(physical_extension) is not dict
            or physical_extension.get("logical") != {
                "documentId": document.get("id"), "coreVersion": document.get("umf")}
            or physical_extension.get("target") != {
                "system": "postgresql", "version": "18",
                "subset": "access ColumnSet declaration fixture"}):
        raise AssertionError("source-exact raw-read binding differs from original commerce source")
    original_set = logical_column_sets[0]
    original_binding = original_set.get("binding")
    physical_fields = physical_extension.get("fields")
    physical_elements = physical_extension.get("elements")
    authored_columns = original_set.get("columns")
    commerce_physical_fields = [
        item for item in physical_fields
        if type(item) is dict and item.get("module") == "commerce"
    ] if type(physical_fields) is list else []
    original_order_fields = {
        item["id"]: item for item in elements
        if item.get("kind") == "field" and item.get("id")
    }
    physical_order_fields = {
        item["element"]: item for item in commerce_physical_fields
    }
    physical_order_tables = [
        entry for entry in physical_elements
        if type(entry) is dict and entry.get("module") == "commerce" and entry.get("element") == "Order"
    ] if type(physical_elements) is list else []
    if (type(original_binding) is not dict or original_binding.get("sourceId") != "orders-binding"
            or type(physical_fields) is not list or type(physical_elements) is not list
            or type(authored_columns) is not list or len(authored_columns) != 5
            or len(commerce_physical_fields) != 5 or len(physical_order_fields) != 5
            or {entry.get("element") for entry in commerce_physical_fields}
                != {entry.get("field", {}).get("element") for entry in authored_columns}
            or len(physical_order_tables) != 1
            or physical_order_tables[0].get("table") != "orders"):
        raise AssertionError("original logical column set lacks its complete physical field/table binding")
    for authored in authored_columns:
        ref = authored.get("field")
        if type(ref) is not dict or ref.get("module") != "commerce":
            raise AssertionError("original ColumnSet has an unresolved logical field")
        logical_name = ref.get("element")
        logical_field = original_order_fields.get(logical_name)
        physical_field = physical_order_fields.get(logical_name)
        if (logical_field is None or physical_field is None
                or physical_field.get("storage") != "column"
                or physical_field.get("column") != logical_name
                or authored.get("notNull") != (logical_field.get("nullability") == "required")):
            raise AssertionError("original logical/native field or nullability correspondence differs")
    authored_by_name = {row["field"]["element"]: row for row in authored_columns}
    if (len(authored_by_name) != 5
            or authored_by_name.get("orderId", {}).get("type") != "text"
            or authored_by_name.get("amount", {}).get("type") != "numeric(12,2)"
            or authored_by_name.get("memo", {}).get("type") != "text"
            or authored_by_name.get("placedAt", {}).get("type") != "timestamptz"
            or authored_by_name.get("revision", {}).get("type") != "bigint"
            or authored_by_name.get("revision", {}).get("generation") != "identity"
            or any(authored_by_name[name].get("generation") is not None
                   for name in ("orderId", "amount", "memo", "placedAt"))):
        raise AssertionError("complete original PostgreSQL18 native type declarations differ")
    native_columns = binding.get("nativeColumns")
    sets = native_columns.get("sets") if type(native_columns) is dict else None
    sha_physical = hashlib.sha256(physical_json.encode()).hexdigest()
    if (type(native_columns) is not dict
            or native_columns.get("target") != original_set.get("target")
            or type(sets) is not list or len(sets) != 1 or type(sets[0]) is not dict
            or sets[0].get("columnSet") != {
                "documentId": document.get("id"), "coreVersion": document.get("umf"),
                "documentSha256": source_sha256, "module": "commerce",
                "pointer": "/modules/0/extensions/umf.access/columns/0",
            }
            or sets[0].get("binding") != {
                "sourceId": "orders-binding", "documentJson": physical_json,
                "documentSha256": sha_physical,
            }):
        raise AssertionError("source-exact column-set and physical source custody differs")
    raw_tables = binding.get("tables")
    order_table = raw_tables[0] if type(raw_tables) is list and len(raw_tables) == 1 else None
    primary_keys = [key for key in records[0].get("keys", []) if key.get("primary") is True]
    original_members = records[0].get("members", [])
    original_order_members = {
        member.get("element") for member in original_members
        if type(member) is dict and member.get("module") == "commerce"
    }
    if (order_table is None or order_table.get("logical") != ["commerce", "Order"]
            or order_table.get("native") != "orders"
            or order_table.get("key") != ["orderId"]
            or len(primary_keys) != 1
            or primary_keys[0].get("fields") != [{"module": "commerce", "element": "orderId"}]
            or type(original_members) is not list or len(original_members) != 5
            or original_order_members != set(authored_by_name)
            or order_table.get("columns") != [
                {"logical": "orderId", "native": "orderId", "carrier": "string", "nullable": False},
                {"logical": "amount", "native": "amount", "carrier": "decimal", "nullable": False},
            ]):
        raise AssertionError("selected projection does not retain exact authored Key/carrier/native mappings")

    sys.path.insert(0, str(generated_root))
    import runtime_fix.models as generated_models
    OrderIdentity = generated_models.OrderIdentity
    model_origin = Path(generated_models.__file__).resolve()
    if (model_origin != generated_root / "runtime_fix/models.py"
            or not model_origin.is_relative_to(generated_root)
            or "runtime_fix/models.py" not in result_file_map):
        raise AssertionError("generated model was loaded outside its declared candidate inventory")

    source = OrderIdentity.UMF_SOURCE
    if (source.document_id != document.get("id")
            or source.document_sha256 != source_sha256
            or source.core_version != document.get("umf")
            or source.runtime_abi != RUNTIME_IDENTITY[2]
            or OrderIdentity.UMF_RUNTIME_ABI != RUNTIME_IDENTITY
            or OrderIdentity.UMF_BUNDLE_INPUT_DIGEST != source.input_digest
            or OrderIdentity.UMF_BUNDLE_INPUT_DIGEST != expected_input_digest
            or source.input_digest != generated_manifest.get("inputDigest")):
        raise AssertionError("installed generated model differs from exact source/runtime")

    fields_by_id = {element["id"]: element for element in elements if element.get("kind") == "field"}
    declared_projection = fixture.get("projections")
    if declared_projection != [{
            "name": "orderIdentity",
            "record": {"module": "commerce", "element": "Order"},
            "fields": [{"module": "commerce", "element": "orderId"},
                       {"module": "commerce", "element": "amount"}],
    }]:
        raise AssertionError("closed generated identity projection is required")
    selected_fields = []
    for member in declared_projection[0]["fields"]:
        if member.get("module") != "commerce" or member.get("element") not in fields_by_id:
            raise AssertionError("generated Order member source is unresolved")
        field = fields_by_id[member["element"]]
        python_name = _snake(field.get("name", field["id"]))
        if python_name not in OrderIdentity.model_fields:
            raise AssertionError("generated Order field is absent from installed model")
        selected_fields.append((field, python_name, _carrier(field.get("scalarType", ""))))
    if {python_name for _, python_name, _ in selected_fields} != set(OrderIdentity.model_fields):
        raise AssertionError("generated read field set differs from selected projection")

    outputs = ", ".join(
        f'"r"."{field["id"]}" AS "{python_name}"'
        for field, python_name, _ in selected_fields
    )
    sql = f'SELECT {outputs} FROM "commerce"."Order" AS "r" LIMIT 10'

    class Empty(StrictModel):
        pass

    entry = ReviewedSQL(sql, Empty, OrderIdentity, row_cap=10).build(
        weft, target="postgresql18", binding=binding,
    )
    artifact = entry.artifact()
    if artifact.get("stageOne") != {
            "inputDigest": OrderIdentity.UMF_BUNDLE_INPUT_DIGEST,
            "runtimeAbi": list(RUNTIME_IDENTITY),
    } or artifact.get("generatedSource", {}).get("document_sha256") != source_sha256:
        raise AssertionError("compiled catalog lost generated stage-one source identity")

    restored = CatalogRead(
        entry.artifact_json,
        Empty,
        OrderIdentity,
        expected_source=entry.expected_source,
        context_json=entry.context_json,
    )
    if restored.artifact() != artifact:
        raise AssertionError("serialized catalog did not reload with exact model/source")

    original_runtime_abi = OrderIdentity.UMF_RUNTIME_ABI
    type.__setattr__(
        OrderIdentity,
        "UMF_RUNTIME_ABI",
        ("umf_access", "0.1.0.dev0", RUNTIME_IDENTITY[2]),
    )
    try:
        CatalogRead(
            entry.artifact_json,
            Empty,
            OrderIdentity,
            expected_source=entry.expected_source,
            context_json=entry.context_json,
        ).artifact()
    except ReadBuildError as error:
        if "CATALOG_STALE" not in str(error):
            raise
    else:
        raise AssertionError("stale generated identity was admitted")
    finally:
        type.__setattr__(OrderIdentity, "UMF_RUNTIME_ABI", original_runtime_abi)

    print(json.dumps({
        "status": "pass",
        "scope": "installed generated commerce and inert catalog identity admission/load only",
        "runtimeIdentity": list(RUNTIME_IDENTITY),
        "inputDigest": OrderIdentity.UMF_BUNDLE_INPUT_DIGEST,
        "weftDistribution": "weft-sql==0.4.51",
        "positiveCatalog": "compiled and reloaded",
        "staleCatalog": "CATALOG_STALE before target dispatch",
        "targetDispatch": False,
        "nativeDatabase": False,
        "trussDistributionAcceptance": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
