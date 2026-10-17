# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from .models import *
from .keys import *
from umf_access.codec_support import CodecField, encode_model, decode_model

_codec_OrderCreate: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None}, {"python": "placed_at", "field": "placedAt", "kind": "instant", "item": None}, {"python": "revision", "field": "revision", "kind": "identity", "item": None}, {"python": "parent_id", "field": "parentId", "kind": "identity", "item": None}, {"python": "peer_id", "field": "peerId", "kind": "identity", "item": None}, {"python": "optional_peer_id", "field": "optionalPeerId", "kind": "identity", "item": None},)
def encode_Order_create(value: OrderCreate) -> dict[str, object]:
    return encode_model(OrderCreate, value, _codec_OrderCreate)

_codec_OrderPatch: tuple[CodecField, ...] = ({"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None}, {"python": "parent_id", "field": "parentId", "kind": "identity", "item": None}, {"python": "peer_id", "field": "peerId", "kind": "identity", "item": None}, {"python": "optional_peer_id", "field": "optionalPeerId", "kind": "identity", "item": None},)
def encode_Order_patch(value: OrderPatch) -> dict[str, object]:
    return encode_model(OrderPatch, value, _codec_OrderPatch)

_codec_Order: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None}, {"python": "placed_at", "field": "placedAt", "kind": "instant", "item": None}, {"python": "revision", "field": "revision", "kind": "identity", "item": None}, {"python": "parent_id", "field": "parentId", "kind": "identity", "item": None}, {"python": "peer_id", "field": "peerId", "kind": "identity", "item": None}, {"python": "optional_peer_id", "field": "optionalPeerId", "kind": "identity", "item": None},)
def decode_Order(columns: list[str], row: list[object]) -> Order:
    return decode_model(Order, columns, row, _codec_Order)
