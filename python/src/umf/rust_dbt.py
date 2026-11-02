# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the bounded dbt artifact operations."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r9-dbt-preservation/0.1.0"


def profile_version() -> str:
    return _rust._rust_core.dbt_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core dbt profile mismatch")
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"profile": _PROFILE, "op": f"dbt.{op}", **fields}
    wire = json.dumps(_rust._wire(request, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    response_text = (
        _rust._rust_core.execute_dbt_wire(wire, charge)
        if has_controls
        else _rust._rust_core.execute_dbt_wire(wire)
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


def _text(value: Any, label: str) -> None:
    if type(value) is not str:
        raise TypeError(f"{label} must be str")


def _import(op: str, source: str, options: dict[str, Any], **controls):
    _text(source, "source")
    if type(options) is not dict or type(options.get("id")) is not str:
        raise _rust.UmfCoreError("REQUEST", "options.id must be a string")
    return _call(op, {"text": source, "options": options}, **controls)


def import_manifest(source: str, options: dict[str, Any], **controls):
    return _import("importManifest", source, options, **controls)


def export_manifest(document: Any, **controls):
    return _call("exportManifest", {"document": document}, **controls)


def inspect_manifest(document: Any, **controls):
    return _call("inspectManifest", {"document": document}, **controls)


def get_manifest_node(document: Any, path: str, **controls):
    _text(path, "path")
    return _call("getManifestNode", {"document": document, "path": path}, **controls)


def propose_manifest_node_edit(document: Any, path: str, source: str, **controls):
    _text(path, "path")
    _text(source, "replacement")
    return _call("editManifest", {"document": document, "path": path, "text": source}, **controls)


def import_artifact(source: str, options: dict[str, Any], **controls):
    return _import("importArtifact", source, options, **controls)


def export_artifact(document: Any, **controls):
    return _call("exportArtifact", {"document": document}, **controls)


def inspect_artifact(document: Any, **controls):
    return _call("inspectArtifact", {"document": document}, **controls)


def get_artifact_node(document: Any, path: str, **controls):
    _text(path, "path")
    return _call("getArtifactNode", {"document": document, "path": path}, **controls)


def propose_artifact_node_edit(document: Any, path: str, source: str, **controls):
    _text(path, "path")
    _text(source, "replacement")
    return _call("editArtifact", {"document": document, "path": path, "text": source}, **controls)


def import_semantic_manifest(source: str, options: dict[str, Any], **controls):
    return _import("importSemanticManifest", source, options, **controls)


def export_semantic_manifest(document: Any, **controls):
    return _call("exportSemanticManifest", {"document": document}, **controls)


def inspect_semantic_manifest(document: Any, **controls):
    return _call("inspectSemanticManifest", {"document": document}, **controls)


def get_semantic_manifest_node(document: Any, path: str, **controls):
    _text(path, "path")
    return _call("getSemanticManifestNode", {"document": document, "path": path}, **controls)


def propose_semantic_manifest_node_edit(document: Any, path: str, source: str, **controls):
    _text(path, "path")
    _text(source, "replacement")
    return _call("editSemanticManifest", {"document": document, "path": path, "text": source}, **controls)


def inspect_manifest_graph(document: Any, **controls):
    return _call("inspectManifestGraph", {"document": document}, **controls)


def select_manifest_dependencies(document: Any, options: Any, **controls):
    return _call("selectManifestDependencies", {"document": document, "options": options}, **controls)
