from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel
from umf import _rust
from umf_access.capture import CaptureError, capture
from umf_access.dsl import Column, FieldRef, Param, Query, RecordRef, query
from umf_access.dsl._nodes import GeneratedSource
from umf_access import rust_catalog_render

IDENTITY = {
    "documentId": "parity-doc",
    "coreVersion": "0.10.0",
    "module": "commerce",
    "element": "Order",
    "key": "Order_key",
}

class OrderKey(BaseModel):
    id: str
    KEY_IDENTITY: ClassVar[dict[str, str]] = IDENTITY

class ForeignKey(BaseModel):
    id: str
    KEY_IDENTITY: ClassVar[dict[str, str]] = {**IDENTITY, "module": "other"}

class OtherOrderKey(BaseModel):
    id: str
    KEY_IDENTITY: ClassVar[dict[str, str]] = {**IDENTITY, "key": "Other_key"}

_ID = FieldRef(module="commerce", element="Order", field="id")
_SOURCE = GeneratedSource(
    document_id="parity-doc",
    core_version="0.10.0",
    document_sha256="0" * 64,
    input_digest="1" * 64,
    runtime_abi="umf-access-runtime/0.1",
)
_QUERY = Query(RecordRef(
    module="commerce", element="Order", key=(_ID,), key_id="Order_key", source=_SOURCE
))
_COLUMN = Column(_ID)

@query
def get_valid(key: Param[OrderKey]):
    return _QUERY.get(key)

@query
def page_valid(after: Param[OrderKey | None]):
    return _QUERY.page(size=3, after=after)

@query
def get_foreign_key(key: Param[ForeignKey]):
    return _QUERY.get(key)

@query
def get_wrong_selected_key(key: Param[OtherOrderKey]):
    return _QUERY.get(key)

@query
def get_empty_identity(key: Param[str]):
    return _QUERY.get(key)

@query
def get_wrong_key_before_undeclared_expression(key: Param[ForeignKey]):
    return _QUERY.filter(_COLUMN == Param("ghost")).get(key)

@query
def get_valid_key_before_undeclared_expression(key: Param[OrderKey]):
    return _QUERY.filter(_COLUMN == Param("ghost")).get(key)

@query
def page_wrong_key_before_undeclared_expression(after: Param[ForeignKey | None]):
    return _QUERY.filter(_COLUMN == Param("ghost")).page(size=3, after=after)


def outcome(fn):
    try:
        return ("accepted", capture(fn))
    except CaptureError as error:
        return ("refused", error.code, str(error))


def compare(name, fn, expected):
    public = outcome(fn)
    native = None
    native_capture = None
    try:
        native_capture = rust_catalog_render.capture_with_rust_graph_validator(fn)
        native = ("accepted",)
    except CaptureError as error:
        native = ("refused", error.code, str(error))
    public_result = (public[0],) if public[0] == "accepted" else public
    assert public_result == native, (name, public_result, native)
    shape_equal = public[0] != "accepted" or public[1] == native_capture
    assert shape_equal, (name, "captured declaration differs")
    if expected is not None:
        assert public_result == expected, (name, public_result, expected)
    return {"case": name, "public": public_result, "native": native, "shape_equal": shape_equal}

assert hasattr(_rust._rust_core, "access_validate_captured_graph_variant")
extension = Path(_rust._rust_core.__file__)
results = [
    compare("get-valid-key-parameter", get_valid, ("accepted",)),
    compare("page-valid-key-parameter", page_valid, ("accepted",)),
    compare("get-foreign-module-refusal", get_foreign_key, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: Key belongs to another Record")),
    compare("get-selected-record-key-refusal", get_wrong_selected_key, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: Key differs from selected Record Key")),
    compare("get-empty-identity-refusal", get_empty_identity, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: Key differs from selected Record Key")),
    compare("get-key-refusal-precedes-expression-parameter-refusal", get_wrong_key_before_undeclared_expression, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: Key belongs to another Record")),
    compare("get-expression-refusal-after-valid-key", get_valid_key_before_undeclared_expression, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: expression references an undeclared parameter")),
    compare("page-key-refusal-precedes-expression-parameter-refusal", page_wrong_key_before_undeclared_expression, ("refused", "CAPTURE_SIGNATURE", "CAPTURE_SIGNATURE: Key belongs to another Record")),
]
print(json.dumps({
    "extension": str(extension),
    "extension_sha256": hashlib.sha256(extension.read_bytes()).hexdigest(),
    "cases": results,
    "passed": len(results),
}, indent=2))
