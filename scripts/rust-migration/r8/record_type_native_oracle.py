# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent Avro and Parquet observations for the frozen R8 Record Type inputs."""

import hashlib
import json
import argparse
import warnings
import platform
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from importlib import metadata

import avro
import avro.schema
import fastavro
import pyarrow as pa
import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[3]
AVRO_PIN = ROOT / "docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/typescript-predecessor.json"
PARQUET_PIN = ROOT / "docs/helix/04-build/evidence/rust-migration/r8-parquet-record-type/typescript-predecessor.json"
AVRO_OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/avro-native-oracle.json"
PARQUET_OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r8-parquet-record-type/parquet-native-oracle.json"
AVRO_EXISTING_ORACLE = ROOT / "scripts/core-ideals/avro-record-type-oracle.py"
PARQUET_EXISTING_ORACLE = ROOT / "scripts/parquet-footer-oracle.py"

assert avro.__version__ == "1.12.0", avro.__version__
assert fastavro.__version__ == "1.12.2", fastavro.__version__
assert pa.__version__ == "21.0.0", pa.__version__


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_existing(script, workdir):
    environment = os.environ.copy()
    environment["PYTHONPATH"] = os.pathsep.join(sys.path)
    completed = subprocess.run(
        [sys.executable, str(script)], cwd=workdir, env=environment,
        text=True, capture_output=True, check=True,
    )
    return completed.stdout.strip()


def existing_avro_corpus_oracle():
    with tempfile.TemporaryDirectory(prefix="umf-r8-avro-native-") as directory:
        scratch = Path(directory)
        fixtures = scratch / "fixtures/validation"
        fixtures.mkdir(parents=True)
        corpus = ROOT / "fixtures/validation/avro-record-type-corpus.json"
        (fixtures / corpus.name).write_bytes(corpus.read_bytes())
        stdout = run_existing(AVRO_EXISTING_ORACLE, scratch)
        report = json.loads((fixtures / "avro-record-type-native.json").read_text())
        return {"script": str(AVRO_EXISTING_ORACLE.relative_to(ROOT)), "scriptSha256": sha(AVRO_EXISTING_ORACLE), "inputSha256": sha(corpus), "stdout": stdout, "result": report}


def existing_parquet_footer_oracle(paths):
    cached_thrift = Path.home() / ".cache/uv/archive-v0"
    for dist in cached_thrift.glob("*/thrift-0.22.0.dist-info"):
        sys.path.insert(0, str(dist.parent))
        break
    thrift_version = metadata.version("thrift")
    assert thrift_version == "0.22.0", thrift_version
    with tempfile.TemporaryDirectory(prefix="umf-r8-parquet-footer-") as directory:
        scratch = Path(directory)
        fixture_root = scratch / "fixtures/parquet"
        fixture_root.mkdir(parents=True)
        results = [{"id": path.stem, "path": str(path)} for path in paths]
        (fixture_root / "capture-results.json").write_text(json.dumps({"results": results}))
        stdout = run_existing(PARQUET_EXISTING_ORACLE, scratch)
        output = fixture_root / "footer"
        files = {}
        for path in paths:
            decoded = json.loads((output / f"{path.stem}.expected.json").read_text())
            schema_list = next(field["value"] for field in decoded["value"]["fields"] if field["id"] == 2)
            schema_nodes = []
            for index, item in enumerate(schema_list["items"]):
                values = {field["id"]: field["value"] for field in item["fields"]}
                def scalar(field_id):
                    field = values.get(field_id)
                    return field.get("value") if field else None
                schema_nodes.append({
                    "preorderIndex": index,
                    "name": bytes.fromhex(values[4]["hex"]).decode("utf-8"),
                    "physicalType": scalar(1),
                    "repetitionType": scalar(3),
                    "numChildren": scalar(5),
                    "convertedType": scalar(6),
                    "rawThriftSchemaElement": item,
                })
            files[path.name] = {"schemaNodes": schema_nodes, "footerConsumedBytes": decoded["consumedBytes"], "footerTrailingBytes": decoded["trailingBytes"]}
        return {"script": str(PARQUET_EXISTING_ORACLE.relative_to(ROOT)), "scriptSha256": sha(PARQUET_EXISTING_ORACLE), "thriftVersion": thrift_version, "stdout": stdout, "files": files}


def pointer(value, path):
    node = value
    for segment in path.split("/")[1:]:
        segment = segment.replace("~1", "/").replace("~0", "~")
        node = node[int(segment)] if isinstance(node, list) else node[segment]
    return node


def parsed_at_path(root, path):
    parts = [part.replace("~1", "/").replace("~0", "~") for part in path.split("/")[1:]]
    current = root
    index = 0
    while index < len(parts):
        part = parts[index]
        if part == "fields" and isinstance(current, avro.schema.RecordSchema):
            current = current.fields[int(parts[index + 1])]
            index += 2
        elif part == "type" and isinstance(current, avro.schema.Field):
            current = current.type
            index += 1
        elif part == "type":
            index += 1
        elif part == "items" and isinstance(current, avro.schema.ArraySchema):
            current = current.items
            index += 1
        elif part == "values" and isinstance(current, avro.schema.MapSchema):
            current = current.values
            index += 1
        elif part == "schemas" and isinstance(current, avro.schema.UnionSchema):
            current = current.schemas[int(parts[index + 1])]
            index += 2
        else:
            raise ValueError(f"unsupported Avro native path {path!r} at {part!r}")
    return current.type if isinstance(current, avro.schema.Field) else current


def avro_observations():
    packet = json.loads(AVRO_PIN.read_text())
    native_warnings = []
    unique = {}
    for key, outcome in packet["outcomes"].items():
        if not key.startswith("matrix/") or not key.endswith("/strict"):
            continue
        result = outcome["result"]
        request = result["request"]
        type_mappings = [m for m in result["mappings"] if m.get("kind") == "record-type" and m.get("nativePath")]
        field_mappings = [m for m in result["mappings"] if m.get("kind") == "field" and m.get("nativePath")]
        selected_mapping = type_mappings[-1] if type_mappings else (field_mappings[0] if field_mappings else None)
        if selected_mapping is None:
            continue
        native_path = selected_mapping["nativePath"]
        dependency_id = selected_mapping.get("dependencyId")
        signature = (request["nativeSource"], json.dumps(request["dependencies"], sort_keys=True), dependency_id, native_path)
        unique.setdefault(signature, (key, result, request, selected_mapping, native_path))

    rows = []
    for _, (key, result, request, selected_mapping, native_path) in unique.items():
        root_source = json.loads(request["nativeSource"])
        dependency_id = selected_mapping.get("dependencyId")
        source = root_source
        if dependency_id:
            source = json.loads(next(d["schema"] for d in request["dependencies"] if d["id"] == dependency_id))
        selected = pointer(source, native_path)

        names = avro.schema.Names()
        parsed_dependencies = {}
        with warnings.catch_warnings(record=True) as seen:
            warnings.simplefilter("always")
            for dependency in request["dependencies"]:
                dep_source = json.loads(dependency["schema"])
                parsed_dependencies[dependency["id"]] = avro.schema.make_avsc_object(dep_source, names)
            parsed_root = avro.schema.make_avsc_object(root_source, names)
            native_warnings.extend(str(w.message) for w in seen)
        try:
            parsed_selected = parsed_at_path(parsed_dependencies[dependency_id] if dependency_id else parsed_root, native_path)
            apache_kind = type(parsed_selected).__name__
            apache_fullname = getattr(parsed_selected, "fullname", None)
            apache_members = [field.name for field in parsed_selected.fields] if isinstance(parsed_selected, avro.schema.RecordSchema) else []
            apache_error = None
        except Exception as exc:
            apache_kind, apache_fullname, apache_members = None, None, []
            apache_error = type(exc).__name__

        try:
            fast_named = {}
            for dependency in request["dependencies"]:
                fastavro.parse_schema(json.loads(dependency["schema"]), named_schemas=fast_named)
            fastavro.parse_schema(root_source, named_schemas=fast_named)
            fastavro_error = None
        except Exception as exc:
            fastavro_error = type(exc).__name__

        native_direct = apache_kind in ("RecordSchema", "ErrorSchema")
        predecessor_classified = result["status"] == "classified"
        rows.append({
            "case": key,
            "predecessorStatus": result["status"],
            "nativePath": native_path,
            "dependencyId": dependency_id,
            "orderedPredecessorMappings": [
                {field: mapping.get(field) for field in (("kind", "nativePath", "dependencyId", "nativeFragment", "basis", "outcome") if result["status"] == "blocked" else ("kind", "nativePath", "dependencyId", "basis", "outcome")) if field in mapping}
                for mapping in result["mappings"]
            ],
            "selectedNativeType": type(selected).__name__ if isinstance(selected, dict) else selected,
            "apacheAvro": {"kind": apache_kind, "fullname": apache_fullname, "orderedMembers": apache_members, "error": apache_error},
            "fastavroRootParse": {"accepted": fastavro_error is None, "error": fastavro_error},
            "dependencyFullnames": [getattr(dep, "fullname", None) for dep in parsed_dependencies.values()],
            "rootFullname": getattr(parsed_root, "fullname", None),
            "nativeDirectRecordOrError": native_direct,
            "nativeVsPredecessorStatusMatches": native_direct == predecessor_classified,
        })

    matched = sum((row["predecessorStatus"] == "classified") == row["nativeDirectRecordOrError"] for row in rows)
    return {
        "packetSha256": sha(AVRO_PIN),
        "runnerSha256": sha(Path(__file__)),
        "sourcePins": packet["sourcePins"],
        "runtime": {"Python": platform.python_version(), "implementation": platform.python_implementation(), "Apache Avro": avro.__version__, "fastavro": fastavro.__version__},
        "cases": rows,
        "count": {"uniqueSelectedFields": len(rows), "nativeVsPredecessorStatusMatches": matched},
        "disagreements": [row["case"] for row in rows if not row["nativeVsPredecessorStatusMatches"]],
        "nativeWarnings": sorted(set(native_warnings)),
        "existingNativeCorpusOracle": existing_avro_corpus_oracle(),
        "scope": "Apache Avro parses dependency-ordered schemas and resolves the selected native field type; fastavro independently parses each root. Direct Record/Error fields and resolved qualified named Record references are distinguished from primitive, union and container wrappers. The frozen TypeScript packet supplies case selection and status labels; native type, fullname and member-order facts come from the parsers. Matching does not establish UMF target or receipt parity, Rust correctness, raw JavaScript host ordering, or value-domain equivalence.",
    }


def parquet_observations():
    packet = json.loads(PARQUET_PIN.read_text())
    predecessor_cases = {}
    for key, wrapped in packet["outcomes"].items():
        result = wrapped.get("result", wrapped)
        request = result.get("request", {})
        if "index" not in request or result.get("status") not in ("classified", "blocked"):
            continue
        parts = key.split("/")
        fixture_id = parts[1]
        predecessor_cases.setdefault(fixture_id, []).append({
            "key": key,
            "selectedSchemaIndex": request["index"],
            "predecessorStatus": result["status"],
            "orderedPredecessorMappings": [
                {field: mapping.get(field) for field in (("kind", "nativePath", "nativeFragment", "basis", "outcome") if result["status"] == "blocked" else ("kind", "nativePath", "basis", "outcome")) if field in mapping}
                for mapping in result["mappings"]
            ],
        })
    results = []
    input_paths = []
    for name, expected_hash in packet["sourceAndFixturePins"].items():
        if not name.startswith("fixtures/parquet/containers/"):
            continue
        path = ROOT / name
        input_paths.append(path)
        actual_hash = sha(path)
        assert actual_hash == expected_hash, (name, expected_hash, actual_hash)
        parquet = pq.ParquetFile(path)
        schema = parquet.schema_arrow
        root_field = schema.field(0)
        root_type = root_field.type
        is_list = pa.types.is_list(root_type) or pa.types.is_large_list(root_type) or pa.types.is_fixed_size_list(root_type)
        element_type = root_type.value_type if is_list else None
        is_struct_member = is_list and pa.types.is_struct(element_type)
        fixture_id = name.rsplit("/", 1)[-1].removesuffix(".parquet")
        # These pinned files have one top-level field. Parquet's schema list is
        # preorder: root=0, top-level field=1, and its LIST element=2.
        element_schema_index = 2 if is_list else None
        cases = []
        for case in predecessor_cases.get(fixture_id, []):
            native_selected_struct = is_list and case["selectedSchemaIndex"] == element_schema_index and pa.types.is_struct(element_type)
            predecessor_classified = case["predecessorStatus"] == "classified"
            cases.append({
                **case,
                "nativeSelectedListElementIsStruct": native_selected_struct,
                "nativeVsPredecessorStatusMatches": native_selected_struct == predecessor_classified,
            })
        results.append({
            "path": name,
            "sha256": actual_hash,
            "rows": parquet.metadata.num_rows,
            "parquetPhysicalSchema": str(parquet.schema).split("\n", 1)[1],
            "rootName": root_field.name,
            "rootArrowType": str(root_type),
            "listElementType": str(element_type) if is_list else None,
            "nativeListStructMember": is_struct_member,
            "listElementSchemaIndex": element_schema_index,
            "selectedNativeSchemaIndexNode": None,
            "predecessorCases": cases,
            "nativeVsPredecessorStatusMatches": all(case["nativeVsPredecessorStatusMatches"] for case in cases),
        })
    existing_footer = existing_parquet_footer_oracle(input_paths)
    nodes_by_file = {filename: report["schemaNodes"] for filename, report in existing_footer["files"].items()}
    for row in results:
        row["nativeThriftSchemaElements"] = nodes_by_file[Path(row["path"]).name]
        for case in row["predecessorCases"]:
            for mapping in case["orderedPredecessorMappings"]:
                path = mapping.get("nativePath", "")
                tail = path.removeprefix("/schema/")
                try:
                    schema_index = int(tail) if path.startswith("/schema/") and "/" not in tail else None
                except ValueError:
                    schema_index = None
                mapping["nativeSchemaIndex"] = schema_index
        selected_index = row["listElementSchemaIndex"]
    return {
        "packetSha256": sha(PARQUET_PIN),
        "runnerSha256": sha(Path(__file__)),
        "sourcePins": {name: value for name, value in packet["sourceAndFixturePins"].items() if name.startswith("fixtures/parquet/containers/")},
        "runtime": {"Python": platform.python_version(), "implementation": platform.python_implementation(), "PyArrow": pa.__version__},
        "files": results,
        "existingApacheThriftFooterOracle": {
            key: value for key, value in existing_footer.items() if key != "files"
        },
        "count": {
            "files": len(results),
            "nativeListStructMembers": sum(row["nativeListStructMember"] for row in results),
            "nativeVsPredecessorStatusMatches": sum(sum(case["nativeVsPredecessorStatusMatches"] for case in row["predecessorCases"]) for row in results),
            "comparedPredecessorCases": sum(len(row["predecessorCases"]) for row in results),
            "mismatches": [case["key"] for row in results for case in row["predecessorCases"] if not case["nativeVsPredecessorStatusMatches"]],
        },
        "scope": "PyArrow independently reads each pinned PAR1 file and exposes its physical and Arrow schemas; the existing Apache Thrift Compact Protocol oracle independently decodes the full ordered SchemaElement list, retaining raw field IDs and values. The frozen TypeScript packet supplies selected schema indexes, mapping order and status labels; native type facts come from PyArrow and footer facts from Thrift. This pinned one-root-field subset admits only a LIST struct element; primitive LIST elements and MAP are unsupported. The generic Thrift decoder is not full Parquet IDL validation. Matching does not establish UMF target or receipt parity, Rust correctness, or support for other layouts.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, help="override the evidence output directory")
    parser.add_argument("--check", action="store_true", help="compare fresh observations byte-for-byte with saved evidence")
    args = parser.parse_args()
    avro_out = args.out_dir / AVRO_OUT.name if args.out_dir else AVRO_OUT
    parquet_out = args.out_dir / PARQUET_OUT.name if args.out_dir else PARQUET_OUT
    avro_out.parent.mkdir(parents=True, exist_ok=True)
    parquet_out.parent.mkdir(parents=True, exist_ok=True)
    outputs = {
        avro_out: json.dumps(avro_observations(), indent=2) + "\n",
        parquet_out: json.dumps(parquet_observations(), indent=2) + "\n",
    }
    for path, rendered in outputs.items():
        if args.check:
            if not path.exists() or path.read_text() != rendered:
                raise SystemExit(f"native oracle evidence drift: {path}")
        else:
            path.write_text(rendered)
    print(json.dumps({str(path): hashlib.sha256(rendered.encode()).hexdigest() for path, rendered in outputs.items()}, sort_keys=True))
