# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from .models import *
from .keys import *
from umf_access.codec_support import CodecField, encode_model, decode_model

_codec_MetricCreate: tuple[CodecField, ...] = ({"python": "id", "field": "Metric_id", "kind": "identity", "item": None}, {"python": "big", "field": "Metric_big", "kind": "identity", "item": None}, {"python": "amount", "field": "Metric_amount", "kind": "identity", "item": None}, {"python": "label", "field": "Metric_label", "kind": "identity", "item": None}, {"python": "active", "field": "Metric_active", "kind": "identity", "item": None},)
def encode_Metric_create(value: MetricCreate) -> dict[str, object]:
    return encode_model(MetricCreate, value, _codec_MetricCreate)

_codec_MetricPatch: tuple[CodecField, ...] = ({"python": "big", "field": "Metric_big", "kind": "identity", "item": None}, {"python": "amount", "field": "Metric_amount", "kind": "identity", "item": None}, {"python": "label", "field": "Metric_label", "kind": "identity", "item": None}, {"python": "active", "field": "Metric_active", "kind": "identity", "item": None},)
def encode_Metric_patch(value: MetricPatch) -> dict[str, object]:
    return encode_model(MetricPatch, value, _codec_MetricPatch)

_codec_Metric: tuple[CodecField, ...] = ({"python": "id", "field": "Metric_id", "kind": "identity", "item": None}, {"python": "big", "field": "Metric_big", "kind": "identity", "item": None}, {"python": "amount", "field": "Metric_amount", "kind": "identity", "item": None}, {"python": "label", "field": "Metric_label", "kind": "identity", "item": None}, {"python": "active", "field": "Metric_active", "kind": "identity", "item": None},)
def decode_Metric(columns: list[str], row: list[object]) -> Metric:
    return decode_model(Metric, columns, row, _codec_Metric)
