# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust wire facade for the implemented RDF dataset kernels."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r9-rdf-preservation/0.1.0"


def profile_version() -> str:
    return _rust._rust_core.rdf_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core RDF profile mismatch")
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"profile": _PROFILE, "op": f"rdf.{op}", **fields}
    wire = json.dumps(_rust._wire(request, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    response_text = (
        _rust._rust_core.execute_rdf_wire(wire, charge)
        if has_controls
        else _rust._rust_core.execute_rdf_wire(wire)
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


def inspect_rdf_document(document: Any, **controls):
    return _call("inspect", {"document": document}, **controls)


def import_rdf_nquads(source: str, options: dict[str, Any], **controls):
    return _call("importNQuads", {"source": source, "options": options}, **controls)


def get_rdf_quads(document: Any, **controls):
    return _call("getQuads", {"document": document}, **controls)


def export_rdf_nquads(document: Any, options: dict[str, Any] | None = None, **controls):
    fields = {"document": document}
    if options is not None:
        fields["options"] = options
    return _call("exportNQuads", fields, **controls)


def propose_rdf_quad_edit(document: Any, index: int, replacement: Any, **controls):
    return _call("editQuad", {"document": document, "index": index,
                               "replacement": replacement}, **controls)


def propose_rdf_iri_rename(document: Any, options: dict[str, Any], **controls):
    return _call("renameIri", {"document": document, "options": options}, **controls)


def import_rdf_turtle(source: str, options: dict[str, Any], **controls):
    return _call("importTurtle", {"source": source, "options": options}, **controls)


def export_rdf_turtle(document: Any, **controls):
    return _call("exportTurtle", {"document": document}, **controls)


def get_rdf_named_graphs(document: Any, **controls):
    return _call("getNamedGraphs", {"document": document}, **controls)


def import_rdf_trig(source: str, options: dict[str, Any], **controls):
    return _call("importTriG", {"source": source, "options": options}, **controls)


def export_rdf_trig(document: Any, **controls):
    return _call("exportTriG", {"document": document}, **controls)


def propose_rdf_dataset_merge(documents: list[Any], options: dict[str, Any], **controls):
    return _call("mergeDatasets", {"documents": documents, "options": options}, **controls)


def inspect_generalized_rdf_document(document: Any, **controls):
    return _call("inspectGeneralized", {"document": document}, **controls)


def import_generalized_rdf_dataset(source: str, options: dict[str, Any], **controls):
    return _call("importGeneralizedDataset", {"source": source, "options": options}, **controls)


def export_generalized_rdf_dataset(document: Any, **controls):
    return _call("exportGeneralizedDataset", {"document": document}, **controls)


def get_generalized_rdf_quads(document: Any, **controls):
    return _call("getGeneralizedQuads", {"document": document}, **controls)


def propose_generalized_rdf_quad_edit(document: Any, index: int, replacement: Any, **controls):
    return _call("editGeneralizedQuad", {"document": document, "index": index,
                                          "replacement": replacement}, **controls)
