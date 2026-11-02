"""Replay the existing Python tagged-wire Parquet entry point against a built extension."""
import importlib.util
import json
import os
import struct


def wire(value):
    if value is None:
        return {"kind": "null"}
    if isinstance(value, bool):
        return {"kind": "boolean", "value": value}
    if isinstance(value, (int, float)):
        return {"kind": "number", "bits": struct.pack(">d", float(value)).hex()}
    if isinstance(value, str):
        return {"kind": "string", "units": [ord(char) for char in value]}
    if isinstance(value, list):
        return {"kind": "array", "items": [wire(item) for item in value]}
    if isinstance(value, dict):
        return {"kind": "object", "members": [
            {"key": [ord(char) for char in key], "value": wire(item)}
            for key, item in value.items()
        ]}
    raise TypeError(type(value))


path = os.environ["UMF_PARQUET_ENCODE_PYTHON_EXTENSION"]
spec = importlib.util.spec_from_file_location("_rust_core", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
value = {"kind": "struct", "fields": [{"id": 1, "value": {"kind": "bool", "value": True}}]}
request = wire({"op": "parquet.encodeWire", "value": value})
response = json.loads(module.execute_parquet_capture_wire(json.dumps(request)))
assert response["status"] == "ok", response
assert "".join(map(chr, json.loads(response["wire"])["units"])) == "1100"
unknown = {"kind": "bool", "value": True, "\ud800": 1}
response = json.loads(module.execute_parquet_capture_wire(json.dumps(wire({"op": "parquet.encodeWire", "value": unknown}))))
assert response["code"] == "PARQUET_WIRE_ENCODE", response
assert "".join(map(chr, response["messageUnits"])) == "Unknown wire representation fields cannot be discarded"
print(json.dumps({"status": "passed", "profile": module.parquet_capture_profile_version(), "cases": 2}))
