# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from .models import *
from .keys import *
from umf_access.codec_support import CodecField, encode_model, decode_model

_codec_DocCreate: tuple[CodecField, ...] = ({"python": "id", "field": "id", "kind": "identity", "item": None}, {"python": "body", "field": "body", "kind": "identity", "item": None}, {"python": "embedding", "field": "embedding", "kind": "identity", "item": {"python": "component", "field": "component", "kind": "identity", "item": None}},)
def encode_Doc_create(value: DocCreate) -> dict[str, object]:
    return encode_model(DocCreate, value, _codec_DocCreate)

_codec_DocPatch: tuple[CodecField, ...] = ({"python": "body", "field": "body", "kind": "identity", "item": None}, {"python": "embedding", "field": "embedding", "kind": "identity", "item": {"python": "component", "field": "component", "kind": "identity", "item": None}},)
def encode_Doc_patch(value: DocPatch) -> dict[str, object]:
    return encode_model(DocPatch, value, _codec_DocPatch)

_codec_Doc: tuple[CodecField, ...] = ({"python": "id", "field": "id", "kind": "identity", "item": None}, {"python": "body", "field": "body", "kind": "identity", "item": None}, {"python": "embedding", "field": "embedding", "kind": "identity", "item": {"python": "component", "field": "component", "kind": "identity", "item": None}},)
def decode_Doc(columns: list[str], row: list[object]) -> Doc:
    return decode_model(Doc, columns, row, _codec_Doc)

_codec_DocSummary: tuple[CodecField, ...] = ({"python": "id", "field": "id", "kind": "identity", "item": None}, {"python": "body", "field": "body", "kind": "identity", "item": None},)
def decode_DocSummary(columns: list[str], row: list[object]) -> DocSummary:
    return decode_model(DocSummary, columns, row, _codec_DocSummary)
