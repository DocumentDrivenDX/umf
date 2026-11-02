# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for bounded Parquet source and metadata inspection."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r8-parquet-capture-inspection/0.1.0"
_MAX_SOURCE_BYTES = 1_000_000


def profile_version() -> str:
    return _rust._rust_core.parquet_capture_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Parquet capture profile mismatch")
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"op": f"parquet.{op}", **fields}
    wire = json.dumps(_rust._wire(request, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    response_text = (
        _rust._rust_core.execute_parquet_capture_wire(wire, charge)
        if has_controls
        else _rust._rust_core.execute_parquet_capture_wire(wire)
    )
    host_work(len(response_text))
    try:
        envelope = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust response") from error
    if type(envelope) is not dict or envelope.get("profile") != "umf.core-wire/1":
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    if envelope.get("status") == "error":
        _rust._raise_native(ValueError(response_text))
    if envelope.get("status") != "ok" or type(envelope.get("wire")) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    host_work(len(envelope["wire"]))
    try:
        return _rust._from_wire(json.loads(envelope["wire"]), host_work)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust tagged value") from error


def capture(source: bytes, document_id: str, **controls):
    """Capture an owned copy of source bytes, including malformed or unknown files."""
    if type(source) is not bytes:
        raise TypeError("source must be bytes")
    if len(source) > _MAX_SOURCE_BYTES:
        raise _rust.UmfCoreError("PARQUET_LIMIT", "Expected at most 1000000 source bytes")
    if type(document_id) is not str:
        raise _rust.UmfCoreError("PARQUET_CAPTURE", "Invalid Parquet capture envelope")
    return _call("capture", {"bytes": source.hex(), "id": document_id}, **controls)


def export(document: Any, **controls) -> bytes:
    """Return a fresh copy of the exact captured bytes."""
    result = _call("export", {"document": document}, **controls)
    if type(result) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Parquet export was not hexadecimal text")
    try:
        return bytes.fromhex(result)
    except ValueError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Parquet export was malformed") from error


def import_schema(source: bytes, document_id: str, **controls):
    """Capture bytes and materialize core fields after checked metadata inspection."""
    if type(source) is not bytes:
        raise TypeError("source must be bytes")
    if len(source) > _MAX_SOURCE_BYTES:
        raise _rust.UmfCoreError("PARQUET_LIMIT", "Expected at most 1000000 source bytes")
    if type(document_id) is not str:
        raise _rust.UmfCoreError("PARQUET_CAPTURE", "Invalid Parquet capture envelope")
    return _call("importSchema", {"bytes": source.hex(), "id": document_id}, **controls)


def inspect_framing(document: Any, **controls):
    return _call("inspectFraming", {"document": document}, **controls)


def decode_footer(document: Any, **controls):
    return _call("decodeFooter", {"document": document}, **controls)


def inspect_metadata(document: Any, **controls):
    return _call("inspectMetadata", {"document": document}, **controls)


def inspect_schema(document: Any, **controls):
    return _call("inspectSchema", {"document": document}, **controls)


def inspect_pages(document: Any, **controls):
    return _call("inspectPages", {"document": document}, **controls)


def decode_page_bodies(document: Any, **controls):
    return _call("decodePageBodies", {"document": document}, **controls)


def decode_levels(document: Any, **controls):
    return _call("decodeLevels", {"document": document}, **controls)


def decode_physical(document: Any, **controls):
    return _call("decodePhysical", {"document": document}, **controls)


def decode_values(document: Any, **controls):
    return _call("decodeValues", {"document": document}, **controls)


def assemble_rows(document: Any, **controls):
    return _call("assembleRows", {"document": document}, **controls)


def repair_dictionary_offsets(document: Any, **controls):
    return _call("repairDictionaryOffsets", {"document": document}, **controls)


def inspect_logical_types(document: Any, **controls):
    return _call("inspectLogicalTypes", {"document": document}, **controls)


def inspect_containers(document: Any, **controls):
    return _call("inspectContainers", {"document": document}, **controls)


def get_field_metadata(document: Any, **controls):
    return _call("getFieldMetadata", {"document": document}, **controls)



def append_key_value_metadata(document: Any, entries: Any, **controls):
    """Append metadata through the Rust footer editor, preserving source bytes."""
    return _call("appendKeyValueMetadata", {"document": document, "entries": entries}, **controls)


def rename_field(document: Any, index: Any, name: Any, **controls):
    """Rename a native schema field through the shared Rust operation."""
    return _call("renameField", {"document": document, "index": index, "name": name}, **controls)
