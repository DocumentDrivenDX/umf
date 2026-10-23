#!/usr/bin/env python3
"""Installed-wheel replay for the opt-in R5 Protobuf inspector binding."""

from __future__ import annotations

import hashlib
import json
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/inspector-predecessor.json"
BASELINE = json.loads(PACKET.read_text())

from umf import rust_protobuf_descriptor as codec  # noqa: E402
from umf import rust_protobuf_inspect as inspector  # noqa: E402
from umf import _rust  # noqa: E402
from umf._rust import UmfCoreError  # noqa: E402


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def field(number: int, wire: int, data: bytes) -> bytes:
    def varint(value: int) -> bytes:
        out = bytearray()
        while value > 127:
            out.append((value & 127) | 128)
            value >>= 7
        out.append(value)
        return bytes(out)

    tag = varint(number * 8 + wire)
    if wire == 2:
        return tag + varint(len(data)) + data
    return tag + data


def document(node: dict) -> dict:
    return {"umf": "0.10.0", "id": "inspector-predecessor", "vocabularies": {"umf.protobuf": {"version": "0.1.0"}},
            "modules": [{"id": "schema", "namespace": "", "elements": [{"id": "schema", "extensions": {"umf.protobuf": {"descriptorProfile": "protobuf-es-2.15.0", "descriptorSet": node}}}]}]}


def diagnostics(doc: dict) -> list[dict]:
    result = inspector.inspect(doc)
    return [{key: value for key, value in row.items() if key in ("code", "path", "severity", "message")} for row in result["diagnostics"]]


def walk_unknown(node: dict, path: str, found: list) -> None:
    if node["unknown"]:
        found.append({"path": path, "unknown": node["unknown"]})
    for name, value in node["fields"].items():
        for child in value if isinstance(value, list) else [value]:
            if isinstance(child, dict) and "type" in child:
                walk_unknown(child, f"{path}/fields/{name}", found)


def expected(label: str):
    return next(row["value"] for row in BASELINE["observations"] if row["label"] == label)


def main() -> None:
    if inspector.profile_version() != "umf-r5-protobuf-inspect/0.1.0":
        raise AssertionError("wrong capability profile")
    authored = codec.read_descriptor_set((ROOT / "fixtures/protobuf/authored.pb").read_bytes())
    authored_doc = document(authored)
    cases = 0
    assert diagnostics(authored_doc) == expected("authored-document-diagnostics"); cases += 1
    payload = authored_doc["modules"][0]["elements"][0]["extensions"]["umf.protobuf"]
    found = []
    walk_unknown(payload["descriptorSet"], "/descriptorSet", found)
    assert {"descriptorProfile": payload["descriptorProfile"], "unknown": found,
            "rootFields": list(payload["descriptorSet"]["fields"])} == expected("authored-document-unknown-and-presence"); cases += 1

    empty = codec.read_descriptor_set(b"")
    assert diagnostics(document(empty)) == expected("empty-document-diagnostics"); cases += 1
    explicit = codec.read_descriptor_set(field(1, 2, field(1, 2, b"")))
    absent = codec.read_descriptor_set(field(1, 2, b""))
    assert {"explicit": explicit["fields"]["file"][0]["fields"],
            "absent": absent["fields"]["file"][0]["fields"]} == expected("explicit-empty-vs-absent-presence"); cases += 1
    assert diagnostics(document(codec.read_descriptor_set(field(50000, 0, b"\x96\x01")))) == expected("unknown-root-diagnostic-order"); cases += 1
    nested = field(1, 2, field(1, 2, b"a") + field(50000, 0, b"\x07"))
    assert diagnostics(document(codec.read_descriptor_set(nested))) == expected("unknown-nested-diagnostic-order"); cases += 1
    unknown = codec.read_descriptor_set(field(50000, 2, b"\x00\x01\x02\xff"))
    assert {"tree": unknown["unknown"], "exportHex": codec.write_descriptor_set(unknown).hex()} == expected("unknown-wire-byte-retention"); cases += 1
    empty_name = codec.read_descriptor_set(field(1, 2, field(1, 2, b"")))
    assert {"file": empty_name["fields"]["file"][0]["fields"], "exportHex": codec.write_descriptor_set(empty_name).hex()} == expected("empty-root-field-presence"); cases += 1

    graph = expected("descriptor-graph-types-and-runtime-schema-gaps")
    frozen_sources = BASELINE["sourceClosure"]["sources"]
    def frozen_source(path: str) -> str:
        working = ROOT / path
        if working.is_file() and hashlib.sha256(working.read_bytes()).hexdigest() == frozen_sources[path]:
            raw = working.read_bytes()
        else:
            raw = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT,
                                 check=True, capture_output=True).stdout
        if hashlib.sha256(raw).hexdigest() != frozen_sources[path]:
            raise AssertionError(f"frozen predecessor source hash changed: {path}")
        return raw.decode()
    schema = json.loads(frozen_source("spec/extensions/protobuf/schema.json"))
    core_source = frozen_source("crates/umf-core/src/protobuf_descriptor_schema.rs")
    runtime = re.findall(r'MessageSpec \{ name: "([^"]+)"', core_source)
    schema_types = sorted(key for key in schema["$defs"] if key.startswith("google.protobuf."))
    value = {"runtimeGraphTypeCount": len(runtime), "runtimeGraphTypes": runtime,
             "schemaTypeCount": len(schema_types), "schemaTypes": schema_types,
             "runtimeOnlyTypes": sorted(set(runtime) - set(schema_types)),
             "runtimeOnlyTypeCount": len(set(runtime) - set(schema_types))}
    assert value == graph; cases += 1
    source_surface = expected("source-operation-surface")
    assert source_surface["sourceCompilerAndEmitterRustOperations"] == "unsupported in this shard"; cases += 1

    lone_surrogate = document(empty)
    lone_surrogate["modules"][0]["elements"][0]["extensions"]["umf.protobuf"]["future\ud800"] = True
    utf16_result = inspector.inspect(lone_surrogate)
    diagnostic = next(row for row in utf16_result["diagnostics"] if row["code"] == "PROTOBUF_REPRESENTATION")
    assert diagnostic["path"].encode("utf-16-le", "surrogatepass").endswith(b"\x00\xd8")

    def error(call, code):
        try:
            call()
        except UmfCoreError as caught:
            assert caught.code == code, (caught.code, code)
        else:
            raise AssertionError(f"expected {code}")

    error(lambda: inspector.inspect(lone_surrogate, max_work=0), "RESOURCE_LIMIT")
    error(lambda: inspector.inspect(lone_surrogate, is_cancelled=lambda: True), "CANCELLED")
    error(lambda: inspector.inspect(lone_surrogate, now=lambda: 11, deadline_ms=10), "DEADLINE")
    operation = {"op": "protobuf.descriptor.inspect", "document": lone_surrogate}
    admission_calls = 0
    admission_work = 0
    def count_admission(amount):
        nonlocal admission_calls, admission_work
        admission_calls += 1
        admission_work += amount
    _rust._wire(operation, work=count_admission)
    error(lambda: inspector.inspect(lone_surrogate, max_work=admission_work), "RESOURCE_LIMIT")
    cancellation_polls = 0
    def cancel_inside_rust():
        nonlocal cancellation_polls
        cancellation_polls += 1
        return cancellation_polls > admission_calls
    error(lambda: inspector.inspect(lone_surrogate, is_cancelled=cancel_inside_rust), "CANCELLED")
    clock_polls = 0
    def clock_inside_rust():
        nonlocal clock_polls
        clock_polls += 1
        return 0 if clock_polls <= admission_calls else 11
    error(lambda: inspector.inspect(lone_surrogate, now=clock_inside_rust, deadline_ms=10), "DEADLINE")
    meter_calls = 0
    def failing_meter(amount):
        nonlocal meter_calls
        meter_calls += 1
        if meter_calls > admission_calls:
            raise RuntimeError("meter stopped")
    try:
        inspector.inspect(lone_surrogate, meter=failing_meter)
    except UmfCoreError as caught:
        assert (caught.code, str(caught), caught.path) == ("METER_FAILURE", "meter stopped", "")
    else:
        raise AssertionError("expected METER_FAILURE from a Rust work hook")
    error(lambda: inspector.inspect({"not": "a document"}), "PROTOBUF_DOCUMENT")
    charged = 0
    def meter(amount):
        nonlocal charged
        charged += amount
    inspected = inspector.inspect(lone_surrogate, meter=meter)
    assert charged > 0 and inspected["complete"] is False
    meter_work = charged
    success_wire = json.dumps(_rust._wire(operation), ensure_ascii=True, separators=(",", ":"))
    success_envelope = json.loads(_rust._rust_core.execute_protobuf_inspect_wire(success_wire))
    assert set(success_envelope) == {"profile", "status", "wire"}
    assert success_envelope["profile"] == "umf.core-wire/1" and success_envelope["status"] == "ok"
    assert _rust._from_wire(json.loads(success_envelope["wire"])) == inspector.inspect(lone_surrogate)
    malformed_wire = json.dumps(_rust._wire({"op": "protobuf.descriptor.inspect", "document": {"not": "a document"}}),
                                ensure_ascii=True, separators=(",", ":"))
    error_envelope = json.loads(_rust._rust_core.execute_protobuf_inspect_wire(malformed_wire))
    assert set(error_envelope) == {"profile", "status", "code", "messageUnits", "pathUnits"}
    assert error_envelope["profile"] == "umf.core-wire/1" and error_envelope["status"] == "error"
    assert error_envelope["code"] == "PROTOBUF_DOCUMENT"
    assert _rust._from_units(error_envelope["messageUnits"]) == "Document vocabularies are unavailable"
    assert _rust._from_units(error_envelope["pathUnits"]) == ""
    print(json.dumps({"status": "pass", "profile": inspector.profile_version(), "operation": "protobuf.descriptor.inspect",
                      "runtime": {"python": platform.python_version(), "implementation": platform.python_implementation()},
                      "predecessorObservations": cases, "utf16LoneSurrogatePath": "pass",
                      "controls": ["RESOURCE_LIMIT", "CANCELLED", "DEADLINE", "METER_FAILURE"],
                      "malformedAndUnknown": ["invalid-document", "unknown-root", "unknown-nested", "unknown-byte-retention"],
                      "exactWireEnvelopes": ["success-tagged-value", "error-code-message-units-path-units"],
                      "meteredWorkPerCall": meter_work, "complete": inspected["complete"],
                      "sourceHashes": {"inspectorPredecessor": sha(PACKET)}}))


if __name__ == "__main__":
    main()
